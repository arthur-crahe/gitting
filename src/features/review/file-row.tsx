import { memo } from 'react'
import type { StatusEntry } from '../../lib/git'
import { splitPath } from '../../lib/path'
import type { DiffSection } from '../../stores/use-diff-store'
import { useRepoStore } from '../../stores/use-repo-store'
import { FileTypeIcon } from './file-type-icon'
import { useIsSelected, useRowActions } from './row-context'
import { RowEnd } from './row-end'

/**
 * Left-to-Right Mark: prefixed to the directory so a leading neutral/weak char
 * (`.github`, `@scope`) is not reordered to the visual end under the
 * left-truncating `direction: rtl` on `.file-row__dir`.
 */
const LRM = String.fromCharCode(0x200e)

/**
 * A single changed file in the flat list: a clickable select target — its status
 * glyph plus the path — and a trailing validate action. The file **name** is the
 * UI sans (crisp, scannable); the directory prefix is muted and truncated from
 * the left so the immediate parent survives, never the name. `recede` steps the
 * name back for the "Validé" archive. The select target carries `data-file-row`
 * (+ section/path) so the keyboard model can traverse it, and `tabindex={-1}` so
 * it is reachable by the arrow keys, not the Tab order.
 *
 * Memoized on its identity (section/path/kind/recede): a status refresh rebuilds
 * the entry objects, so without this every row — and its file-type icon — would
 * re-render though only the validated file actually changed.
 */
export const FileRow = memo(function FileRow({
  section,
  entry,
  recede,
}: {
  section: DiffSection
  entry: StatusEntry
  recede?: boolean
}) {
  const { select } = useRowActions()
  const selected = useIsSelected(section, entry.path)
  const pending = useRepoStore((s) => s.pendingPaths.has(entry.path))
  const { dir, name } = splitPath(entry.path)
  const prefix = dir.replace(/\/$/, '')
  return (
    <li
      className="file-row"
      data-selected={selected || undefined}
      data-recede={recede || undefined}
      data-pending={pending || undefined}
    >
      <button
        type="button"
        className="file-row__select"
        data-file-row=""
        data-section={section}
        data-path={entry.path}
        tabIndex={-1}
        onClick={() => select(section, entry.path)}
        title={entry.path}
        aria-current={selected ? 'true' : undefined}
      >
        <FileTypeIcon name={name} />
        <span className="file-row__path">
          {prefix ? (
            <>
              <span className="file-row__dir">{`${LRM}${prefix}`}</span>
              <span className="file-row__sep">/</span>
            </>
          ) : null}
          <span className="file-row__name">{name}</span>
        </span>
      </button>
      <RowEnd section={section} path={entry.path} kind={entry.kind} />
    </li>
  )
}, sameRow)

/**
 * Compares rows by value, not by the `entry` object identity (a status refresh
 * rebuilds every entry), so an unchanged row genuinely skips re-render. Selection
 * and pending are read from stores inside the row, so they still update it.
 */
function sameRow(
  prev: { section: DiffSection; entry: StatusEntry; recede?: boolean },
  next: { section: DiffSection; entry: StatusEntry; recede?: boolean },
): boolean {
  return (
    prev.section === next.section &&
    prev.recede === next.recede &&
    prev.entry.path === next.entry.path &&
    prev.entry.kind === next.entry.kind
  )
}
