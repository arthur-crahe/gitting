import { Callout, Flex, Heading, IconButton, Text, Tooltip } from '@radix-ui/themes'
import { type CSSProperties, useMemo, useRef, useState } from 'react'
import { Chevron, RefreshIcon } from '../../components/icons'
import type { StatusEntry } from '../../lib/git'
import { splitPath } from '../../lib/path'
import type { DiffSection } from '../../stores/use-diff-store'
import { useDiffStore } from '../../stores/use-diff-store'
import { useRepoStore } from '../../stores/use-repo-store'
import { useSidebarStore } from '../../stores/use-sidebar-store'
import { useViewStore, type ViewMode } from '../../stores/use-view-store'
import { RepoPicker } from '../repo/repo-picker'
import { changeKindGlyph } from './change-kind'
import { DiffPanel } from './diff/diff-panel'
import { type RowActions, RowProvider, useIsSelected, useRowActions } from './row-context'
import { SidebarResizer } from './sidebar-resizer'
import { StatusGlyph } from './status-glyph'
import { FileTree } from './tree-view'
import { ValidateButton } from './validate-button'
import { ViewModeToggle } from './view-mode-toggle'

/** A single changed file: a clickable select button plus its validate action. */
function FileRow({ section, entry }: { section: DiffSection; entry: StatusEntry }) {
  const { select } = useRowActions()
  const selected = useIsSelected(section, entry.path)
  const glyph = changeKindGlyph(entry.kind)
  const { dir, name } = splitPath(entry.path)
  return (
    <div className="file-row" data-selected={selected}>
      <button
        type="button"
        className="file-row__select"
        onClick={() => select(section, entry.path)}
        title={`${glyph.label} — ${entry.path}`}
        aria-current={selected ? 'true' : undefined}
      >
        <StatusGlyph kind={entry.kind} />
        <span className="file-row__path">
          {dir ? <span className="file-row__dir">{dir}</span> : null}
          <span className="file-row__name">{name}</span>
        </span>
      </button>
      <ValidateButton section={section} path={entry.path} />
    </div>
  )
}

/** One collapsible review section: a counted, titled list of files. */
function StatusSection({
  title,
  section,
  entries,
  empty,
  mode,
}: {
  title: string
  section: DiffSection
  entries: readonly StatusEntry[]
  empty: string
  mode: ViewMode
}) {
  const [open, setOpen] = useState(true)
  return (
    <section className="review-section">
      <button
        type="button"
        className="review-section__head"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="review-section__title">
          <Chevron open={open} className="disclosure-chevron" />
          <Heading size="3" weight="medium">
            {title}
          </Heading>
        </span>
        <Text size="2" color="gray" className="review-section__count">
          {entries.length}
        </Text>
      </button>
      <div className="review-section__divider" />
      {open ? (
        entries.length === 0 ? (
          <Text size="2" color="gray" className="review-section__empty">
            {empty}
          </Text>
        ) : mode === 'tree' ? (
          <FileTree entries={entries} section={section} />
        ) : (
          <div className="review-section__list">
            {entries.map((entry) => (
              <FileRow key={entry.path} section={section} entry={entry} />
            ))}
          </div>
        )
      ) : null}
    </section>
  )
}

/**
 * The review surface for an opened repository: a toolbar, then a master-detail
 * split — the two collapsible sections ("Validé" on top, "À reviewer" below) on
 * the left, the diff of the selected file on the right. Selecting a file opens
 * its diff; its validate/unvalidate action stages or unstages it, which moves it
 * between the sections and re-aligns the open diff.
 */
export function ReviewView() {
  const status = useRepoStore((s) => s.status)
  const info = useRepoStore((s) => s.info)
  const refresh = useRepoStore((s) => s.refresh)
  const stage = useRepoStore((s) => s.stage)
  const unstage = useRepoStore((s) => s.unstage)
  const error = useRepoStore((s) => s.error)
  const mode = useViewStore((s) => s.mode)
  const sidebarWidth = useSidebarStore((s) => s.width)
  const select = useDiffStore((s) => s.select)
  const sidebarRef = useRef<HTMLDivElement>(null)

  const root = info?.root ?? null
  const actions = useMemo<RowActions>(
    () => ({
      select: (section, path) => {
        if (root) {
          void select(root, { section, path })
        }
      },
      act: (section, path) => {
        void (section === 'unstaged' ? stage(path) : unstage(path))
      },
    }),
    [root, select, stage, unstage],
  )

  if (!status) {
    return null
  }

  const fileCount = status.staged.length + status.unstaged.length

  return (
    <RowProvider value={actions}>
      <div className="review">
        <Flex align="center" justify="between" gap="3" className="review__toolbar">
          <Text size="2" color="gray">
            Valider un fichier le déplace de « À reviewer » vers « Validé ».
          </Text>
          <Flex align="center" gap="2">
            <Tooltip content="Rafraîchir">
              <IconButton
                variant="ghost"
                color="gray"
                size="2"
                aria-label="Rafraîchir"
                onClick={() => void refresh()}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <RepoPicker variant="soft" label="Changer de dépôt" />
          </Flex>
        </Flex>

        {error ? (
          <Callout.Root color="red" size="1">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        ) : null}

        <div className="review-split">
          <div
            className="review-split__list"
            id="review-sidebar"
            ref={sidebarRef}
            style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}
          >
            <div className="review-split__list-head">
              <ViewModeToggle />
              <Text size="1" color="gray" className="review-split__count">
                {fileCount} fichier{fileCount > 1 ? 's' : ''}
              </Text>
            </div>
            <div className="review-split__scroll">
              <StatusSection
                title="Validé"
                section="staged"
                entries={status.staged}
                empty="Rien de validé pour l'instant."
                mode={mode}
              />
              <StatusSection
                title="À reviewer"
                section="unstaged"
                entries={status.unstaged}
                empty="Tout a été relu."
                mode={mode}
              />
            </div>
          </div>
          <SidebarResizer sidebarRef={sidebarRef} />
          <div className="review-split__diff">
            <DiffPanel />
          </div>
        </div>
      </div>
    </RowProvider>
  )
}
