import type { DiffLine } from '../../../lib/git'

/** Unified-diff sign printed in the gutter for each line kind. */
const SIGN: Record<DiffLine['kind'], string> = { context: ' ', add: '+', delete: '-' }

/**
 * One rendered diff line: the old and new line-number gutters, the +/-/space
 * sign, then the line text. Tinted green/red for add/delete. Numbers and sign
 * are non-selectable so copying a range yields just the code.
 */
export function DiffLineRow({ line }: { line: DiffLine }) {
  return (
    <div className={`diff-line diff-line--${line.kind}`}>
      <span className="diff-line__no">{line.oldNo ?? ''}</span>
      <span className="diff-line__no">{line.newNo ?? ''}</span>
      <span className="diff-line__sign" aria-hidden="true">
        {SIGN[line.kind]}
      </span>
      <code className="diff-line__content">{line.content}</code>
    </div>
  )
}
