import { Flex, Text } from '@radix-ui/themes'
import { useDiffStore } from '../../../stores/use-diff-store'
import { StatusGlyph } from '../status-glyph'
import { DiffView } from './diff-view'

/**
 * The right pane of the review surface: the diff of the selected file, with its
 * path and status glyph in a header. Shows an empty state when nothing is
 * selected, a loading/error line while the diff resolves, and the {@link
 * DiffView} once it is ready.
 */
export function DiffPanel() {
  const selected = useDiffStore((s) => s.selected)
  const diff = useDiffStore((s) => s.diff)
  const phase = useDiffStore((s) => s.phase)
  const error = useDiffStore((s) => s.error)

  if (!selected) {
    return (
      <Flex align="center" justify="center" className="diff-panel diff-panel--empty">
        <Text size="2" color="gray">
          Sélectionnez un fichier pour voir ses changements.
        </Text>
      </Flex>
    )
  }

  return (
    <div className="diff-panel">
      <div className="diff-panel__head">
        {diff ? <StatusGlyph kind={diff.changeKind} /> : null}
        <span className="diff-panel__path" title={selected.path}>
          {selected.path}
        </span>
      </div>
      <div className="diff-panel__body">
        {phase === 'error' ? (
          <Text size="2" color="red" className="diff-empty">
            {error}
          </Text>
        ) : diff ? (
          <DiffView file={diff} />
        ) : phase === 'loading' ? (
          <Text size="2" color="gray" className="diff-empty">
            Chargement…
          </Text>
        ) : (
          <Text size="2" color="gray" className="diff-empty">
            Aucun diff pour ce fichier.
          </Text>
        )}
      </div>
    </div>
  )
}
