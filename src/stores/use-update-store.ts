import { create } from 'zustand'
import { type AvailableUpdate, checkForUpdate, installUpdate, isTauriRuntime } from '../lib/updater'

/** Lifecycle of the in-app updater, surfaced to the UI. */
export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'error'

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
  /** Query the endpoint. No-ops outside Tauri or while already busy. */
  check: () => Promise<void>
  /** Download, install and relaunch the available update. */
  install: () => Promise<void>
  /** Clear the current notice until the next check. */
  dismiss: () => void
}

/**
 * Store driving the update notice. A single check is triggered on app launch;
 * the user opts in to installing. Kept inert in a plain browser (no Tauri IPC).
 */
export const useUpdateStore = create<UpdateStoreState>((set, get) => ({
  phase: 'idle',
  available: null,
  downloaded: 0,
  total: 0,
  error: null,

  check: async () => {
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
      set(update ? { phase: 'available', available: update } : { phase: 'idle', available: null })
    } catch (error) {
      set({ phase: 'error', error: toMessage(error) })
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

/** Normalize an unknown thrown value to a message string. */
function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
