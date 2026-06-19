import { IconButton, Tooltip } from '@radix-ui/themes'
import { CheckIcon, UndoIcon } from '../../components/icons'
import type { DiffSection } from '../../stores/use-diff-store'
import { useRowActions } from './row-context'

/**
 * Trailing action on a file row: a check to validate (stage) an unstaged file,
 * or a back-arrow to un-validate (unstage) a staged one. Revealed on row hover
 * (via `.row-act`); shared by the flat list and the tree.
 */
export function ValidateButton({ section, path }: { section: DiffSection; path: string }) {
  const { act } = useRowActions()
  const validate = section === 'unstaged'
  return (
    <Tooltip content={validate ? 'Valider' : 'Dévalider'}>
      <IconButton
        className="row-act"
        variant="ghost"
        color="gray"
        size="1"
        aria-label={validate ? `Valider ${path}` : `Dévalider ${path}`}
        onClick={() => act(section, path)}
      >
        {validate ? <CheckIcon /> : <UndoIcon />}
      </IconButton>
    </Tooltip>
  )
}
