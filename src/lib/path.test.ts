import { describe, expect, it } from 'vitest'
import { lastPathSegment, splitPath } from './path'

describe('lastPathSegment', () => {
  it('returns the whole string when there is no separator', () => {
    expect(lastPathSegment('README.md')).toBe('README.md')
  })

  it('returns the final segment of a nested path', () => {
    expect(lastPathSegment('src/features/review/file-tree.ts')).toBe('file-tree.ts')
  })

  it('returns an empty string for a trailing separator', () => {
    expect(lastPathSegment('src/')).toBe('')
  })
})

describe('splitPath', () => {
  it('leaves the dir empty for a root-level file', () => {
    expect(splitPath('README.md')).toEqual({ dir: '', name: 'README.md' })
  })

  it('keeps the trailing slash in the dir prefix', () => {
    expect(splitPath('src/features/review/file-tree.ts')).toEqual({
      dir: 'src/features/review/',
      name: 'file-tree.ts',
    })
  })
})
