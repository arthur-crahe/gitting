import { Callout, Flex, Heading, IconButton, Text, Tooltip } from '@radix-ui/themes'
import { useState } from 'react'
import { RefreshIcon } from '../../components/icons'
import type { StatusEntry } from '../../lib/git'
import { useRepoStore } from '../../stores/use-repo-store'
import { RepoPicker } from '../repo/repo-picker'
import { changeKindGlyph } from './change-kind'

/** Disclosure chevron — points down when open, right when collapsed. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className="review-section__chevron"
      data-open={open}
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Splits a repo-relative path into its directory prefix and file name. */
function splitPath(path: string): { dir: string; name: string } {
  const slash = path.lastIndexOf('/')
  return slash === -1
    ? { dir: '', name: path }
    : { dir: path.slice(0, slash + 1), name: path.slice(slash + 1) }
}

/** A single changed file: its status letter and repository-relative path. */
function FileRow({ entry }: { entry: StatusEntry }) {
  const glyph = changeKindGlyph(entry.kind)
  const { dir, name } = splitPath(entry.path)
  return (
    <div className="file-row" title={`${glyph.label} — ${entry.path}`}>
      <Text
        className="status-glyph"
        color={glyph.color}
        weight="bold"
        size="2"
        aria-label={glyph.label}
      >
        {glyph.letter}
      </Text>
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
}: {
  title: string
  entries: readonly StatusEntry[]
  empty: string
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
          <Chevron open={open} />
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
 * refresh or switch repo.
 */
export function ReviewView() {
  const status = useRepoStore((s) => s.status)
  const refresh = useRepoStore((s) => s.refresh)
  const error = useRepoStore((s) => s.error)

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
      />
      <StatusSection title="À reviewer" entries={status.unstaged} empty="Tout a été relu." />
    </Flex>
  )
}
