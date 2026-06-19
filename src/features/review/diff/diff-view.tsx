import { Text } from '@radix-ui/themes'
import { useVirtualizer } from '@tanstack/react-virtual'
import { type CSSProperties, useMemo, useRef } from 'react'
import type { DiffFile } from '../../../lib/git'
import { DiffLineRow } from './diff-line'
import { flattenHunks } from './flatten-hunks'

/** Fixed row height (px). Diff lines never wrap, so the height is constant —
 * no measurement, which keeps virtualization cheap and deterministic. */
const ROW_HEIGHT = 20

/** The reason a file has no line-by-line diff to render. */
function emptyReason(file: DiffFile): string {
  if (file.isBinary) {
    return 'Fichier binaire — pas d’aperçu ligne à ligne.'
  }
  if (file.changeKind === 'conflict') {
    return 'Conflit non résolu — résolvez-le pour le reviewer.'
  }
  if (file.changeKind === 'renamed') {
    return 'Fichier renommé.'
  }
  if (file.oldMode && file.newMode && file.oldMode !== file.newMode) {
    return `Mode modifié : ${file.oldMode} → ${file.newMode}.`
  }
  return 'Aucune modification de contenu.'
}

/**
 * Renders a file's structured diff as a virtualized list of hunk headers and
 * lines: only the rows in view are mounted, so an agent-sized diff of thousands
 * of lines stays responsive. Binary, conflict and mode-only files (no hunks)
 * show a short notice instead.
 *
 * The rows come straight from {@link flattenHunks} over the gix-produced hunks —
 * nothing is re-diffed here, preserving the ADR fidelity invariant.
 */
export function DiffView({ file }: { file: DiffFile }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rows = useMemo(() => flattenHunks(file), [file])
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
  })

  if (file.isBinary || file.hunks.length === 0) {
    return (
      <Text size="2" color="gray" className="diff-empty">
        {emptyReason(file)}
      </Text>
    )
  }

  return (
    <div
      ref={scrollRef}
      className="diff-scroll"
      style={{ '--diff-row-height': `${ROW_HEIGHT}px` } as CSSProperties}
    >
      <div className="diff-sizer" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index]
          if (!row) {
            return null
          }
          return (
            <div
              key={row.key}
              className="diff-row"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              {row.type === 'header' ? (
                <div className="diff-hunk-head">{row.text}</div>
              ) : (
                <DiffLineRow line={row.line} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
