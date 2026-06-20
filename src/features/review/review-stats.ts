import type { RepoStatus } from '../../lib/git'

/** Derived review burn-down counts for an opened repository. */
export interface ReviewStats {
  /** Files already validated (staged — "Validé"). */
  readonly reviewed: number
  /** Files still pending review (unstaged — "À reviewer"). */
  readonly remaining: number
  /** Files under review across both sections. */
  readonly total: number
  /**
   * Whether the review queue has been **burned down in this session**: there is
   * work, nothing remains to review, and the user validated at least one file
   * here. The `reviewedHere` gate is what keeps a repository opened with
   * pre-staged changes (an agent's `git add`, a prior session) from firing a
   * false "everything reviewed" celebration the user never earned.
   */
  readonly complete: boolean
}

/**
 * Single source of truth for the review progress arithmetic, derived from the
 * repository {@link RepoStatus}: staged files are "reviewed", unstaged are
 * "remaining". The queue is `complete` once there is work, none remains, **and**
 * `reviewedHere` is set — i.e. the emptiness was earned by validating in this
 * session, not merely by opening an already-staged repo. Returns zeroes (and
 * `complete: false`) before a status has loaded, so callers can consume it
 * unconditionally.
 */
export function reviewStats(status: RepoStatus | null, reviewedHere = false): ReviewStats {
  const reviewed = status?.staged.length ?? 0
  const remaining = status?.unstaged.length ?? 0
  const total = reviewed + remaining
  return { reviewed, remaining, total, complete: total > 0 && remaining === 0 && reviewedHere }
}
