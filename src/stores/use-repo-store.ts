import { create } from 'zustand'
import { toMessage } from '../lib/error'
import {
  discardPartial,
  type HunkSelection,
  openRepo,
  pickRepoDirectory,
  type RepoInfo,
  type RepoStatus,
  readStatus,
  stageFile,
  stageFiles,
  stagePartial,
  unstageFile,
  unstageFiles,
  unstagePartial,
} from '../lib/git'
import { useDiffStore } from './use-diff-store'

/** Lifecycle of the opened repository, surfaced to the UI. */
export type RepoPhase = 'empty' | 'loading' | 'ready' | 'error'

/** State and actions for opening a repository and reading its review status. */
export interface RepoStoreState {
  /** Current phase. */
  phase: RepoPhase
  /** Identity of the opened repository, or `null` before one is opened. */
  info: RepoInfo | null
  /** Latest status (the two review sections), or `null` before a read. */
  status: RepoStatus | null
  /** Human-readable message from the last failed open or refresh, else `null`. */
  error: string | null
  /** Paths with a stage/unstage write in flight, so rows can show progress. */
  pendingPaths: ReadonlySet<string>
  /**
   * Whether at least one file has been validated since this repository was
   * opened. Gates the "queue cleared" celebration so a repo opened already fully
   * staged (an agent's `git add`, a prior session) is not falsely congratulated.
   */
  reviewedHere: boolean
  /** Open `path` as the repository and load its status. */
  open: (path: string) => Promise<void>
  /** Prompt for a directory and {@link RepoStoreState.open} it. No-op if cancelled. */
  openViaDialog: () => Promise<void>
  /** Re-read the status of the currently open repository. No-op if none. */
  refresh: () => Promise<void>
  /**
   * Validate `file`: stage it, refresh, and re-align the diff selection. Resolves
   * to whether the validation was applied or is already in flight — `false` only
   * when there is no open repository or the index write failed, so a caller can
   * undo an optimistic advance.
   */
  stage: (file: string) => Promise<boolean>
  /** Un-validate `file`: unstage it, refresh, and re-align the diff selection.
   * Resolves like {@link RepoStoreState.stage}. */
  unstage: (file: string) => Promise<boolean>
  /**
   * Validate `files` in one batch ("tout valider"): stage them all, refresh once,
   * and re-align the diff. Resolves like {@link RepoStoreState.stage}.
   */
  stageMany: (files: readonly string[]) => Promise<boolean>
  /** Un-validate `files` in one batch ("tout dévalider"). Resolves like
   * {@link RepoStoreState.stageMany}. */
  unstageMany: (files: readonly string[]) => Promise<boolean>
  /**
   * Validate selected hunks of `file` ("valider ce hunk"): stage exactly
   * `selection`, then refresh — **always**, even on failure, so a stale-diff
   * rejection reloads the panel and the on-screen stale hunk disappears. Resolves
   * like {@link RepoStoreState.stage}.
   */
  stagePartial: (file: string, selection: readonly HunkSelection[]) => Promise<boolean>
  /** Un-validate selected staged hunks of `file` ("renvoyer ce hunk en review").
   * Resolves like {@link RepoStoreState.stagePartial}. */
  unstagePartial: (file: string, selection: readonly HunkSelection[]) => Promise<boolean>
  /**
   * Discard selected hunks/lines of `file` ("rejeter"): revert them in the
   * working tree. **Destructive** — the change is not recoverable. Refreshes even
   * on failure, like the other partial ops. Resolves like
   * {@link RepoStoreState.stagePartial}.
   */
  discardPartial: (file: string, selection: readonly HunkSelection[]) => Promise<boolean>
}

/**
 * Monotonic request tokens, one per action: each of {@link RepoStoreState.open}
 * and {@link RepoStoreState.refresh} commits only while still the latest of its
 * own kind in flight, so a slow response can't clobber a newer one. Separate
 * counters keep the two independent — a refresh can never cancel an in-flight open.
 */
let openToken = 0
let refreshToken = 0

/**
 * Store for the repository under review. Holds the opened repo's identity and
 * its status (unstaged "À reviewer" / staged "Validé"); {@link RepoStoreState.refresh}
 * re-reads after the working tree changes. A failed open moves the store to the
 * `'error'` phase (and clears the repo); a failed refresh keeps the repo open and
 * surfaces the message via {@link RepoStoreState.error} without leaving `'ready'`.
 */
