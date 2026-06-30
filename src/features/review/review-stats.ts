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
   * Whether the queue is cleared **and at least one file was validated in this
   * session**: there is work, nothing remains to review, and `reviewedHere` is
   * set. That one-validation gate keeps a repository opened with pre-staged
   * changes (an agent's `git add`, a prior session) from firing a false
   * "everything reviewed" celebration the user never earned; it is not a proof
   * that every staged file was reviewed here.
   */
  readonly complete: boolean
}

/**
 * Single source of truth for the review progress arithmetic, derived from the
 * repository {@link RepoStatus}: staged files are "reviewed", unstaged are
 * "remaining". The queue is `complete` once there is work, none remains, **and**
 * at least one file was validated this session (`reviewedHere`) — so a repo
 * opened already-staged is not congratulated, while one cleared after any in-app
 * validation is. Returns zeroes (and `complete: false`) before a status has
 * loaded, so callers can consume it unconditionally.
 */
export function reviewStats(status: RepoStatus | null, reviewedHere = false): ReviewStats {
  const reviewed = status?.staged.length ?? 0
  const remaining = status?.unstaged.length ?? 0
  const total = reviewed + remaining
  return { reviewed, remaining, total, complete: total > 0 && remaining === 0 && reviewedHere }
}
