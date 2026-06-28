import { type CSSProperties, useEffect, useReducer } from 'react'
import type { HighlighterCore } from 'shiki/core'
import type { DiffLine } from '../../../lib/git'
import { cachedTokens, tokenizeLineCached } from './tokenize'

/** Unified-diff sign printed in the gutter for each line kind. */
const SIGN: Record<DiffLine['kind'], string> = { context: ' ', add: '+', delete: '-' }

/**
 * One rendered diff line: the old and new line-number gutters, the +/-/space
 * sign, then the line text — syntax-highlighted via Shiki, tinted green/red for
 * add/delete. Numbers and sign are non-selectable so copying a range yields just
 * the code.
 *
 * Tokenization is expensive (~1 ms/line) so it never blocks the click: a line
 * already in the {@link cachedTokens} cache renders colored immediately, an
 * uncached one renders as plain text and is tokenized **after paint** (then
 * cached), so switching files paints instantly and the colors fill in.
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
  const [, recolor] = useReducer((n: number) => n + 1, 0)

  // Read from the cache on each render — cheap, and always reflects the current
  // line even when the virtualizer recycles this row for a different file.
  const tokens =
    highlighter !== null && lang !== null && line.content !== ''
      ? (cachedTokens(lang, line.content) ?? null)
      : null

  useEffect(() => {
    if (highlighter === null || lang === null || line.content === '') {
      return
    }
    if (cachedTokens(lang, line.content)) {
      return
    }
    // Compute after paint, then re-render to pick up the freshly cached tokens.
    tokenizeLineCached(highlighter, line.content, lang)
    recolor()
  }, [highlighter, lang, line.content])

  return (
    <div className={`diff-line diff-line--${line.kind}`}>
      {/* The gutter (line numbers + sign) is one sticky unit, pinned to the left
          edge so it stays read-able while the code scrolls horizontally under it. */}
      <span className="diff-line__gutter">
        <span className="diff-line__no">{line.oldNo ?? ''}</span>
        <span className="diff-line__no">{line.newNo ?? ''}</span>
        <span className="diff-line__sign" aria-hidden="true">
          {SIGN[line.kind]}
        </span>
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
