import type { RepoStatus } from '../../lib/git'

/** Derived review burn-down counts for an opened repository. */
export interface ReviewStats {
  /** Files already validated (staged — "Validé"). */
  readonly reviewed: number
  /** Files still pending review (unstaged — "À reviewer"). */
  readonly remaining: number
  /** Files under review across both sections. */
  readonly total: number
  /** Whether there is work and nothing is left to review. */
  readonly complete: boolean
}

/**
 * Single source of truth for the review progress arithmetic, derived from the
 * repository {@link RepoStatus}: staged files are "reviewed", unstaged are
 * "remaining", and the queue is `complete` once there is work and none remains.
 * Returns zeroes (and `complete: false`) before a status has loaded, so callers
 * can consume it unconditionally.
 */
export function reviewStats(status: RepoStatus | null): ReviewStats {
  const reviewed = status?.staged.length ?? 0
  const remaining = status?.unstaged.length ?? 0
  const total = reviewed + remaining
  return { reviewed, remaining, total, complete: total > 0 && remaining === 0 }
}
