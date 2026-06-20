import type { CSSProperties } from 'react'
import { useRepoStore } from '../../stores/use-repo-store'
import { reviewStats } from './review-stats'

/**
 * Footer progress pill — the review burn-down made legible at a glance. Staged
 * files are "relus" (reviewed); the bar fills to their share of the total and
 * shifts to the solid accent the moment "À reviewer" empties. Renders nothing when
 * there is nothing to review (a clean working tree).
 */
export function ReviewProgress() {
  const status = useRepoStore((s) => s.status)
  const reviewedHere = useRepoStore((s) => s.reviewedHere)
  const { reviewed, total, complete } = reviewStats(status, reviewedHere)
  if (total === 0) {
    return null
  }

  const ratio = reviewed / total

  return (
    <div className="review-progress" data-complete={complete}>
      <div
        className="review-progress__bar"
        role="progressbar"
        aria-label="Avancement de la revue"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={reviewed}
      >
        <div
          className="review-progress__fill"
          style={{ width: `${Math.round(ratio * 100)}%` } as CSSProperties}
        />
      </div>
      <span className="review-progress__label">
        {reviewed} / {total} relus
      </span>
    </div>
  )
}
