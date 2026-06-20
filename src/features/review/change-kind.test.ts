import { describe, expect, it } from 'vitest'
import type { ChangeKind } from '../../lib/git'
import { changeKindGlyph } from './change-kind'

const KINDS: ChangeKind[] = [
  'added',
  'modified',
  'deleted',
  'renamed',
  'typeChange',
  'untracked',
  'conflict',
]

describe('changeKindGlyph', () => {
  it('maps every change kind to a label, color and status letter', () => {
    for (const kind of KINDS) {
      const glyph = changeKindGlyph(kind)
      expect(glyph.label.length).toBeGreaterThan(0)
      expect(glyph.color).toBeTruthy()
      expect(glyph.letter).toHaveLength(1)
    }
  })

  it('gives a distinct label and letter per kind', () => {
    expect(new Set(KINDS.map((k) => changeKindGlyph(k).label)).size).toBe(KINDS.length)
    expect(new Set(KINDS.map((k) => changeKindGlyph(k).letter)).size).toBe(KINDS.length)
  })
})
