import { create } from 'zustand'
import { countDiffLines, type LineDelta } from '../lib/diff-stats'
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

/** State and actions for the open repository's per-section diffs. */
export interface DiffStoreState {
  /** Selected file, or `null` when nothing is open (the empty state). */
  selected: DiffSelection | null
  /** Loaded diff for the selection, or `null` if it has none / not loaded. */
  diff: DiffFile | null
  /** Loading lifecycle of {@link DiffStoreState.diff}. */
  phase: DiffPhase
  /** Message from the last failed load, else `null`. */
  error: string | null
  /**
   * Per-file `+N −N` magnitude per section, keyed by path — the sidebar's change
   * signal. Derived from the very section diffs the panel renders (never a second
   * backend pass), and kept referentially stable per path so an unchanged row's
   * `RowEnd` selector does not re-render.
   */
  counts: Record<DiffSection, Record<string, LineDelta>>
  /**
   * Fetch both sections' diffs for `repoRoot` — the single read that feeds the
   * panel and the sidebar counts at once. Re-derives the open file's diff from
   * the fresh content; a read failure surfaces in the panel only when a file is
   * open, otherwise the counts simply stay absent.
   */
  load: (repoRoot: string) => Promise<void>
  /** Open `selection` in the panel, resolved from the loaded sections; if its
   * section is not loaded and no load is running, fetch it. */
  select: (repoRoot: string, selection: DiffSelection) => void
  /** Re-align the selection with a fresh `status` (following a stage/unstage),
   * then reload both sections. */
  reconcile: (repoRoot: string, status: RepoStatus) => void
  /** Close the panel. */
  clear: () => void
  /** Reset to the empty state and drop the cache — when the open repo changes. */
  reset: () => void
}

/**
 * Monotonic request token: only the latest {@link DiffStoreState.load} commits,
 * so a slow read (or one from a previous repo) can't overwrite newer diffs.
 * {@link DiffStoreState.reset} bumps it too, so an in-flight load from a previous
 * repo can't commit after the repo changed.
 */
let token = 0

/**
 * The highest token whose load has settled. A load is in flight exactly while
 * `token > settled` — which lets {@link DiffStoreState.select} avoid re-firing a
 * load that is already running, yet still trigger one to self-heal after a load
 * has failed.
 */
let settled = 0

/**
 * The last-fetched diffs per section — the source of truth for both the panel
 * (look up the selected file) and the counts. A diff command returns the whole
 * section at once, so once loaded, switching between files in it is a synchronous
 * lookup. Keyed only by section, so it is dropped on every reload ({@link
 * DiffStoreState.load}) and repo switch ({@link DiffStoreState.reset}), never
 * serving one repo's diff for another's same-named file.
 */
const sectionCache: Record<DiffSection, readonly DiffFile[] | null> = {
  staged: null,
  unstaged: null,
}

const EMPTY_COUNTS: Record<DiffSection, Record<string, LineDelta>> = { staged: {}, unstaged: {} }

/**
 * Indexes a section's per-file line counts by path, **reusing the previous
 * load's {@link LineDelta} object** whenever a path's counts are unchanged — so
 * every unchanged row keeps a stable `RowEnd` selector and only genuinely-changed
 * rows re-render after a reload.
 */
function indexCounts(
  files: readonly DiffFile[],
  prev: Record<string, LineDelta>,
): Record<string, LineDelta> {
  const next: Record<string, LineDelta> = {}
  for (const file of files) {
    const delta = countDiffLines(file)
    const existing = prev[file.path]
    next[file.path] =
      existing && existing.add === delta.add && existing.del === delta.del ? existing : delta
  }
  return next
}

/** The diff to show for `selected`, looked up in the loaded section cache. */
function diffFor(selected: DiffSelection | null): DiffFile | null {
  if (!selected) {
    return null
  }
  return sectionCache[selected.section]?.find((file) => file.path === selected.path) ?? null
}

/**
 * Store for the diff panel and the sidebar counts: it loads both review sections'
 * diffs in one read, caches them, derives the per-file `+N −N` counts from those
 * same diffs (never a second backend pass), and resolves the open file's diff by
 * path. {@link DiffStoreState.reconcile} keeps the selection meaningful after the
 * status changes — following a file across sections when it is staged or
 * unstaged, closing the panel when the queue is burned down or the file is gone.
 */
