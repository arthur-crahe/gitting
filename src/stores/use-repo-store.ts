import { create } from 'zustand'
import { toMessage } from '../lib/error'
import {
  openRepo,
  pickRepoDirectory,
  type RepoInfo,
  type RepoStatus,
  readStatus,
  stageFile,
  unstageFile,
} from '../lib/git'
import { useDiffStore } from './use-diff-store'
import { useStatsStore } from './use-stats-store'

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
  /** Open `path` as the repository and load its status. */
  open: (path: string) => Promise<void>
  /** Prompt for a directory and {@link RepoStoreState.open} it. No-op if cancelled. */
  openViaDialog: () => Promise<void>
  /** Re-read the status of the currently open repository. No-op if none. */
  refresh: () => Promise<void>
  /** Validate `file`: stage it, refresh, and re-align the diff selection. */
  stage: (file: string) => Promise<void>
  /** Un-validate `file`: unstage it, refresh, and re-align the diff selection. */
  unstage: (file: string) => Promise<void>
}

/**
 * Monotonic request tokens, one per action: each of {@link RepoStoreState.open}
 * and {@link RepoStoreState.refresh} commits only while still the latest of its
 * own kind in flight, so a slow response can't clobber a newer one — and a
 * refresh never cancels an in-flight open (they no longer share a counter).
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

  open: async (path) => {
    const token = ++openToken
    set({ phase: 'loading', error: null })
    try {
      const [info, status] = await Promise.all([openRepo(path), readStatus(path)])
      if (token !== openToken) return
      // A different repository is now under review: drop the previous one's
      // selection, diff cache and change counts so nothing leaks across the switch.
      useDiffStore.getState().reset()
      useStatsStore.getState().reset()
      set({ phase: 'ready', info, status, pendingPaths: new Set() })
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

  stage: (file) => mutateIndex(get, set, stageFile, file),
  unstage: (file) => mutateIndex(get, set, unstageFile, file),
}))

/**
 * Runs an index write (`stage`/`unstage`) for `file`, then refreshes — which
 * re-aligns the selection so the panel follows the file across sections. The
 * file is marked pending for the duration so its row can disable/spin and a
 * second click is ignored; a failure surfaces inline without disturbing the repo.
 */
async function mutateIndex(
  get: () => RepoStoreState,
  set: (partial: Partial<RepoStoreState>) => void,
  write: (root: string, file: string) => Promise<void>,
  file: string,
): Promise<void> {
  const { info, pendingPaths } = get()
  if (!info || pendingPaths.has(file)) {
    return
  }
  set({ pendingPaths: new Set(pendingPaths).add(file) })
  try {
    await write(info.root, file)
    await get().refresh()
  } catch (error) {
    set({ error: toMessage(error) })
  } finally {
    const next = new Set(get().pendingPaths)
    next.delete(file)
    set({ pendingPaths: next })
  }
}
