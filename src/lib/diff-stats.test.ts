import { describe, expect, it } from 'vitest'
import { countDiffLines } from './diff-stats'
import type { DiffFile, DiffLine } from './git'

const line = (kind: DiffLine['kind']): DiffLine => ({ kind, oldNo: null, newNo: null, content: '' })

function file(path: string, kinds: DiffLine['kind'][]): DiffFile {
  return {
    path,
    changeKind: 'modified',
    oldMode: '100644',
    newMode: '100644',
    isBinary: false,
    hunks: kinds.length
      ? [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: kinds.map(line) }]
      : [],
  }
}

describe('countDiffLines', () => {
  it('counts adds and deletes, ignoring context', () => {
    expect(countDiffLines(file('a', ['add', 'add', 'delete', 'context']))).toEqual({
      add: 2,
      del: 1,
    })
  })

  it('returns zeroes for a file with no hunks (binary / mode-only)', () => {
    expect(countDiffLines(file('bin', []))).toEqual({ add: 0, del: 0 })
  })
})
