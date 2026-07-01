import { Button } from '@radix-ui/themes'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DocumentIcon } from '../../../components/icons'
import { countDiffLines } from '../../../lib/diff-stats'
import type { DiffLine, Hunk, HunkSelection } from '../../../lib/git'
import { hunkFingerprint } from '../../../lib/hunk-fingerprint'
import { useDiffStore } from '../../../stores/use-diff-store'
import { useRepoStore } from '../../../stores/use-repo-store'
import { CompletionBeat } from '../completion-beat'
import { reviewStats } from '../review-stats'
import { StatusGlyph } from '../status-glyph'
import { ValidateButton } from '../validate-button'
import { DiffView } from './diff-view'

/** The three partial operations on a hunk/line selection. */
export type PartialOp = 'stage' | 'unstage' | 'discard'

/** Builds the wire selection for one hunk — its header tuple + WYSIWYG
 * fingerprint — taking the given `lines` (`null` = the whole hunk). */
function hunkSelection(hunk: Hunk, hunkIndex: number, lines: number[] | null): HunkSelection {
  return {
    hunk: hunkIndex,
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
    fingerprint: hunkFingerprint(hunk),
    lines,
  }
}

/** Whether a line is a change (add/delete), i.e. selectable/actionable. */
function isChange(line: DiffLine | undefined): boolean {
  return line !== undefined && line.kind !== 'context'
}

/** The contiguous run of changed lines containing `lineIndex` — the "change
 * block" a per-line action operates on, so a modification's − and + are always
 * (un)done together (a lone changed line is just itself). */
function blockLines(hunk: Hunk, lineIndex: number): number[] {
  const lines = hunk.lines
  if (!isChange(lines[lineIndex])) {
    return [lineIndex]
  }
  let lo = lineIndex
  let hi = lineIndex
  while (lo > 0 && isChange(lines[lo - 1])) {
    lo -= 1
  }
  while (hi < lines.length - 1 && isChange(lines[hi + 1])) {
    hi += 1
  }
  const out: number[] = []
  for (let i = lo; i <= hi; i++) {
    out.push(i)
  }
  return out
}

/**
 * The empty right pane (nothing selected). Doubles as the completion surface: when
 * "À reviewer" is empty after work was validated, it shows the earned "queue
 * cleared" beat; on a clean tree it stays calm; otherwise it prompts a selection.
 */
function EmptyPane() {
  const status = useRepoStore((s) => s.status)
  const reviewedHere = useRepoStore((s) => s.reviewedHere)
  const { reviewed, total, complete } = reviewStats(status, reviewedHere)

  if (complete) {
    return (
      <div className="diff-panel diff-panel--empty">
        <CompletionBeat reviewed={reviewed} prefix="review-complete" iconSize={42} />
      </div>
    )
  }

  return (
    <div className="diff-panel diff-panel--empty">
      <div className="diff-notice">
        <span className="diff-notice__text">
          {total === 0
            ? 'Aucun changement à reviewer.'
            : 'Sélectionnez un fichier pour voir ses changements.'}
        </span>
      </div>
    </div>
  )
}

/**
 * The right pane of the review surface: the diff of the selected file, with its
 * path, status mark and line delta in a header. Shows the {@link EmptyPane} when
 * nothing is selected, a loading/error notice while the diff resolves, and the
 * {@link DiffView} once it is ready.
 */
