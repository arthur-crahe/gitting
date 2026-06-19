import { create } from 'zustand'

/** Light or dark theme. */
export type Appearance = 'light' | 'dark'

/**
 * Accent colors offered in the picker, in display order — a curated subset of
 * the Radix accent scales. Each value is a valid Radix `<Theme accentColor>` and
 * has a matching `--<color>-*` CSS scale available globally for swatches. This
 * array is the single source of truth; {@link AccentColor} is derived from it.
 */
export const ACCENT_COLORS = [
  'iris',
  'violet',
  'blue',
  'cyan',
  'teal',
  'jade',
  'green',
  'amber',
  'orange',
  'tomato',
  'ruby',
  'pink',
] as const

/** A selectable accent color — one of {@link ACCENT_COLORS}. */
export type AccentColor = (typeof ACCENT_COLORS)[number]

const APPEARANCE_KEY = 'gitting.appearance'
const ACCENT_KEY = 'gitting.accent'

/** Persisted appearance, else the OS preference, else dark. */
function initialAppearance(): Appearance {
  const stored = readStorage(APPEARANCE_KEY)
  if (stored === 'light' || stored === 'dark') {
    return stored
  }
  if (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: light)').matches
  ) {
    return 'light'
  }
  return 'dark'
}

/** Persisted accent, else the default (`iris`). */
function initialAccent(): AccentColor {
  const stored = readStorage(ACCENT_KEY)
  return ACCENT_COLORS.includes(stored as AccentColor) ? (stored as AccentColor) : 'iris'
}

/** Reads a key from `localStorage`, tolerating its absence (e.g. in tests). */
function readStorage(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
  } catch {
    return null
  }
}

/** Writes a key to `localStorage`, ignoring failures (private mode, tests). */
function writeStorage(key: string, value: string): void {
  try {
    localStorage?.setItem(key, value)
  } catch {
    // Persistence is best-effort; the in-memory store stays authoritative.
  }
}

/** State and actions for the user's theme preferences. */
export interface ThemeStoreState {
  /** Current appearance. */
  appearance: Appearance
  /** Current accent color, applied app-wide via the Radix theme. */
  accent: AccentColor
  /** Flip between light and dark, persisting the choice. */
  toggleAppearance: () => void
  /** Set the accent color, persisting the choice. */
  setAccent: (accent: AccentColor) => void
}

/**
 * Drives the app-wide Radix theme. The appearance starts from the OS preference
 * (or the last explicit choice) and the accent from the last picked color; both
 * are persisted to `localStorage` so they survive restarts. Changes propagate to
 * the whole UI through the {@link ThemeProvider}.
 */
export const useThemeStore = create<ThemeStoreState>((set, get) => ({
  appearance: initialAppearance(),
  accent: initialAccent(),

  toggleAppearance: () => {
    const next: Appearance = get().appearance === 'dark' ? 'light' : 'dark'
    writeStorage(APPEARANCE_KEY, next)
    set({ appearance: next })
  },

  setAccent: (accent) => {
    writeStorage(ACCENT_KEY, accent)
    set({ accent })
  },
}))