export const useRepoStore = create<RepoStoreState>((set, get) => ({
  phase: 'empty',
  info: null,
  status: null,
  error: null,
  pendingPaths: new Set(),
  reviewedHere: false,

  open: async (path) => {
    const token = ++openToken
    set({ phase: 'loading', error: null })
    try {
      const [info, status] = await Promise.all([openRepo(path), readStatus(path)])
      if (token !== openToken) return
      // A different repository is now under review: drop the previous one's
      // selection and diff/count cache so nothing leaks across the switch.
      useDiffStore.getState().reset()
      set({ phase: 'ready', info, status, pendingPaths: new Set(), reviewedHere: false })
      // Load both sections' diffs once — the panel and the sidebar counts.
      void useDiffStore.getState().load(info.root)
    } catch (error) {
      if (token !== openToken) return
      set({ phase: 'error', info: null, status: null, error: toMessage(error) })
    }
  },

  openViaDialog: async () => {
    const path = await pickRepoDirectory()
    if (path) {
      await get().open(path)
    }
  },

  refresh: async () => {
    const { info } = get()
    if (!info) {
      return
    }
    const root = info.root
    const token = ++refreshToken
    try {
      const status = await readStatus(root)
      // Discard if superseded, or if the repo changed under us (a switch).
      if (token !== refreshToken || get().info?.root !== root) return
      set({ status, phase: 'ready', error: null })
      // The working tree changed: re-align the open diff (its content may have
      // changed, or it may have moved sections); reconcile drops the diff cache.
      useDiffStore.getState().reconcile(root, status)
    } catch (error) {
      if (token !== refreshToken || get().info?.root !== root) return
      // Keep the repo open on a failed re-read; surface the error inline.
      set({ error: toMessage(error) })
    }
  },

  stage: (file) => mutateIndex(get, set, (root) => stageFile(root, file), [file], true),
  unstage: (file) => mutateIndex(get, set, (root) => unstageFile(root, file), [file], false),
  stageMany: (files) => mutateIndex(get, set, stageFiles, files, true),
  unstageMany: (files) => mutateIndex(get, set, unstageFiles, files, false),
  stagePartial: (file, selection) =>
    mutateIndex(get, set, (root) => stagePartial(root, file, selection), [file], true, true),
  unstagePartial: (file, selection) =>
    mutateIndex(get, set, (root) => unstagePartial(root, file, selection), [file], false, true),
  discardPartial: (file, selection) =>
    mutateIndex(get, set, (root) => discardPartial(root, file, selection), [file], false, true),
}))

/**
 * Runs an index write over `files` (one file or a whole section), then re-reads
 * the status — which re-aligns the selection so the panel follows files across
 * sections. The single- and bulk-validate paths share this one body: the caller
 * supplies a write that targets the resolved paths (`stageFile` for one,
 * `stageFiles` for a batch).
 *
 * Files already mid-write are skipped, so a bulk write composes with an in-flight
 * single one; a duplicate with nothing left to do reports success without a `git`
 * call. The targeted files are marked pending for the duration so their rows
 * spin/disable and a repeat click is ignored. A validated (stage) write arms
 * {@link RepoStoreState.reviewedHere} so the completion beat only fires once work
 * was burned down in-session.
 *
 * The status is re-read even when a **multi-file** write fails: a batched write
 * can apply some files before erroring (see `index_write.rs`), so the sidebar
 * must reflect what actually landed rather than stay stale under the error
 * banner. A single-file write is atomic — nothing is staged on failure — so it
 * skips the redundant re-read and just surfaces the error, **unless**
 * `alwaysRefresh` is set: a partial (hunk) write rejects a stale selection, and
 * the panel must then reload so the on-screen stale hunk disappears.
 */
async function mutateIndex(
  get: () => RepoStoreState,
  set: (partial: Partial<RepoStoreState>) => void,
  write: (root: string, files: readonly string[]) => Promise<void>,
  files: readonly string[],
  validated: boolean,
  alwaysRefresh = false,
): Promise<boolean> {
  const { info, pendingPaths } = get()
  if (!info) {
    return false
  }
  // Drop files with a write already in flight; nothing left means it's underway.
  const target = files.filter((file) => !pendingPaths.has(file))
  if (target.length === 0) {
    return files.length > 0
  }
  const pending = new Set(pendingPaths)
  for (const file of target) {
    pending.add(file)
  }
  set({ pendingPaths: pending })

  let failure: string | null = null
  try {
    await write(info.root, target)
    if (validated) {
      set({ reviewedHere: true })
    }
  } catch (error) {
    failure = toMessage(error)
  }
  // Settle the pending marks regardless of outcome so the rows stop spinning.
  const cleared = new Set(get().pendingPaths)
  for (const file of target) {
    cleared.delete(file)
  }
  set({ pendingPaths: cleared })

  if (failure === null) {
    await get().refresh()
    return true
  }
  if (target.length > 1 || alwaysRefresh) {
    await get().refresh()
  }
  set({ error: failure })
  return false
}
