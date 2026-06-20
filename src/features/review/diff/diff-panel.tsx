import { CheckCircleIcon, DocumentIcon } from '../../../components/icons'
import { countDiffLines } from '../../../lib/diff-stats'
import { useDiffStore } from '../../../stores/use-diff-store'
import { useRepoStore } from '../../../stores/use-repo-store'
import { reviewStats } from '../review-stats'
import { StatusGlyph } from '../status-glyph'
import { DiffView } from './diff-view'

/**
 * The empty right pane (nothing selected). Doubles as the completion surface: when
 * "À reviewer" is empty after work was validated, it shows the earned "queue
 * cleared" beat; on a clean tree it stays calm; otherwise it prompts a selection.
 */
function EmptyPane() {
  const status = useRepoStore((s) => s.status)
  const { reviewed, total, complete } = reviewStats(status)

  if (complete) {
    return (
      <div className="diff-panel diff-panel--empty">
        <div className="review-complete">
          <div className="review-complete__mark">
            <CheckCircleIcon size={42} />
          </div>
          <div className="review-complete__title">Tout est relu</div>
          <div className="review-complete__sub">
            {reviewed} fichier{reviewed > 1 ? 's' : ''} validé{reviewed > 1 ? 's' : ''}
          </div>
        </div>
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

  if (!selected) {
    return <EmptyPane />
  }

  const stat = diff && diff.hunks.length > 0 ? countDiffLines(diff) : null

  return (
    <div className="diff-panel">
      <div className="diff-panel__head">
        <span className="diff-panel__id">
          {diff ? <StatusGlyph kind={diff.changeKind} /> : null}
          <span className="diff-panel__path" title={selected.path}>
            {selected.path}
          </span>
        </span>
        {stat ? (
          <span className="diff-stat">
            <span className="diff-stat__add">+{stat.add}</span>
            <span className="diff-stat__del">−{stat.del}</span>
          </span>
        ) : null}
      </div>
      <div className="diff-panel__body">
        {phase === 'error' ? (
          <div className="diff-notice">
            <span className="diff-notice__text diff-notice__text--error">{error}</span>
          </div>
        ) : diff ? (
          <DiffView file={diff} />
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
