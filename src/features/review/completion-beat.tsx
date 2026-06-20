import { CheckCircleIcon } from '../../components/icons'

/** The validated-file count with French pluralization, e.g. "3 fichiers validés". */
function validatedLabel(reviewed: number): string {
  const plural = reviewed > 1 ? 's' : ''
  return `${reviewed} fichier${plural} validé${plural}`
}

/**
 * The earned "queue cleared" beat — the completion mark, the "Tout est relu" title
 * and the validated-file count — shared by the sidebar's empty queue and the diff
 * pane so the wording and its pluralization live in exactly one place. `prefix`
 * selects the layout (`sidebar-complete` compact vs `review-complete` hero) and
 * `iconSize` sizes the mark; both class families are styled in `global.css`.
 */
export function CompletionBeat({
  reviewed,
  prefix,
  iconSize,
}: {
  reviewed: number
  prefix: string
  iconSize: number
}) {
  return (
    <div className={prefix}>
      <span className={`${prefix}__mark`}>
        <CheckCircleIcon size={iconSize} />
      </span>
      <span className={`${prefix}__title`}>Tout est relu</span>
      <span className={`${prefix}__sub`}>{validatedLabel(reviewed)}</span>
    </div>
  )
}
