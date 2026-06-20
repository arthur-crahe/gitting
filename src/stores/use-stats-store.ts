import { create } from 'zustand'
import { type FileStat, indexDiffStats } from '../lib/diff-stats'
import { diffStaged, diffUnstaged } from '../lib/git'
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
 * Store for the sidebar's per-file change magnitude (the `+N −N` GitButler-style
 * signal). The counts are **decorative metadata**, computed from the same gix
 * diffs the panel renders: {@link StatsStoreState.load} reads both sections once
 * and indexes them by path; a failure is swallowed (the rows simply show no
 * counts) so it can never disturb the review flow. The sidebar reloads it
 * whenever the status changes, and it is reset across repository switches.
 */
export const useStatsStore = create<StatsStoreState>((set) => ({
  stats: EMPTY,

  load: async (root) => {
    const current = ++token
    try {
      const [unstaged, staged] = await Promise.all([diffUnstaged(root), diffStaged(root)])
      if (current !== token) {
        return
      }
      set({ stats: { unstaged: indexDiffStats(unstaged), staged: indexDiffStats(staged) } })
    } catch {
      // Counts are decorative; never surface a failure here.
    }
  },

  reset: () => {
    token += 1
    set({ stats: EMPTY })
  },
}))
