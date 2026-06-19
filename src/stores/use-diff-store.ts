import { create } from 'zustand'
import { toMessage } from '../lib/error'
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
  /** Close the panel. */
  clear: () => void
  /** Reset to the empty state and drop the cache — when the open repo changes. */
  reset: () => void
}

/**
 * Monotonic request token, mirroring {@link useRepoStore}: {@link
 * DiffStoreState.select} bumps it and commits only while still the latest in
 * flight, so a slow diff load can't clobber a newer selection. {@link
 * DiffStoreState.reset} bumps it too, so an in-flight load from a previous repo
 * can't commit after the repo changed.
 */
let requestToken = 0

/**
 * Per-section cache of the last fetched diffs. A diff command computes the whole
 * section at once, so once fetched, switching between files in that section is a
 * synchronous lookup — no repeated backend round-trip. It is keyed only by
 * section, so it is dropped whenever the working tree ({@link
 * DiffStoreState.reconcile}) or the open repository ({@link DiffStoreState.reset})
 * changes, never serving one repo's diff for another's same-named file.
 */
const sectionCache: Record<DiffSection, readonly DiffFile[] | null> = {
  staged: null,
  unstaged: null,
}

/** Drops both cached section diffs. */
function clearSectionCache(): void {
  sectionCache.staged = null
  sectionCache.unstaged = null
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

    // Cache miss: keep the current diff only while reloading the *same* file (its
    // content may have changed); clear it when switching files, so the panel
    // never shows the previous file's diff under the new selection's path.
    const previous = get().diff
    set({ phase: 'loading', diff: previous?.path === selection.path ? previous : null })
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
    // The working tree changed: drop the cached section diffs so the re-aligned
    // selection re-reads fresh content instead of a stale cache hit.
    clearSectionCache()

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

  clear: () => set({ selected: null, diff: null, phase: 'idle', error: null }),

  reset: () => {
    clearSectionCache()
    // Supersede any in-flight load so it can't commit against the new repo.
    requestToken += 1
    set({ selected: null, diff: null, phase: 'idle', error: null })
  },
}))
