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
 * repository {@link RepoStatus}. Progress is **file-level**: `remaining` is every
 * unstaged file, and `reviewed` is only the **fully**-validated files — a path
 * that is staged *and* still unstaged is partially staged (pending hunks remain),
 * so it counts as remaining, not reviewed, and `total` (the union) counts it once.
 * That keeps the progress pill from ever reading 100 % while a file still has
 * hunks to review.
 *
 * The queue is `complete` once there is work, none remains, **and** at least one
 * file was validated this session (`reviewedHere`) — so a repo opened
 * already-staged is not congratulated, while one cleared after any in-app
 * validation is. A partially-staged file always keeps an unstaged entry, so
 * completion cannot fire while one exists. Returns zeroes (and `complete: false`)
 * before a status has loaded, so callers can consume it unconditionally.
 */
export function reviewStats(status: RepoStatus | null, reviewedHere = false): ReviewStats {
  const remaining = status?.unstaged.length ?? 0
  const pending = new Set(status?.unstaged.map((entry) => entry.path))
  const reviewed = status?.staged.filter((entry) => !pending.has(entry.path)).length ?? 0
  const total = reviewed + remaining
  return { reviewed, remaining, total, complete: total > 0 && remaining === 0 && reviewedHere }
}

/**
 * Paths present in **both** sections — partially staged: some hunks validated,
 * some still pending. Derived on demand from the {@link RepoStatus}, never stored;
 * drives the quiet "partiel" row marker. Empty before a status has loaded.
 */
export function partialPaths(status: RepoStatus | null): ReadonlySet<string> {
  const staged = new Set(status?.staged.map((entry) => entry.path))
  const partial = new Set<string>()
  for (const entry of status?.unstaged ?? []) {
    if (staged.has(entry.path)) {
      partial.add(entry.path)
    }
  }
  return partial
}
