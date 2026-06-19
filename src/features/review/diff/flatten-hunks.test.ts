import { describe, expect, it } from 'vitest'
import type { DiffFile } from '../../../lib/git'
import { flattenHunks } from './flatten-hunks'

const FILE: DiffFile = {
  path: 'a.txt',
  changeKind: 'modified',
  oldMode: '100644',
  newMode: '100644',
  isBinary: false,
  hunks: [
    {
      oldStart: 1,
      oldLines: 2,
      newStart: 1,
      newLines: 2,
      lines: [
        { kind: 'context', oldNo: 1, newNo: 1, content: 'a' },
        { kind: 'delete', oldNo: 2, newNo: null, content: 'b' },
        { kind: 'add', oldNo: null, newNo: 2, content: 'B' },
      ],
    },
    {
      oldStart: 10,
      oldLines: 1,
      newStart: 10,
      newLines: 1,
      lines: [{ kind: 'context', oldNo: 10, newNo: 10, content: 'z' }],
    },
  ],
}

describe('flattenHunks', () => {
  it('emits a header before each hunk, then its lines, in order', () => {
    const rows = flattenHunks(FILE)
    expect(rows.map((r) => r.type)).toEqual(['header', 'line', 'line', 'line', 'header', 'line'])
    expect(rows[0]).toMatchObject({ type: 'header', text: '@@ -1,2 +1,2 @@' })
    expect(rows[4]).toMatchObject({ type: 'header', text: '@@ -10,1 +10,1 @@' })
  })

  it('preserves the hunk lines exactly (the fidelity seam)', () => {
    const lines = flattenHunks(FILE)
      .filter((r) => r.type === 'line')
      .map((r) => r.line)
    expect(lines).toEqual(FILE.hunks.flatMap((h) => h.lines))
  })

  it('gives every row a stable unique key', () => {
    const keys = flattenHunks(FILE).map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
