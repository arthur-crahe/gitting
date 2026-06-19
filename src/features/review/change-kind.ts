import type { ChangeKind } from '../../lib/git'

/** A Radix accent color used for a change-kind glyph. */
type GlyphColor = 'green' | 'amber' | 'red' | 'purple' | 'gray' | 'cyan' | 'orange'

/** Single-letter status indicator and its meaning for a {@link ChangeKind}. */
export interface ChangeKindGlyph {
  /** Compact status letter shown in the file list (git-style: A/M/D/R/T/?/!). */
  readonly letter: string
  /** Full French label, used for the tooltip and accessible name. */
  readonly label: string
  /** Radix accent color conveying the kind. */
  readonly color: GlyphColor
}

const GLYPHS: Record<ChangeKind, ChangeKindGlyph> = {
  added: { letter: 'A', label: 'Ajouté', color: 'green' },
  modified: { letter: 'M', label: 'Modifié', color: 'amber' },
  deleted: { letter: 'D', label: 'Supprimé', color: 'red' },
  renamed: { letter: 'R', label: 'Renommé', color: 'purple' },
  typeChange: { letter: 'T', label: 'Type modifié', color: 'gray' },
  untracked: { letter: '?', label: 'Nouveau (non suivi)', color: 'cyan' },
  conflict: { letter: '!', label: 'Conflit', color: 'orange' },
}

/** Returns the status letter, label and color for a change kind. */
export function changeKindGlyph(kind: ChangeKind): ChangeKindGlyph {
  return GLYPHS[kind]
}