export const useDiffStore = create<DiffStoreState>((set, get) => ({
  selected: null,
  diff: null,
  phase: 'idle',
  error: null,
  counts: EMPTY_COUNTS,

  load: async (repoRoot) => {
    const current = ++token
    // Settle the two sections independently: a read failure in one section must
    // not discard the other's diffs or counts (`allSettled`, not `all`).
    const [unstaged, staged] = await Promise.allSettled([
      diffUnstaged(repoRoot),
      diffStaged(repoRoot),
    ])
    if (current > settled) {
      settled = current
    }
    if (current !== token) {
      return
    }
    if (unstaged.status === 'fulfilled') {
      sectionCache.unstaged = unstaged.value
    }
    if (staged.status === 'fulfilled') {
      sectionCache.staged = staged.value
    }
    set((state) => {
      const counts = {
        unstaged:
          unstaged.status === 'fulfilled'
            ? indexCounts(unstaged.value, state.counts.unstaged)
            : state.counts.unstaged,
        staged:
          staged.status === 'fulfilled'
            ? indexCounts(staged.value, state.counts.staged)
            : state.counts.staged,
      }
      const selected = state.selected
      if (!selected) {
        return { counts }
      }
      // Re-derive the open file's diff from its (now refreshed) section. If that
      // section is the one that failed to read, surface the error in the panel;
      // the other section's diffs and counts are unaffected.
      const own = selected.section === 'unstaged' ? unstaged : staged
      return own.status === 'rejected'
        ? { counts, phase: 'error' as DiffPhase, error: toMessage(own.reason), diff: null }
        : { counts, diff: diffFor(selected), phase: 'ready' as DiffPhase, error: null }
    })
  },

  select: (repoRoot, selection) => {
    const cached = sectionCache[selection.section]
    set({
      selected: selection,
      error: null,
      // Resolve instantly from the loaded section.
      diff: cached ? (cached.find((file) => file.path === selection.path) ?? null) : null,
      phase: cached ? 'ready' : 'loading',
    })
    // The section isn't loaded: a load in flight will land it; otherwise (e.g.
    // the initial load failed) fetch it now, so a click always recovers rather
    // than parking on a stale "loading".
    if (!cached && token === settled) {
      void get().load(repoRoot)
    }
  },

  reconcile: (repoRoot, status) => {
    const { selected } = get()
    if (selected) {
      const inStaged = status.staged.some((entry) => entry.path === selected.path)
      const inUnstaged = status.unstaged.some((entry) => entry.path === selected.path)
      // Stay in the current section while the file is still there (its content
      // may have changed — the reload below re-reads it); otherwise follow it to
      // the section it moved to; on a burn-down (the last queued file was just
      // validated, emptying "À reviewer") close the panel so the empty pane shows
      // the completion beat; otherwise the file is gone, so close.
      if (selected.section === 'staged' && inStaged) {
        // keep the staged selection
      } else if (selected.section === 'unstaged' && inUnstaged) {
        // keep the unstaged selection
      } else if (inStaged) {
        if (status.unstaged.length === 0) {
          set({ selected: null, diff: null, phase: 'idle', error: null })
        } else {
          set({ selected: { section: 'staged', path: selected.path } })
        }
      } else if (inUnstaged) {
        set({ selected: { section: 'unstaged', path: selected.path } })
      } else {
        set({ selected: null, diff: null, phase: 'idle', error: null })
      }
    }
    // Reload both sections: refresh the counts and re-derive the (re-aligned)
    // open file's diff from fresh content.
    void get().load(repoRoot)
  },

  clear: () => set({ selected: null, diff: null, phase: 'idle', error: null }),

  reset: () => {
    // Supersede any in-flight load so it can't commit against the new repo, and
    // mark it settled — no load is running until the next open fires one.
    token += 1
    settled = token
    sectionCache.staged = null
    sectionCache.unstaged = null
    set({ selected: null, diff: null, phase: 'idle', error: null, counts: EMPTY_COUNTS })
  },
}))
