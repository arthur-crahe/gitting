import { IconButton, Tooltip } from '@radix-ui/themes'
import { useThemeStore } from '../stores/use-theme-store'
import { MoonIcon, SunIcon } from './icons'

/** Titlebar button that toggles between the dark and light themes. */
export function AppearanceToggle() {
  const appearance = useThemeStore((s) => s.appearance)
  const toggle = useThemeStore((s) => s.toggleAppearance)
  const isDark = appearance === 'dark'

  return (
    <Tooltip content={isDark ? 'Passer en clair' : 'Passer en sombre'}>
      <IconButton
        variant="ghost"
        color="gray"
        size="1"
        aria-label={isDark ? 'Passer en thème clair' : 'Passer en thème sombre'}
        onClick={toggle}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
      </IconButton>
    </Tooltip>
  )
}
