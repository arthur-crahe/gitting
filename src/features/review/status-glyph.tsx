import { Text } from '@radix-ui/themes'
import type { ChangeKind } from '../../lib/git'
import { changeKindGlyph } from './change-kind'

/**
 * The single-letter status indicator (A/M/D/R/T/?/!) for a change kind, colored
 * and labelled per {@link changeKindGlyph}. Fixed-width and monospaced (via the
 * `.status-glyph` class) so it forms a clean leading column. Shared by the flat
 * file list and the tree view.
 */
export function StatusGlyph({ kind }: { kind: ChangeKind }) {
  const glyph = changeKindGlyph(kind)
  return (
    <Text
      className="status-glyph"
      color={glyph.color}
      weight="bold"
      size="2"
      aria-label={glyph.label}
    >
      {glyph.letter}
    </Text>
  )
}
