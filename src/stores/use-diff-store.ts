import { create } from 'zustand'
import { type DiffFile, diffStaged, diffUnstaged, type RepoStatus } from '../lib/git'

/** Which review section a selected file belongs to. */
export type DiffSection = 'staged' | 'unstaged'

/** Lifecycle of the diff loaded for the selected file. */
export type DiffPhase = 'idle' | 'loading' | 'ready' | 'error'

/** The file open in the diff panel, and which section it was selected from. */
export interface DiffSelection {
  readonly section: DiffSection
  readonly path: string
}

/** State and actions for the file selected into the diff panel. */
export interface DiffStoreState {
  /** Selected file, or `null` when nothing is open (the empty state). */
  selected: DiffSelection | null
  /** Loaded diff for the selection, or `null` if it has none / not loaded. */
  diff: DiffFile | null
  /** Loading lifecycle of {@link DiffStoreState.diff}. */
  phase: DiffPhase
  /** Message from the last failed load, else `null`. */
  error: string | null
  /** Select `selection` and show its diff from the repo at `repoRoot`. */
  select: (repoRoot: string, selection: DiffSelection) => Promise<void>
  /** Re-align the selection with a fresh `status` after a stage/unstage/refresh. */
  reconcile: (repoRoot: string, status: RepoStatus) => void
  /** Drop the cached section diffs (call when the working tree changes). */
  invalidate: () => void
  /** Close the panel. */
  clear: () => void
}

/**
 * Monotonic request token, mirroring {@link useRepoStore}: {@link
 * DiffStoreState.select} bumps it and commits only while still the latest in
 * flight, so a slow diff load can't clobber a newer selection.
 */
let requestToken = 0

/**
 * Per-section cache of the last fetched diffs. A diff command computes the whole
 * section at once, so once fetched, switching between files in that section is a
 * synchronous lookup — no repeated backend round-trip. Invalidated whenever the
 * status changes ({@link DiffStoreState.invalidate}).
 */
const sectionCache: Record<DiffSection, readonly DiffFile[] | null> = {
  staged: null,
  unstaged: null,
}

/**
 * Store for the diff panel: which file is open and the diff loaded for it. The
 * diff is matched by path from the section's command output (never a re-diff),
 * cached per section so switching files is instant after the first fetch. {@link
 * DiffStoreState.reconcile} keeps the selection meaningful after the status
 * changes: it follows a file across sections when it is staged or unstaged, and
 * closes the panel when the file is gone.
 */
export const useDiffStore = create<DiffStoreState>((set, get) => ({
  selected: null,
  diff: null,
  phase: 'idle',
  error: null,

  select: async (repoRoot, selection) => {
    const token = ++requestToken
    set({ selected: selection, error: null })

    // Cache hit: resolve synchronously, no loading flash.
    const cached = sectionCache[selection.section]
    if (cached) {
      set({ diff: cached.find((file) => file.path === selection.path) ?? null, phase: 'ready' })
      return
    }

    set({ phase: 'loading' })
    try {
      const files =
        selection.section === 'staged' ? await diffStaged(repoRoot) : await diffUnstaged(repoRoot)
      // Guard the cache write too: a superseded request must not overwrite the
      // cache with its stale result.
      if (token !== requestToken) {
        return
      }
      sectionCache[selection.section] = files
      set({ diff: files.find((file) => file.path === selection.path) ?? null, phase: 'ready' })
    } catch (error) {
      if (token !== requestToken) {
        return
      }
      set({ diff: null, phase: 'error', error: toMessage(error) })
    }
  },

  reconcile: (repoRoot, status) => {
    const { selected } = get()
    if (!selected) {
      return
    }
    const inStaged = status.staged.some((entry) => entry.path === selected.path)
    const inUnstaged = status.unstaged.some((entry) => entry.path === selected.path)

    // Stay in the current section while the file is still there (its content may
    // have changed); otherwise follow it to the section it moved to; otherwise
    // it has been fully reviewed or removed, so close the panel.
    if (selected.section === 'staged' && inStaged) {
      void get().select(repoRoot, selected)
    } else if (selected.section === 'unstaged' && inUnstaged) {
      void get().select(repoRoot, selected)
    } else if (inStaged) {
      void get().select(repoRoot, { section: 'staged', path: selected.path })
    } else if (inUnstaged) {
      void get().select(repoRoot, { section: 'unstaged', path: selected.path })
    } else {
      get().clear()
    }
  },

  invalidate: () => {
    sectionCache.staged = null
    sectionCache.unstaged = null
  },

  clear: () => set({ selected: null, diff: null, phase: 'idle', error: null }),
}))

/** Normalize an unknown thrown value to a message string. */
function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
