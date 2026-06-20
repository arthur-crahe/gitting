import { Theme } from '@radix-ui/themes'
import type { ReactNode } from 'react'
import { useThemeStore } from '../stores/use-theme-store'

/**
 * Wraps the app in the Radix `<Theme>`, driven by {@link useThemeStore} so the
 * user's appearance and accent choices apply app-wide and update live.
 *
 * Fixed design tokens (see `docs/reference/design-system.md`): the cool `slate`
 * gray, a tight `small` radius, and `95%` scaling for a dense, pro-tool 13px base.
 * Only appearance and accent vary at runtime; the accent is applied as a scalpel
 * (focus, selection, primary action) — never as a surface fill.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const appearance = useThemeStore((s) => s.appearance)
  const accent = useThemeStore((s) => s.accent)

  return (
    <Theme
      appearance={appearance}
      accentColor={accent}
      grayColor="slate"
      radius="small"
      scaling="95%"
    >
      {children}
    </Theme>
  )
}
