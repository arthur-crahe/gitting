import { Callout, Flex, Heading, IconButton, Text, Tooltip } from '@radix-ui/themes'
import { useState } from 'react'
import { Chevron, RefreshIcon } from '../../components/icons'
import type { StatusEntry } from '../../lib/git'
import { splitPath } from '../../lib/path'
import { useRepoStore } from '../../stores/use-repo-store'
import { useViewStore, type ViewMode } from '../../stores/use-view-store'
import { RepoPicker } from '../repo/repo-picker'
import { changeKindGlyph } from './change-kind'
import { StatusGlyph } from './status-glyph'
import { FileTree } from './tree-view'
import { ViewModeToggle } from './view-mode-toggle'

/** A single changed file in the flat list: its status glyph and full path. */
function FileRow({ entry }: { entry: StatusEntry }) {
  const glyph = changeKindGlyph(entry.kind)
  const { dir, name } = splitPath(entry.path)
  return (
    <div className="file-row" title={`${glyph.label} — ${entry.path}`}>
      <StatusGlyph kind={entry.kind} />
      <span className="file-row__path">
        {dir ? <span className="file-row__dir">{dir}</span> : null}
        <span className="file-row__name">{name}</span>
      </span>
    </div>
  )
}

/** One collapsible review section: a counted, titled list of files. */
function StatusSection({
  title,
  entries,
  empty,
  mode,
}: {
  title: string
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
          <FileTree entries={entries} />
        ) : (
          <div className="review-section__list">
            {entries.map((entry) => (
              <FileRow key={entry.path} entry={entry} />
            ))}
          </div>
        )
      ) : null}
    </section>
  )
}

/**
 * The review surface for an opened repository: the two collapsible sections —
 * "Validé" (staged) on top, "À reviewer" (unstaged) below — with a toolbar to
 * switch the file layout (list/tree), refresh, or change repo.
 */
export function ReviewView() {
  const status = useRepoStore((s) => s.status)
  const refresh = useRepoStore((s) => s.refresh)
  const error = useRepoStore((s) => s.error)
  const mode = useViewStore((s) => s.mode)

  if (!status) {
    return null
  }

  return (
    <Flex direction="column" gap="6">
      <Flex align="center" justify="between" gap="3">
        <Text size="2" color="gray">
          Valider un fichier le déplace de « À reviewer » vers « Validé ».
        </Text>
        <Flex align="center" gap="2">
          <ViewModeToggle />
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

      <StatusSection
        title="Validé"
        entries={status.staged}
        empty="Rien de validé pour l'instant."
        mode={mode}
      />
      <StatusSection
        title="À reviewer"
        entries={status.unstaged}
        empty="Tout a été relu."
        mode={mode}
      />
    </Flex>
  )
}
