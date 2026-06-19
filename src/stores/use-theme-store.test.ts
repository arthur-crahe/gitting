import { beforeEach, describe, expect, it } from 'vitest'
import { ACCENT_COLORS, useThemeStore } from './use-theme-store'

describe('useThemeStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useThemeStore.setState({ appearance: 'dark', accent: 'iris' })
  })

  it('exposes a non-empty, unique accent palette', () => {
    expect(ACCENT_COLORS.length).toBeGreaterThan(0)
    expect(new Set(ACCENT_COLORS).size).toBe(ACCENT_COLORS.length)
  })

  it('toggles appearance and persists the choice', () => {
    useThemeStore.getState().toggleAppearance()
    expect(useThemeStore.getState().appearance).toBe('light')
    expect(localStorage.getItem('gitting.appearance')).toBe('light')

    useThemeStore.getState().toggleAppearance()
    expect(useThemeStore.getState().appearance).toBe('dark')
    expect(localStorage.getItem('gitting.appearance')).toBe('dark')
  })

  it('sets the accent and persists the choice', () => {
    useThemeStore.getState().setAccent('jade')
    expect(useThemeStore.getState().accent).toBe('jade')
    expect(localStorage.getItem('gitting.accent')).toBe('jade')
  })
})
