import { Button } from '@radix-ui/themes'
import { useRepoStore } from '../../stores/use-repo-store'

/**
 * Button that prompts for a directory and opens it as the repository under
 * review. Disabled while a repository is loading. Cancelling the dialog is a
 * no-op.
 *
 * @param variant - Radix button variant (`'solid'` for the welcome screen,
 *   `'soft'` for a secondary "change repo" action).
 * @param size - Radix button size.
 * @param label - button text; defaults to `'Ouvrir un dépôt…'`.
 */
export function RepoPicker({
  variant = 'solid',
  size = '2',
  label = 'Ouvrir un dépôt…',
}: {
  variant?: 'solid' | 'soft'
  size?: '1' | '2' | '3'
  label?: string
}) {
  const phase = useRepoStore((s) => s.phase)
  const openViaDialog = useRepoStore((s) => s.openViaDialog)

  return (
    <Button
      variant={variant}
      size={size}
      disabled={phase === 'loading'}
      loading={phase === 'loading'}
      onClick={() => void openViaDialog()}
    >
      {label}
    </Button>
  )
}
