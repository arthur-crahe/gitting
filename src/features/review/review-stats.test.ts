import { describe, expect, it } from 'vitest'
import type { RepoStatus, StatusEntry } from '../../lib/git'
import { reviewStats } from './review-stats'

/** Builds a status with `staged`/`unstaged` of the given lengths (paths unused here). */
function status(staged: number, unstaged: number): RepoStatus {
  const entry = (path: string): StatusEntry => ({ path, kind: 'modified' })
  return {
    staged: Array.from({ length: staged }, (_, i) => entry(`s${i}`)),
    unstaged: Array.from({ length: unstaged }, (_, i) => entry(`u${i}`)),
  }
}

describe('reviewStats', () => {
  it('returns zeroes and not-complete before a status has loaded', () => {
    expect(reviewStats(null)).toEqual({ reviewed: 0, remaining: 0, total: 0, complete: false })
  })

  it('counts staged as reviewed and unstaged as remaining', () => {
    expect(reviewStats(status(2, 3))).toEqual({
      reviewed: 2,
      remaining: 3,
      total: 5,
      complete: false,
    })
  })

  it('is complete only when work was burned down in-session (nothing remains and the user validated here)', () => {
    expect(reviewStats(status(4, 0), true).complete).toBe(true)
    // A repo opened with pre-staged files (nothing validated here) is not a win.
    expect(reviewStats(status(4, 0), false).complete).toBe(false)
    expect(reviewStats(status(4, 0)).complete).toBe(false)
    expect(reviewStats(status(0, 0), true).complete).toBe(false)
    expect(reviewStats(status(0, 2), true).complete).toBe(false)
  })
})
