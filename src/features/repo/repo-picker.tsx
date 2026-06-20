import { Button } from '@radix-ui/themes'
import { useRepoStore } from '../../stores/use-repo-store'

/**
 * The primary action that prompts for a directory and opens it as the repository
 * under review. Disabled (and spinning) while a repository is loading; cancelling
 * the dialog is a no-op.
 *
 * @param size - Radix button size.
 */
export function RepoPicker({ size = '2' }: { size?: '1' | '2' | '3' }) {
  const phase = useRepoStore((s) => s.phase)
  const openViaDialog = useRepoStore((s) => s.openViaDialog)

  return (
    <Button
      variant="solid"
      size={size}
      disabled={phase === 'loading'}
      loading={phase === 'loading'}
      onClick={() => void openViaDialog()}
    >
      Ouvrir un dépôt…
    </Button>
  )
}
