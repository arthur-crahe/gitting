import type { CSSProperties } from 'react'
import type { ChangeKind } from '../../lib/git'
import { changeKindGlyph } from './change-kind'

/**
 * The status indicator for a change kind — a single git-style **letter** (A/M/D/
 * R/T/U/!) in the kind's desaturated semantic colour ({@link changeKindGlyph}).
 * Shared by the sidebar rows (trailing cluster) and the diff header. Carries its
 * French label for assistive tech.
 */
export function StatusGlyph({ kind }: { kind: ChangeKind }) {
  const glyph = changeKindGlyph(kind)
  return (
    <span
      className="status-letter"
      style={{ color: `var(--${glyph.color}-11)` } as CSSProperties}
      role="img"
      aria-label={glyph.label}
    >
      {glyph.letter}
    </span>
  )
}