export function DiffPanel() {
  const selected = useDiffStore((s) => s.selected)
  const diff = useDiffStore((s) => s.diff)
  const phase = useDiffStore((s) => s.phase)
  const error = useDiffStore((s) => s.error)
  const stagePartial = useRepoStore((s) => s.stagePartial)
  const unstagePartial = useRepoStore((s) => s.unstagePartial)
  const discardPartial = useRepoStore((s) => s.discardPartial)
  // Summed once per loaded diff, not on every render (loading→ready, selection).
  const stat = useMemo(() => (diff && diff.hunks.length > 0 ? countDiffLines(diff) : null), [diff])

  // Line-level selection: per-hunk sets of selected line indices, plus the anchor
  // for Shift-click range. Cleared whenever the diff reloads or the file switches
  // (a new `diff` object), so the indices can never outlive the hunks they name.
  const [selection, setSelection] = useState<ReadonlyMap<number, ReadonlySet<number>>>(
    () => new Map(),
  )
  const [anchor, setAnchor] = useState<{ hunk: number; line: number } | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on diff identity change (reload/switch), not on selection edits.
  useEffect(() => {
    setSelection(new Map())
    setAnchor(null)
  }, [diff])

  const onToggleLine = useCallback(
    (hunkIndex: number, lineIndex: number, extend: boolean) => {
      if (!diff) {
        return
      }
      setSelection((prev) => {
        const next = new Map(prev)
        const set = new Set(next.get(hunkIndex))
        const hunk = diff.hunks[hunkIndex]
        if (extend && anchor && anchor.hunk === hunkIndex && hunk) {
          // Range: add every changed line between the anchor and this one.
          const lo = Math.min(anchor.line, lineIndex)
          const hi = Math.max(anchor.line, lineIndex)
          for (let i = lo; i <= hi; i++) {
            const rangeLine = hunk.lines[i]
            if (rangeLine && rangeLine.kind !== 'context') {
              set.add(i)
            }
          }
        } else if (set.has(lineIndex)) {
          set.delete(lineIndex)
        } else {
          set.add(lineIndex)
        }
        if (set.size === 0) {
          next.delete(hunkIndex)
        } else {
          next.set(hunkIndex, set)
        }
        return next
      })
      // A plain click (not Shift) moves the anchor; Shift keeps it for the range.
      if (!extend) {
        setAnchor({ hunk: hunkIndex, line: lineIndex })
      }
    },
    [diff, anchor],
  )

  const selectedCount = useMemo(() => {
    let total = 0
    for (const set of selection.values()) {
      total += set.size
    }
    return total
  }, [selection])

  // The store action for each op. The store refreshes after every write (even on
  // a stale-diff rejection or a failed discard), so the panel reloads with the
  // shrunken diff or the surfaced error; the selection clears on that reload.
  const runSelections = useCallback(
    (op: PartialOp, selections: HunkSelection[]) => {
      if (!selected || selections.length === 0) {
        return
      }
      const action =
        op === 'stage' ? stagePartial : op === 'unstage' ? unstagePartial : discardPartial
      void action(selected.path, selections)
    },
    [selected, stagePartial, unstagePartial, discardPartial],
  )

  // Whole hunk (the hunk-header buttons).
  const onHunkOp = useCallback(
    (hunkIndex: number, op: PartialOp) => {
      const hunk = diff?.hunks[hunkIndex]
      if (hunk) {
        runSelections(op, [hunkSelection(hunk, hunkIndex, null)])
      }
    },
    [diff, runSelections],
  )

  // One line's change block (the per-line hover buttons) — acts immediately.
  const onLineOp = useCallback(
    (hunkIndex: number, lineIndex: number, op: PartialOp) => {
      const hunk = diff?.hunks[hunkIndex]
      if (hunk) {
        runSelections(op, [hunkSelection(hunk, hunkIndex, blockLines(hunk, lineIndex))])
      }
    },
    [diff, runSelections],
  )

  // The multi-line selection (the "N lignes" header buttons): one HunkSelection
  // per touched hunk, carrying its sorted line indices.
  const onSelectionOp = useCallback(
    (op: PartialOp) => {
      if (!diff) {
        return
      }
      const selections: HunkSelection[] = []
      for (const [hunkIndex, lines] of selection) {
        const hunk = diff.hunks[hunkIndex]
        if (hunk && lines.size > 0) {
          selections.push(
            hunkSelection(
              hunk,
              hunkIndex,
              [...lines].sort((a, b) => a - b),
            ),
          )
        }
      }
      runSelections(op, selections)
    },
    [diff, selection, runSelections],
  )

  if (!selected) {
    return <EmptyPane />
  }

  return (
    <div className="diff-panel">
      <div className="diff-panel__head">
        <span className="diff-panel__id">
          {diff ? <StatusGlyph kind={diff.changeKind} /> : null}
          <span className="diff-panel__path" title={selected.path}>
            {selected.path}
          </span>
        </span>
        <span className="diff-panel__end">
          {selectedCount > 0 ? (
            selected.section === 'unstaged' ? (
              <>
                <Button size="1" variant="soft" onClick={() => onSelectionOp('stage')}>
                  Valider {selectedCount} ligne{selectedCount > 1 ? 's' : ''}
                </Button>
                <Button
                  size="1"
                  variant="soft"
                  color="red"
                  onClick={() => onSelectionOp('discard')}
                >
                  Rejeter
                </Button>
              </>
            ) : (
              <Button size="1" variant="soft" onClick={() => onSelectionOp('unstage')}>
                Renvoyer {selectedCount} ligne{selectedCount > 1 ? 's' : ''}
              </Button>
            )
          ) : null}
          {stat ? (
            <span className="diff-stat">
              <span className="diff-stat__add">+{stat.add}</span>
              <span className="diff-stat__del">−{stat.del}</span>
            </span>
          ) : null}
          <ValidateButton
            section={selected.section}
            path={selected.path}
            className="diff-panel__validate"
          />
        </span>
      </div>
      <div className="diff-panel__body">
        {phase === 'error' ? (
          <div className="diff-notice">
            <span className="diff-notice__text diff-notice__text--error">{error}</span>
          </div>
        ) : diff ? (
          <DiffView
            file={diff}
            section={selected.section}
            onHunkOp={onHunkOp}
            onLineOp={onLineOp}
            selection={selection}
            onToggleLine={onToggleLine}
          />
        ) : phase === 'loading' ? (
          <div className="diff-notice">
            <span className="diff-notice__text">Chargement…</span>
          </div>
        ) : (
          <div className="diff-notice">
            <span className="diff-notice__icon">
              <DocumentIcon />
            </span>
            <span className="diff-notice__text">Aucun diff pour ce fichier.</span>
          </div>
        )}
      </div>
    </div>
  )
}
