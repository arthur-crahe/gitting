import type { ChangeKind } from '../../lib/git'
import { type DiffSection, useDiffStore } from '../../stores/use-diff-store'
import { StatusGlyph } from './status-glyph'
import { ValidateButton } from './validate-button'

/**
 * The trailing cluster of a file row: the `+N −N` change magnitude (the git
 * signal — added green, removed red) followed by the git status **letter**, with
 * the validate/unvalidate action overlaid on top, revealed on hover / selection /
 * while pending (the row fades the cluster then, see `global.css`). Shared by the
 * flat list and the tree. Counts come from {@link useDiffStore} (derived from the
 * loaded section diffs) and are decorative (absent until loaded, skipped for
 * binary/mode-only files); the status letter carries its French label for
 * assistive tech.
 */
export function RowEnd({
  section,
  path,
  kind,
}: {
  section: DiffSection
  path: string
  kind: ChangeKind
}) {
  const stat = useDiffStore((s) => s.counts[section][path])
  const hasCounts = stat ? stat.add > 0 || stat.del > 0 : false
  return (
    <span className="row-end">
      <span className="row-stat">
        {hasCounts ? (
          <span className="row-stat__counts" aria-hidden="true">
            {stat && stat.add > 0 ? <span className="row-stat__add">+{stat.add}</span> : null}
            {stat && stat.del > 0 ? <span className="row-stat__del">−{stat.del}</span> : null}
          </span>
        ) : null}
        <StatusGlyph kind={kind} />
      </span>
      <ValidateButton section={section} path={path} />
    </span>
  )
}
