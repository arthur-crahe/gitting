import { create } from 'zustand'
import { toMessage } from '../lib/error'
import { isTauriRuntime } from '../lib/runtime'
import { type AvailableUpdate, checkForUpdate, installUpdate } from '../lib/updater'

/** Lifecycle of the in-app updater, surfaced to the UI. */
export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'up-to-date' | 'error'

/** State and actions for checking, downloading and installing app updates. */
export interface UpdateStoreState {
  /** Current phase of the updater. */
  phase: UpdatePhase
  /** The available update once a check finds one, else `null`. */
  available: AvailableUpdate | null
  /** Bytes downloaded so far during an install. */
  downloaded: number
  /** Total bytes to download, or `0` when unknown. */
  total: number
  /** Human-readable error message when {@link phase} is `'error'`. */
  error: string | null
  /**
   * Query the endpoint. A `manual` (user-initiated) check confirms when up to date
   * and surfaces errors; a silent launch check only reveals an available update,
   * staying quiet otherwise. No-op outside Tauri or while busy.
   */
  check: (manual?: boolean) => Promise<void>
  /** Download, install and relaunch the available update. */
  install: () => Promise<void>
  /** Clear the current notice until the next check. */
  dismiss: () => void
}

/**
 * Store driving the update notice. A silent check runs on app launch; the user
 * can re-check on demand and opts in to installing. Kept inert in a plain
 * browser (no Tauri IPC).
 */
export const useUpdateStore = create<UpdateStoreState>((set, get) => ({
  phase: 'idle',
  available: null,
  downloaded: 0,
  total: 0,
  error: null,

  check: async (manual = false) => {
    if (!isTauriRuntime()) {
      return
    }
    const { phase } = get()
    if (phase === 'checking' || phase === 'downloading') {
      return
    }
    set({ phase: 'checking', error: null })
    try {
      const update = await checkForUpdate()
      if (update) {
        set({ phase: 'available', available: update })
      } else {
        // Up to date: confirm on a manual check, stay silent on launch.
        set({ phase: manual ? 'up-to-date' : 'idle', available: null })
      }
    } catch (error) {
      // Surface failures only when the user asked; a silent launch check that
      // fails (e.g. offline) returns quietly to idle.
      set(manual ? { phase: 'error', error: toMessage(error) } : { phase: 'idle' })
    }
  },

  install: async () => {
    const { available, phase } = get()
    if (!available || phase === 'downloading') {
      return
    }
    set({ phase: 'downloading', downloaded: 0, total: 0, error: null })
    try {
      await installUpdate(available, ({ downloaded, total }) => set({ downloaded, total }))
      // The app relaunches on success — nothing to set here.
    } catch (error) {
      set({ phase: 'error', error: toMessage(error) })
    }
  },

  dismiss: () => set({ phase: 'idle', available: null, error: null }),
}))
