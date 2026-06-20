import { describe, expect, it } from 'vitest'
import { countDiffLines, indexDiffStats } from './diff-stats'
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

describe('indexDiffStats', () => {
  it('indexes per-file stats by path', () => {
    const stats = indexDiffStats([file('a.ts', ['add']), file('b.ts', ['delete', 'delete'])])
    expect(stats).toEqual({ 'a.ts': { add: 1, del: 0 }, 'b.ts': { add: 0, del: 2 } })
  })
})
