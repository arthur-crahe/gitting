import { create } from 'zustand'
import type { FileStat } from '../lib/diff-stats'
import { type DiffStatEntry, diffStats } from '../lib/git'
import type { DiffSection } from './use-diff-store'

/** Per-file `+N −N` change magnitude for each review section. */
export interface StatsStoreState {
  /** Add/remove counts keyed by path, per section (empty before a load). */
  stats: Record<DiffSection, Record<string, FileStat>>
  /** Load both sections' per-file counts from the repo at `root`. */
  load: (root: string) => Promise<void>
  /** Drop all counts — when the open repository changes. */
  reset: () => void
}

/**
 * Monotonic request token: only the latest {@link StatsStoreState.load} commits,
 * so a slow read (or one from a previous repo) can't overwrite newer counts.
 */
let token = 0

const EMPTY: Record<DiffSection, Record<string, FileStat>> = { staged: {}, unstaged: {} }

/**
 * Indexes a section's wire counts by path, **reusing the previous render's
 * {@link FileStat} object** whenever a path's counts are unchanged. Because
 * `RowEnd` subscribes to its own `stats[section][path]` by reference, this keeps
 * every unchanged row's selector stable so only genuinely-changed rows re-render
 * after a refresh.
 */
function indexStats(
  entries: readonly DiffStatEntry[],
  prev: Record<string, FileStat>,
): Record<string, FileStat> {
  const next: Record<string, FileStat> = {}
  for (const entry of entries) {
    const existing = prev[entry.path]
    next[entry.path] =
      existing && existing.add === entry.add && existing.del === entry.del
        ? existing
        : { add: entry.add, del: entry.del }
  }
  return next
}

/**
 * Store for the sidebar's per-file change magnitude (the `+N −N` GitButler-style
 * signal). The counts are **decorative metadata**: {@link StatsStoreState.load}
 * reads both sections' totals in one backend call (summed server-side from the
 * same gix diffs the panel renders, so only the totals cross the IPC boundary)
 * and indexes them by path; a failure is swallowed (the rows simply show no
 * counts) so it can never disturb the review flow. The sidebar reloads it
 * whenever the status changes, and it is reset across repository switches.
 */
export const useStatsStore = create<StatsStoreState>((set) => ({
  stats: EMPTY,

  load: async (root) => {
    const current = ++token
    try {
      const { unstaged, staged } = await diffStats(root)
      if (current !== token) {
        return
      }
      set((state) => ({
        stats: {
          unstaged: indexStats(unstaged, state.stats.unstaged),
          staged: indexStats(staged, state.stats.staged),
        },
      }))
    } catch {
      // Counts are decorative; never surface a failure here.
    }
  },

  reset: () => {
    token += 1
    set({ stats: EMPTY })
  },
}))
