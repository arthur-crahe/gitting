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
  it('maps every change kind to a single-char letter, a label and a color', () => {
    for (const kind of KINDS) {
      const glyph = changeKindGlyph(kind)
      expect(glyph.letter).toHaveLength(1)
      expect(glyph.label.length).toBeGreaterThan(0)
      expect(glyph.color).toBeTruthy()
    }
  })

  it('gives distinct letters and labels per kind', () => {
    expect(new Set(KINDS.map((k) => changeKindGlyph(k).letter)).size).toBe(KINDS.length)
    expect(new Set(KINDS.map((k) => changeKindGlyph(k).label)).size).toBe(KINDS.length)
  })
})
