import { type CSSProperties, useMemo } from 'react'
import type { HighlighterCore } from 'shiki/core'
import type { DiffLine } from '../../../lib/git'
import { tokenizeLine } from './tokenize'

/** Unified-diff sign printed in the gutter for each line kind. */
const SIGN: Record<DiffLine['kind'], string> = { context: ' ', add: '+', delete: '-' }

/**
 * One rendered diff line: the old and new line-number gutters, the +/-/space
 * sign, then the line text — syntax-highlighted via Shiki when a highlighter and
 * a known language are available, plain text otherwise (and while Shiki loads).
 * Tinted green/red for add/delete. Numbers and sign are non-selectable so copying
 * a range yields just the code.
 */
export function DiffLineRow({
  line,
  highlighter,
  lang,
}: {
  line: DiffLine
  highlighter: HighlighterCore | null
  lang: string | null
}) {
  const tokens = useMemo(
    () =>
      highlighter && lang && line.content !== ''
        ? tokenizeLine(highlighter, line.content, lang)
        : null,
    [highlighter, lang, line.content],
  )

  return (
    <div className={`diff-line diff-line--${line.kind}`}>
      <span className="diff-line__no">{line.oldNo ?? ''}</span>
      <span className="diff-line__no">{line.newNo ?? ''}</span>
      <span className="diff-line__sign" aria-hidden="true">
        {SIGN[line.kind]}
      </span>
      <code className="diff-line__content">
        {tokens
          ? tokens.map((token) => (
              <span
                key={token.offset}
                className="diff-tok"
                style={
                  {
                    '--sl': token.light,
                    '--sd': token.dark,
                    fontStyle: token.italic ? 'italic' : undefined,
                    fontWeight: token.bold ? 'bold' : undefined,
                  } as CSSProperties
                }
              >
                {token.content}
              </span>
            ))
          : line.content}
      </code>
    </div>
  )
}
