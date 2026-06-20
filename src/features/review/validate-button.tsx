import { IconButton, Tooltip } from '@radix-ui/themes'
import { CheckIcon, UndoIcon } from '../../components/icons'
import type { DiffSection } from '../../stores/use-diff-store'
import { useRepoStore } from '../../stores/use-repo-store'
import { useRowActions } from './row-context'

/**
 * Trailing action on a file row: a check to validate (stage) an unstaged file,
 * or a back-arrow to un-validate (unstage) a staged one. Revealed on row hover
 * (via `.row-act`); shared by the flat list and the tree. While its index write
 * is in flight the button spins and is disabled, so it stays visible and a
 * second click can't queue a duplicate write. Kept out of the Tab order
 * (`tabIndex={-1}`): the keyboard model validates via Enter / Backspace, so a
 * tabbable-but-invisible button would be a dead stop.
 */
export function ValidateButton({ section, path }: { section: DiffSection; path: string }) {
  const { act } = useRowActions()
  const pending = useRepoStore((s) => s.pendingPaths.has(path))
  const validate = section === 'unstaged'
  return (
    <Tooltip content={validate ? 'Valider' : 'Dévalider'}>
      <IconButton
        className="row-act"
        data-pending={pending || undefined}
        variant="ghost"
        color="gray"
        size="1"
        tabIndex={-1}
        aria-label={validate ? `Valider ${path}` : `Dévalider ${path}`}
        loading={pending}
        disabled={pending}
        onClick={() => act(section, path)}
      >
        {validate ? <CheckIcon /> : <UndoIcon />}
      </IconButton>
    </Tooltip>
  )
}
