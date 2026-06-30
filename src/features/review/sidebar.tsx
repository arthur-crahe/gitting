import {
  type CSSProperties,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useRepoStore } from '../../stores/use-repo-store'
import { useViewStore } from '../../stores/use-view-store'
import { CompletionBeat } from './completion-beat'
import { RepoMenu } from './repo-menu'
import { type ReviewStats, reviewStats } from './review-stats'
import { useRowActions } from './row-context'
import { SidebarFilter } from './sidebar-filter'
import { StatusSection } from './status-section'
import { useSidebarKeyboard } from './use-sidebar-keyboard'
import { ViewModeToggle } from './view-mode-toggle'

/**
 * The "À reviewer" empty body: the earned completion beat when work has been
 * validated and nothing is left to review, else a calm clean-tree line. Kept
 * distinct so the reward never reads as "nothing changed".
 */
function QueueEmpty({ stats }: { stats: ReviewStats }) {
  if (stats.complete) {
    return <CompletionBeat reviewed={stats.reviewed} prefix="sidebar-complete" iconSize={22} />
  }
  return <span className="review-section__empty">Aucune modification locale.</span>
}

/**
 * The review file list — the left pane. A header (instant filter +
 * list/tree toggle + repo menu) over a scroll area holding the two sections:
 * "À reviewer" (the active queue, on top, open by default, accent count badge)
 * and "Validé" (the archive, below, collapsed by default, recessed) — both
 * collapsible. Owns the filter and collapse state, and wires the keyboard model
 * (arrow navigation + Enter-to-validate-and-advance), restoring focus to the
 * pre-computed next row after each stage/unstage re-render.
 *
 * @param sidebarRef the pane element (also `#review-sidebar`, driven by
 *   `--sidebar-width` and referenced by the resize handle's `aria-controls`).
 * @param width the current sidebar width in px (from the sidebar store).
 */
export function Sidebar({
  sidebarRef,
  width,
}: {
  sidebarRef: RefObject<HTMLDivElement | null>
  width: number
}) {
  const status = useRepoStore((s) => s.status)
  const root = useRepoStore((s) => s.info?.root ?? null)
  const reviewedHere = useRepoStore((s) => s.reviewedHere)
  const mode = useViewStore((s) => s.mode)
  const actions = useRowActions()

  const [query, setQuery] = useState('')
  const [queueOpen, setQueueOpen] = useState(true)
  const [validatedOpen, setValidatedOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)

  // The filter clears via Esc from inside the keyboard model; read the live
  // query through a ref so the callback can stay stable.
  const queryRef = useRef(query)
  queryRef.current = query
  const clearFilter = useCallback(() => {
    if (queryRef.current) {
      setQuery('')
      return true
    }
    return false
  }, [])

  const { onKeyDown, restoreFocus } = useSidebarKeyboard({
    rootRef: sidebarRef,
    filterRef,
    actions,
    clearFilter,
  })

  // A new repository starts fresh: no filter, queue open, archive collapsed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: root is the reset trigger — clear transient UI on a repo switch, not on every status change.
  useEffect(() => {
    setQuery('')
    setQueueOpen(true)
    setValidatedOpen(false)
  }, [root])

  // After a stage/unstage re-render, land focus on the row the keyboard model
  // pre-picked (the originally focused row has by then moved sections).
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on each status change to catch the post-mutation render; restoreFocus no-ops when nothing is pending.
  useLayoutEffect(() => {
    restoreFocus()
  }, [status, restoreFocus])

  if (!status) {
    return null
  }

  const stats = reviewStats(status, reviewedHere)

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the key handler delegates list navigation for the focusable rows it contains; rows carry the roles/labels.
    <div
      className="review-split__list"
      id="review-sidebar"
      ref={sidebarRef}
      style={{ '--sidebar-width': `${width}px` } as CSSProperties}
      onKeyDown={onKeyDown}
    >
      <div className="review-split__list-head">
        <SidebarFilter ref={filterRef} value={query} onChange={setQuery} />
        <div className="review-split__head-actions">
          <ViewModeToggle />
          <RepoMenu />
        </div>
      </div>
      <div className="review-split__scroll" ref={scrollRef}>
        <StatusSection
          title="À reviewer"
          section="unstaged"
          entries={status.unstaged}
          query={query}
          mode={mode}
          open={queueOpen}
          onToggle={() => setQueueOpen((prev) => !prev)}
          scrollRef={scrollRef}
          empty={<QueueEmpty stats={stats} />}
        />
        <StatusSection
          title="Validé"
          section="staged"
          entries={status.staged}
          query={query}
          mode={mode}
          open={validatedOpen}
          onToggle={() => setValidatedOpen((prev) => !prev)}
          recede
          scrollRef={scrollRef}
          empty={<span className="review-section__empty">Rien de validé pour l'instant.</span>}
        />
      </div>
    </div>
  )
}
