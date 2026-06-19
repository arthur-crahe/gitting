import { create } from 'zustand'
import { readStorage, writeStorage } from '../lib/storage'

/** How the changed files are laid out in each review section. */
export type ViewMode = 'list' | 'tree'

const VIEW_MODE_KEY = 'gitting.viewMode'

/** Persisted view mode, else the default (`list` — the flat file list). */
function initialMode(): ViewMode {
  const stored = readStorage(VIEW_MODE_KEY)
  return stored === 'tree' ? 'tree' : 'list'
}

/** State and actions for the review file-layout preference. */
export interface ViewStoreState {
  /** Current layout, applied to both review sections. */
  mode: ViewMode
  /** Set the layout, persisting the choice. */
  setMode: (mode: ViewMode) => void
}

/**
 * Store for the review file layout: a flat list ("Liste", the default) or a
 * collapsible tree ("Arbre"). The choice is global (both sections share it) and
 * persisted to `localStorage`, so it survives restarts like the theme prefs.
 */
export const useViewStore = create<ViewStoreState>((set) => ({
  mode: initialMode(),

  setMode: (mode) => {
    writeStorage(VIEW_MODE_KEY, mode)
    set({ mode })
  },
}))
