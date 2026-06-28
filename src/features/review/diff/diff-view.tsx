import { useVirtualizer } from '@tanstack/react-virtual'
import { type CSSProperties, useMemo, useRef } from 'react'
import { DocumentIcon } from '../../../components/icons'
import type { DiffFile } from '../../../lib/git'
import { DiffLineRow } from './diff-line'
import { flattenHunks } from './flatten-hunks'
import { langForPath } from './lang'
import { useHighlighter } from './use-highlighter'

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
  if (file.changeKind === 'typeChange') {
    return 'Type modifié — pas d’aperçu ligne à ligne.'
  }
  if (file.changeKind === 'untracked') {
    return 'Élément non suivi (dossier, lien ou entrée non régulière) — pas d’aperçu ligne à ligne.'
  }
  if (file.oldMode === '160000' || file.newMode === '160000') {
    return 'Sous-module — pas d’aperçu ligne à ligne.'
  }
  if (file.oldMode && file.newMode && file.oldMode !== file.newMode) {
    return `Mode modifié : ${file.oldMode} → ${file.newMode}.`
  }
  return 'Aucune modification de contenu.'
}

/**
 * Per-file layout metrics derived once over the hunks: the widest line (in
 * characters) sizes the horizontal scroll extent — stable no matter which rows
 * the virtualizer has mounted — and the highest line number sizes the gutter, so
 * a 5-digit number can't overflow into the sign column.
 */
function layoutMetrics(file: DiffFile): { maxCols: number; noDigits: number } {
  let maxCols = 0
  let maxNo = 0
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.content.length > maxCols) {
        maxCols = line.content.length
      }
      const no = Math.max(line.oldNo ?? 0, line.newNo ?? 0)
      if (no > maxNo) {
        maxNo = no
      }
    }
  }
  return { maxCols, noDigits: Math.max(2, String(maxNo).length) }
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
  const highlighter = useHighlighter()
  const lang = useMemo(() => langForPath(file.path), [file.path])
  const rows = useMemo(() => flattenHunks(file), [file])
  const { maxCols, noDigits } = useMemo(() => layoutMetrics(file), [file])
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
  })

  if (file.isBinary || file.hunks.length === 0) {
    return (
      <div className="diff-notice">
        <span className="diff-notice__icon">
          <DocumentIcon />
        </span>
        <span className="diff-notice__text">{emptyReason(file)}</span>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      className="diff-scroll"
      style={
        {
          '--diff-row-height': `${ROW_HEIGHT}px`,
          '--diff-no-width': `calc(${noDigits}ch + 8px)`,
        } as CSSProperties
      }
    >
      <div
        className="diff-sizer"
        style={{
          height: virtualizer.getTotalSize(),
          // gutters (2 number columns + the 2ch sign) + the widest content line.
          width: `calc(${2 * noDigits + 2 + maxCols}ch + 16px)`,
        }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index]
          if (!row) {
            return null
          }
          return (
            // Positioned with `top` rather than `transform`: a transformed ancestor
            // becomes the containing block for `position: sticky`, which would trap
            // the line-number gutter and break its horizontal-scroll pinning.
            <div key={row.key} className="diff-row" style={{ top: item.start }}>
              {row.type === 'header' ? (
                <div className="diff-hunk-head">
                  {/* Pinned to the left edge so the hunk range stays read-able
                      while the code scrolls horizontally (like the line gutter). */}
                  <span className="diff-hunk-head__text">{row.text}</span>
                </div>
              ) : (
                <DiffLineRow line={row.line} highlighter={highlighter} lang={lang} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
