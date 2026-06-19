import { IconButton, Popover, Text, Tooltip } from '@radix-ui/themes'
import { ACCENT_COLORS, useThemeStore } from '../stores/use-theme-store'

/**
 * Titlebar control for the app-wide accent color. The trigger shows the current
 * accent; the popover offers the curated palette as swatches. Picking one
 * updates the Radix theme live (and persists it) — see {@link useThemeStore}.
 */
export function AccentPicker() {
  const accent = useThemeStore((s) => s.accent)
  const setAccent = useThemeStore((s) => s.setAccent)

  return (
    <Popover.Root>
      <Tooltip content="Couleur d'accent">
        <Popover.Trigger>
          <IconButton
            variant="ghost"
            color="gray"
            size="1"
            aria-label="Choisir la couleur d'accent"
          >
            <span className="accent-trigger" style={{ background: `var(--${accent}-9)` }} />
          </IconButton>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Content size="1" width="196px">
        <Text size="1" color="gray" mb="2" as="div">
          Couleur d'accent
        </Text>
        <div className="accent-grid">
          {ACCENT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className="accent-swatch"
              data-selected={color === accent}
              style={{ background: `var(--${color}-9)` }}
              aria-label={color}
              aria-pressed={color === accent}
              title={color}
              onClick={() => setAccent(color)}
            />
          ))}
        </div>
      </Popover.Content>
    </Popover.Root>
  )
}
