import { Text } from '@radix-ui/themes'
import type { DiffFile } from '../../../lib/git'
import { DiffLineRow } from './diff-line'
import { flattenHunks } from './flatten-hunks'

/** The reason a file has no line-by-line diff to render. */
function emptyReason(file: DiffFile): string {
  if (file.isBinary) {
    return 'Fichier binaire — pas d’aperçu ligne à ligne.'
  }
  if (file.changeKind === 'conflict') {
    return 'Conflit non résolu — résolvez-le pour le reviewer.'
  }
  if (file.changeKind === 'renamed') {
    return 'Fichier renommé.'
  }
  if (file.oldMode && file.newMode && file.oldMode !== file.newMode) {
    return `Mode modifié : ${file.oldMode} → ${file.newMode}.`
  }
  return 'Aucune modification de contenu.'
}

/**
 * Renders a file's structured diff as a unified list of hunk headers and lines.
 * Binary, conflict and mode-only files (no hunks) show a short notice instead.
 *
 * The lines come straight from {@link flattenHunks} over the gix-produced hunks
 * — nothing is re-diffed here, preserving the ADR fidelity invariant.
 */
export function DiffView({ file }: { file: DiffFile }) {
  if (file.isBinary || file.hunks.length === 0) {
    return (
      <Text size="2" color="gray" className="diff-empty">
        {emptyReason(file)}
      </Text>
    )
  }

  return (
    <div className="diff">
      {flattenHunks(file).map((row) =>
        row.type === 'header' ? (
          <div key={row.key} className="diff-hunk-head">
            {row.text}
          </div>
        ) : (
          <DiffLineRow key={row.key} line={row.line} />
        ),
      )}
    </div>
  )
}
