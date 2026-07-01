import { Tooltip } from '@radix-ui/themes'
import { type ReactNode, type RefObject, useId, useMemo } from 'react'
import { CheckAllIcon, Chevron, UndoIcon } from '../../components/icons'
import type { StatusEntry } from '../../lib/git'
import type { DiffSection } from '../../stores/use-diff-store'
import { useRepoStore } from '../../stores/use-repo-store'
import type { ViewMode } from '../../stores/use-view-store'
import { filterEntries, normalizeQuery } from './file-filter'
import { FileRow } from './file-row'
import { FileTree } from './tree-view'
import { useStuck } from './use-sticky-head'

/** Props for one review section. */
interface StatusSectionProps {
  /** Section title ("À reviewer" / "Validé"). */
  readonly title: string
  /** Which review section this is. */
  readonly section: DiffSection
  /** The section's changed files (unfiltered; the section applies the filter). */
  readonly entries: readonly StatusEntry[]
  /** Paths that are partially staged (present in both sections). */
  readonly partial?: ReadonlySet<string>
  /** Current filter query. */
  readonly query: string
  /** Flat list or tree layout. */
  readonly mode: ViewMode
  /** Whether the section is open (collapsed when false). */
  readonly open: boolean
  /** Toggles the section open/closed. */
  readonly onToggle: () => void
  /** Step the rows back as done work (the "Validé" archive). */
  readonly recede?: boolean
  /** The scroll viewport, for the sticky-header seam. */
  readonly scrollRef: RefObject<HTMLElement | null>
  /** What to show when the section is genuinely empty (no filter involved). */
  readonly empty: ReactNode
}

/**
 * One review section: a sticky, collapsible, counted, titled header over its
 * changed files as a flat list or a tree. The active queue ("À reviewer") carries
 * an accent count badge — the burn-down number; the "Validé" archive shows a plain
 * count and recedes. The filter is applied here so the count can read `{shown} /
 * {total}` and so the rendered rows (the keyboard model's source of truth) match
 * exactly what is visible.
 */
export function StatusSection({
  title,
  section,
  entries,
  partial,
  query,
  mode,
  open,
  onToggle,
  recede,
  scrollRef,
  empty,
}: StatusSectionProps) {
  const [sentinelRef, stuck] = useStuck(scrollRef)
  const titleId = useId()
  const stageMany = useRepoStore((s) => s.stageMany)
  const unstageMany = useRepoStore((s) => s.unstageMany)
  const filtering = normalizeQuery(query) !== ''
  const filtered = useMemo(() => filterEntries(entries, query), [entries, query])
  const isQueue = section === 'unstaged'
  const count = filtering ? `${filtered.length} / ${entries.length}` : `${entries.length}`

  // "Tout valider" / "Tout dévalider": one batched stage/unstage over exactly the
  // files currently shown (so it honours an active filter, and equals the whole
  // section when there is none). Hidden when nothing is shown.
  const bulkLabel = isQueue ? 'Tout valider' : 'Tout dévalider'
  const runBulk = () => {
    const paths = filtered.map((entry) => entry.path)
    void (isQueue ? stageMany(paths) : unstageMany(paths))
  }

  // Built only when the section is open — a collapsed archive must not construct
  // (and reconcile) all of its row elements on every render.
  const renderBody = () => {
    if (entries.length === 0) {
      return empty
    }
    if (filtered.length === 0) {
      return <span className="review-section__empty">Aucun fichier ne correspond.</span>
    }
    return mode === 'tree' ? (
      <FileTree
        entries={filtered}
        section={section}
        partial={partial}
        forceExpand={filtering}
        recede={recede}
      />
    ) : (
      <ul className="review-section__list">
        {filtered.map((entry) => (
          <FileRow
            key={entry.path}
            section={section}
            entry={entry}
            partial={partial?.has(entry.path)}
            recede={recede}
          />
        ))}
      </ul>
    )
  }

  return (
    <section className="review-section" data-section={section} aria-labelledby={titleId}>
      <div className="review-section__sentinel" ref={sentinelRef} aria-hidden="true" />
      <div
        className="review-section__head"
        data-stuck={stuck || undefined}
        data-bulkable={filtered.length > 0 || undefined}
      >
        <button
          type="button"
          className="review-section__toggle"
          aria-expanded={open}
          onClick={onToggle}
        >
          <span className="review-section__title">
            <Chevron open={open} className="disclosure-chevron" />
            <span className="review-section__title-text" id={titleId}>
              {title}
            </span>
          </span>
        </button>
        {filtered.length > 0 ? (
          <Tooltip content={bulkLabel}>
            <button
              type="button"
              className={
                isQueue ? 'review-section__bulk' : 'review-section__bulk review-section__bulk--undo'
              }
              onClick={runBulk}
              aria-label={bulkLabel}
            >
              {isQueue ? <CheckAllIcon /> : <UndoIcon />}
            </button>
          </Tooltip>
        ) : null}
        <span
          className={
            isQueue ? 'review-section__count review-section__count--queue' : 'review-section__count'
          }
          data-empty={(isQueue && entries.length === 0) || undefined}
        >
          {count}
        </span>
      </div>
      {open ? renderBody() : null}
    </section>
  )
}
