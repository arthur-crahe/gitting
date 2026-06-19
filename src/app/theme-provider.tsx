import { Theme } from '@radix-ui/themes'
import type { ReactNode } from 'react'
import { useThemeStore } from '../stores/use-theme-store'

/**
 * Wraps the app in the Radix `<Theme>`, driven by {@link useThemeStore} so the
 * user's appearance and accent choices apply app-wide and update live. The gray
 * scale and radius are fixed design tokens; only appearance and accent vary.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const appearance = useThemeStore((s) => s.appearance)
  const accent = useThemeStore((s) => s.accent)

  return (
    <Theme appearance={appearance} accentColor={accent} grayColor="slate" radius="medium">
      {children}
    </Theme>
  )
}
