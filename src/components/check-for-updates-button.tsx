import { IconButton, Tooltip } from '@radix-ui/themes'
import { useUpdateStore } from '../stores/use-update-store'
import { RefreshIcon } from './icons'

/**
 * Titlebar action that triggers a user-initiated update check. Renders as a flat
 * icon button with a tooltip; shows a spinner while checking and is disabled
 * while a download is in flight. Results (up-to-date, available, error) are
 * surfaced by {@link UpdateNotice} in the content area.
 */
export function CheckForUpdatesButton() {
  const phase = useUpdateStore((s) => s.phase)
  const check = useUpdateStore((s) => s.check)

  return (
    <Tooltip content="Vérifier les mises à jour">
      <IconButton
        size="1"
        variant="ghost"
        color="gray"
        aria-label="Vérifier les mises à jour"
        loading={phase === 'checking'}
        disabled={phase === 'downloading'}
        onClick={() => void check(true)}
      >
        <RefreshIcon />
      </IconButton>
    </Tooltip>
  )
}
