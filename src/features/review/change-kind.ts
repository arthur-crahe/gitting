import type { ChangeKind } from '../../lib/git'

/** A Radix accent color used for a change-kind status mark. */
type GlyphColor = 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'cyan' | 'orange'

/** The accessible label, colour and status letter for a {@link ChangeKind}. */
export interface ChangeKindGlyph {
  /** Full French label, used for the tooltip and accessible name. */
  readonly label: string
  /** Radix accent color conveying the kind. */
  readonly color: GlyphColor
  /** Single-letter git-style status code (A/M/D/R/T/U/!). */
  readonly letter: string
}

const GLYPHS: Record<ChangeKind, ChangeKindGlyph> = {
  added: { label: 'Ajouté', color: 'green', letter: 'A' },
  modified: { label: 'Modifié', color: 'amber', letter: 'M' },
  deleted: { label: 'Supprimé', color: 'red', letter: 'D' },
  renamed: { label: 'Renommé', color: 'blue', letter: 'R' },
  typeChange: { label: 'Type modifié', color: 'gray', letter: 'T' },
  untracked: { label: 'Nouveau (non suivi)', color: 'cyan', letter: 'U' },
  conflict: { label: 'Conflit', color: 'orange', letter: '!' },
}

/** Returns the label, colour and status letter for a change kind. */
export function changeKindGlyph(kind: ChangeKind): ChangeKindGlyph {
  return GLYPHS[kind]
}
