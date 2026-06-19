import { create } from 'zustand'
import { clampWidth, DEFAULT_WIDTH } from '../features/review/resize-utils'
import { readStorage, writeStorage } from '../lib/storage'

const SIDEBAR_WIDTH_KEY = 'gitting.sidebarWidth'

/**
 * Persisted sidebar width, clamped on load so a corrupt or out-of-range stored
 * value can never produce an invalid pane; falls back to the default otherwise.
 * Exported for unit testing of the parse/clamp path.
 */
export function initialWidth(): number {
  const stored = readStorage(SIDEBAR_WIDTH_KEY)
  if (stored !== null) {
    const parsed = Number.parseInt(stored, 10)
    if (Number.isFinite(parsed)) {
      return clampWidth(parsed)
    }
  }
  return DEFAULT_WIDTH
}

/** State and actions for the review sidebar's width. */
export interface SidebarStoreState {
  /** Current sidebar width in px (always within the clamp bounds). */
  width: number
  /** Set the width, clamping then persisting the choice. */
  setWidth: (px: number) => void
  /** Reset to the default width (the double-click action). */
  reset: () => void
}

/**
 * Store for the review sidebar width — mirrors {@link useViewStore}: a single
 * concern, persisted to `localStorage` (`gitting.sidebarWidth`) via the
 * best-effort {@link writeStorage}, so it survives restarts like the layout and
 * theme prefs. The clamp is the single source of truth for the value; see
 * ADR 0003.
 */
export const useSidebarStore = create<SidebarStoreState>((set) => ({
  width: initialWidth(),

  setWidth: (px) => {
    const width = clampWidth(px)
    writeStorage(SIDEBAR_WIDTH_KEY, String(width))
    set({ width })
  },

  reset: () => {
    writeStorage(SIDEBAR_WIDTH_KEY, String(DEFAULT_WIDTH))
    set({ width: DEFAULT_WIDTH })
  },
}))
