import { create } from 'zustand'
import {
  openRepo,
  type RepoInfo,
  type RepoStatus,
  readStatus,
  stageFile,
  unstageFile,
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
  /** Open `path` as the repository and load its status. */
  open: (path: string) => Promise<void>
  /** Re-read the status of the currently open repository. No-op if none. */
  refresh: () => Promise<void>
  /** Validate `file`: stage it, refresh, and re-align the diff selection. */
  stage: (file: string) => Promise<void>
  /** Un-validate `file`: unstage it, refresh, and re-align the diff selection. */
  unstage: (file: string) => Promise<void>
}

/**
 * Monotonic request token. {@link RepoStoreState.open} and
 * {@link RepoStoreState.refresh} bump it and commit only while still the latest
 * in flight, so a slow response can't clobber a newer one.
 */
let requestToken = 0

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

  open: async (path) => {
    const token = ++requestToken
    set({ phase: 'loading', error: null })
    try {
      const [info, status] = await Promise.all([openRepo(path), readStatus(path)])
      if (token !== requestToken) return
      set({ phase: 'ready', info, status })
    } catch (error) {
      if (token !== requestToken) return
      set({ phase: 'error', info: null, status: null, error: toMessage(error) })
    }
  },

  refresh: async () => {
    const { info } = get()
    if (!info) {
      return
    }
    const token = ++requestToken
    try {
      const status = await readStatus(info.root)
      if (token !== requestToken) return
      set({ status, phase: 'ready', error: null })
    } catch (error) {
      if (token !== requestToken) return
      // Keep the repo open on a failed re-read; surface the error inline.
      set({ error: toMessage(error) })
    }
  },

  stage: (file) => mutateIndex(get, set, stageFile, file),
  unstage: (file) => mutateIndex(get, set, unstageFile, file),
}))

/**
 * Runs an index write (`stage`/`unstage`) for `file`, then refreshes the status
 * and re-aligns the diff selection so the panel follows the file across
 * sections. A failure surfaces inline without disturbing the open repo.
 */
async function mutateIndex(
  get: () => RepoStoreState,
  set: (partial: Partial<RepoStoreState>) => void,
  write: (root: string, file: string) => Promise<void>,
  file: string,
): Promise<void> {
  const { info } = get()
  if (!info) {
    return
  }
  try {
    await write(info.root, file)
    await get().refresh()
    const { status } = get()
    if (status) {
      useDiffStore.getState().reconcile(info.root, status)
    }
  } catch (error) {
    set({ error: toMessage(error) })
  }
}

/** Normalize an unknown thrown value to a message string. */
function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
