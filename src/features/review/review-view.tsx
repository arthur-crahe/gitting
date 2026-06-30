import { Callout } from '@radix-ui/themes'
import { useMemo, useRef } from 'react'
import { UpdateNotice } from '../../components/update-notice'
import { useDiffStore } from '../../stores/use-diff-store'
import { useRepoStore } from '../../stores/use-repo-store'
import { useSidebarStore } from '../../stores/use-sidebar-store'
import { DiffPanel } from './diff/diff-panel'
import { type RowActions, RowProvider } from './row-context'
import { Sidebar } from './sidebar'
import { SidebarResizer } from './sidebar-resizer'

/**
 * The review surface for an opened repository: an edge-to-edge master-detail
 * split. The left pane is the {@link Sidebar} (filter, two sections,
 * keyboard burn-down); the right pane is the diff of the selected file. Selecting
 * a file opens its diff; its validate/unvalidate action stages or unstages it,
 * moving it between the sections and re-aligning the open diff. Row interactions
 * (open / validate) are provided once here so the list and the tree share them.
 */
export function ReviewView() {
  const status = useRepoStore((s) => s.status)
  const root = useRepoStore((s) => s.info?.root ?? null)
  const stage = useRepoStore((s) => s.stage)
  const unstage = useRepoStore((s) => s.unstage)
  const error = useRepoStore((s) => s.error)
  const sidebarWidth = useSidebarStore((s) => s.width)
  const select = useDiffStore((s) => s.select)
  const sidebarRef = useRef<HTMLDivElement>(null)

  const actions = useMemo<RowActions>(
    () => ({
      select: (section, path) => {
        if (root) {
          select(root, { section, path })
        }
      },
      act: (section, path) => (section === 'unstaged' ? stage(path) : unstage(path)),
    }),
    [root, select, stage, unstage],
  )

  if (!status) {
    return null
  }

  return (
    <RowProvider value={actions}>
      <div className="review">
        <div className="review__banner">
          <UpdateNotice />
        </div>
        {error ? (
          <div className="review__banner">
            <Callout.Root color="red" size="1">
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          </div>
        ) : null}

        <div className="review-split">
          <Sidebar sidebarRef={sidebarRef} width={sidebarWidth} />
          <SidebarResizer sidebarRef={sidebarRef} />
          <div className="review-split__diff">
            <DiffPanel />
          </div>
        </div>
      </div>
    </RowProvider>
  )
}
