import { Tooltip } from '@radix-ui/themes'
import { useVirtualizer } from '@tanstack/react-virtual'
import { type CSSProperties, useMemo, useRef } from 'react'
import { CheckIcon, DocumentIcon, UndoIcon } from '../../../components/icons'
import type { DiffFile } from '../../../lib/git'
import type { DiffSection } from '../../../stores/use-diff-store'
import { useRepoStore } from '../../../stores/use-repo-store'
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
 * A per-hunk stage/unstage action in the hunk header, revealed on hover. A check
 * validates the hunk (unstaged section), a back-arrow returns it to review
 * (staged). Shown only for a modified file; while a partial write on this file is
 * in flight it is disabled, so a second click can't queue a duplicate. A plain
 * button (not a Radix `IconButton`) so it fits the fixed 20 px header row.
 */
function HunkAction({
  stage,
  pending,
  onClick,
}: {
  stage: boolean
  pending: boolean
  onClick: () => void
}) {
  const label = stage ? 'Valider ce hunk' : 'Renvoyer ce hunk en review'
  return (
    <Tooltip content={label}>
      <button
        type="button"
        className="diff-hunk-head__act"
        tabIndex={-1}
        aria-label={label}
        disabled={pending}
        onClick={onClick}
      >
        {stage ? <CheckIcon /> : <UndoIcon />}
      </button>
    </Tooltip>
  )
}

/**
 * Renders a file's structured diff as a virtualized list of hunk headers and
 * lines: only the rows in view are mounted, so an agent-sized diff of thousands
 * of lines stays responsive. Binary, conflict and mode-only files (no hunks)
 * show a short notice instead.
 *
 * The rows come straight from {@link flattenHunks} over the gix-produced hunks —
 * nothing is re-diffed here, preserving the ADR fidelity invariant. When
 * `onHunkAction` is supplied and the file is modified, each hunk header carries a
 * hover-revealed stage/unstage action for that hunk (`section` picks the
 * direction); it is absent for non-modified files, which stage whole-file.
 */
export function DiffView({
  file,
  section,
  onHunkAction,
  selection,
  onToggleLine,
}: {
  file: DiffFile
  /** Which section the file is open from — picks the hunk action's direction. */
  section?: DiffSection
  /** Stage/unstage the hunk at the given index; omit to hide per-hunk actions. */
  onHunkAction?: (hunkIndex: number) => void
  /** Currently-selected line indices per hunk (for line-level staging). */
  selection?: ReadonlyMap<number, ReadonlySet<number>>
  /** Toggle a line's selection; `extend` (Shift-click) selects a range. */
  onToggleLine?: (hunkIndex: number, lineIndex: number, extend: boolean) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const highlighter = useHighlighter()
  const lang = useMemo(() => langForPath(file.path), [file.path])
  const rows = useMemo(() => flattenHunks(file), [file])
  const { maxCols, noDigits } = useMemo(() => layoutMetrics(file), [file])
  // File-level pending: a partial write marks the whole path, disabling every
  // hunk action on it while the write is in flight.
  const pending = useRepoStore((s) => s.pendingPaths.has(file.path))
  // Partial staging applies to a modified file (patched in place) or a new,
  // untracked file (created in the index from its selected lines). Every other
  // kind stages whole-file, so its hunks carry no per-hunk/line actions.
  const partialEligible = file.changeKind === 'modified' || file.changeKind === 'untracked'
  const hunkActions = onHunkAction !== undefined && partialEligible
  const lineSelectable = onToggleLine !== undefined && partialEligible
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
                  {/* Pinned to the left edge so the hunk range (and its action)
                      stay read-able while the code scrolls horizontally. */}
                  <span className="diff-hunk-head__sticky">
                    <span className="diff-hunk-head__text">{row.text}</span>
                    {hunkActions && onHunkAction ? (
                      <HunkAction
                        stage={section === 'unstaged'}
                        pending={pending}
                        onClick={() => onHunkAction(row.hunkIndex)}
                      />
                    ) : null}
                  </span>
                </div>
              ) : (
                <DiffLineRow
                  line={row.line}
                  highlighter={highlighter}
                  lang={lang}
                  selectable={lineSelectable && row.line.kind !== 'context'}
                  selected={selection?.get(row.hunkIndex)?.has(row.lineIndex) ?? false}
                  onToggle={
                    lineSelectable
                      ? (extend) => onToggleLine?.(row.hunkIndex, row.lineIndex, extend)
                      : undefined
                  }
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
