import { Button } from '@radix-ui/themes'
import { useUpdateStore } from '../stores/use-update-store'

/**
 * Triggers a user-initiated update check. Shows a spinner while checking and
 * is disabled while a check or download is in flight. Results (up-to-date,
 * available, error) are surfaced by {@link UpdateNotice}.
 */
export function CheckForUpdatesButton() {
  const phase = useUpdateStore((s) => s.phase)
  const check = useUpdateStore((s) => s.check)

  return (
    <Button
      size="1"
      variant="soft"
      color="gray"
      loading={phase === 'checking'}
      disabled={phase === 'downloading'}
      onClick={() => void check(true)}
    >
      Vérifier les mises à jour
    </Button>
  )
}
