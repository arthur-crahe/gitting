import { describe, expect, it } from 'vitest'
import type { StatusEntry } from '../../lib/git'
import { filterEntries, matchesQuery, neighborIndex, normalizeQuery } from './file-filter'

const entry = (path: string): StatusEntry => ({ path, kind: 'modified' })

describe('normalizeQuery', () => {
  it('trims and lower-cases', () => {
    expect(normalizeQuery('  Src/Foo  ')).toBe('src/foo')
  })
})

describe('matchesQuery', () => {
  it('matches everything on an empty query', () => {
    expect(matchesQuery('anything', '')).toBe(true)
  })

  it('matches a case-insensitive substring of the whole path', () => {
    expect(matchesQuery('src/features/Review.tsx', 'review')).toBe(true)
    expect(matchesQuery('src/features/review.tsx', 'features/rev')).toBe(true)
  })

  it('rejects a non-substring', () => {
    expect(matchesQuery('src/a.ts', 'zzz')).toBe(false)
  })
})

describe('filterEntries', () => {
  const entries = [entry('src/a.ts'), entry('src/features/review.tsx'), entry('README.md')]

  it('returns the same reference for an empty query (no needless re-render)', () => {
    expect(filterEntries(entries, '   ')).toBe(entries)
  })

  it('keeps only matching entries, case-insensitively', () => {
    expect(filterEntries(entries, 'REVIEW').map((e) => e.path)).toEqual(['src/features/review.tsx'])
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterEntries(entries, 'nope')).toEqual([])
  })
})

describe('neighborIndex', () => {
  it('prefers the following sibling', () => {
    expect(neighborIndex(3, 0)).toBe(1)
    expect(neighborIndex(3, 1)).toBe(2)
  })

  it('falls back to the previous sibling for the last row', () => {
    expect(neighborIndex(3, 2)).toBe(1)
  })

  it('returns -1 for a singleton (the list will be empty)', () => {
    expect(neighborIndex(1, 0)).toBe(-1)
  })

  it('returns -1 for an out-of-range index', () => {
    expect(neighborIndex(0, 0)).toBe(-1)
    expect(neighborIndex(2, 5)).toBe(-1)
    expect(neighborIndex(2, -1)).toBe(-1)
  })
})
