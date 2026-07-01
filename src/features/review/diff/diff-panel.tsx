import { useCallback, useMemo } from 'react'
import { DocumentIcon } from '../../../components/icons'
import { countDiffLines } from '../../../lib/diff-stats'
import type { HunkSelection } from '../../../lib/git'
import { hunkFingerprint } from '../../../lib/hunk-fingerprint'
import { useDiffStore } from '../../../stores/use-diff-store'
import { useRepoStore } from '../../../stores/use-repo-store'
import { CompletionBeat } from '../completion-beat'
import { reviewStats } from '../review-stats'
import { StatusGlyph } from '../status-glyph'
import { ValidateButton } from '../validate-button'
import { DiffView } from './diff-view'

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
  // Summed once per loaded diff, not on every render (loading→ready, selection).
  const stat = useMemo(() => (diff && diff.hunks.length > 0 ? countDiffLines(diff) : null), [diff])

  // Stage (or unstage) one whole hunk of the open file: build its selection —
  // header tuple + the WYSIWYG fingerprint of the rendered hunk — and route it by
  // section. The store refreshes afterwards (even on a stale-diff rejection), so
  // the panel reloads with the shrunken diff or the surfaced error.
  const onHunkAction = useCallback(
    (hunkIndex: number) => {
      if (!diff || !selected) {
        return
      }
      const hunk = diff.hunks[hunkIndex]
      if (!hunk) {
        return
      }
      const selection: HunkSelection = {
        hunk: hunkIndex,
        oldStart: hunk.oldStart,
        oldLines: hunk.oldLines,
        newStart: hunk.newStart,
        newLines: hunk.newLines,
        fingerprint: hunkFingerprint(hunk),
        lines: null,
      }
      void (selected.section === 'unstaged'
        ? stagePartial(selected.path, [selection])
        : unstagePartial(selected.path, [selection]))
    },
    [diff, selected, stagePartial, unstagePartial],
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
          <DiffView file={diff} section={selected.section} onHunkAction={onHunkAction} />
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
