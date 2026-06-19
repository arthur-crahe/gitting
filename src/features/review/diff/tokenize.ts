import type { HighlighterCore } from 'shiki/core'
import { DARK_THEME, LIGHT_THEME } from '../../../lib/highlighter'

/** Shiki's `FontStyle` bit flags (the enum is not exported by the data path). */
const ITALIC = 1
const BOLD = 2

/** One syntax-highlighted span of a diff line: its text and per-theme colors. */
export interface DiffToken {
  /** Stable key within the line (the token's byte offset). */
  readonly offset: number
  /** The token text (concatenating all tokens reproduces the line exactly). */
  readonly content: string
  /** Color under the light theme (or `'inherit'`). */
  readonly light: string
  /** Color under the dark theme (or `'inherit'`). */
  readonly dark: string
  readonly italic: boolean
  readonly bold: boolean
}

/**
 * Tokenizes a single diff line into colored spans for `lang`, carrying both the
 * light and dark colors so the theme switch is pure CSS. Returns `[]` for an
 * empty line. The concatenation of token contents equals `content` exactly — the
 * highlighter colors, it never rewrites the text.
 */
export function tokenizeLine(
  highlighter: HighlighterCore,
  content: string,
  lang: string,
): DiffToken[] {
  if (content === '') {
    return []
  }
  const [line] = highlighter.codeToTokensWithThemes(content, {
    lang,
    themes: { light: LIGHT_THEME, dark: DARK_THEME },
  })
  if (!line) {
    return []
  }
  return line.map((token) => {
    const style = token.variants.light?.fontStyle ?? 0
    return {
      offset: token.offset,
      content: token.content,
      light: token.variants.light?.color ?? 'inherit',
      dark: token.variants.dark?.color ?? 'inherit',
      italic: (style & ITALIC) !== 0,
      bold: (style & BOLD) !== 0,
    }
  })
}
