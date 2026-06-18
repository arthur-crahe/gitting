import { IconButton, Tooltip } from '@radix-ui/themes'
import { useUpdateStore } from '../stores/use-update-store'

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

/** Circular-arrow glyph; decorative, the button carries the accessible name. */
function RefreshIcon() {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative glyph; the button provides the aria-label.
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M13.4 8a5.4 5.4 0 1 1-1.5-3.8" />
      <path d="M13.6 2.6 V5 H11.2" />
    </svg>
  )
}
