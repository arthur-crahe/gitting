import { describe, expect, it } from 'vitest'
import type { RepoStatus, StatusEntry } from '../../lib/git'
import { partialPaths, reviewStats } from './review-stats'

/** Builds a status with `staged`/`unstaged` of the given lengths (paths unused here). */
function status(staged: number, unstaged: number): RepoStatus {
  const entry = (path: string): StatusEntry => ({ path, kind: 'modified' })
  return {
    staged: Array.from({ length: staged }, (_, i) => entry(`s${i}`)),
    unstaged: Array.from({ length: unstaged }, (_, i) => entry(`u${i}`)),
  }
}

/** Builds a status from explicit path lists, so overlap (partial files) is expressible. */
function statusOf(staged: string[], unstaged: string[]): RepoStatus {
  const entry = (path: string): StatusEntry => ({ path, kind: 'modified' })
  return { staged: staged.map(entry), unstaged: unstaged.map(entry) }
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

  it('counts a partially-staged file (present in both sections) once — remaining, not reviewed', () => {
    // "a" is partial (both sides); "b" fully validated; "c" pending.
    // reviewed = {b} = 1, remaining = {a, c} = 2, total = union{a, b, c} = 3.
    expect(reviewStats(statusOf(['a', 'b'], ['a', 'c']))).toEqual({
      reviewed: 1,
      remaining: 2,
      total: 3,
      complete: false,
    })
  })

  it('never completes while a file is still partially staged', () => {
    // "a" in both → an unstaged entry always remains, so completion cannot fire.
    expect(reviewStats(statusOf(['a'], ['a']), true).complete).toBe(false)
  })
})

describe('partialPaths', () => {
  it('is empty before a status has loaded', () => {
    expect(partialPaths(null).size).toBe(0)
  })

  it('is empty when the sections are disjoint', () => {
    expect(partialPaths(statusOf(['a', 'b'], ['c', 'd'])).size).toBe(0)
  })

  it('is exactly the paths present in both sections', () => {
    const partial = partialPaths(statusOf(['a', 'b'], ['b', 'c']))
    expect([...partial]).toEqual(['b'])
  })
})
