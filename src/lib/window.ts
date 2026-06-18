import type { UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauriRuntime } from './runtime'

/**
 * Edge or corner from which an interactive window resize is initiated. Mirrors
 * Tauri's `ResizeDirection`; declared locally because that type is not exported
 * from `@tauri-apps/api/window`.
 */
export type ResizeDirection =
  | 'North'
  | 'South'
  | 'East'
  | 'West'
  | 'NorthEast'
  | 'NorthWest'
  | 'SouthEast'
  | 'SouthWest'

/**
 * Reveals the window. Paired with `visible: false` in `tauri.conf.json` to hide
 * the launch flash until the first React paint. No-op outside Tauri.
 */
export async function revealWindow(): Promise<void> {
  if (!isTauriRuntime()) return
  await getCurrentWindow().show()
}

/** Minimizes the current window. No-op outside Tauri. */
export async function minimizeWindow(): Promise<void> {
  if (!isTauriRuntime()) return
  await getCurrentWindow().minimize()
}

/** Toggles the window between maximized and restored. No-op outside Tauri. */
export async function toggleMaximizeWindow(): Promise<void> {
  if (!isTauriRuntime()) return
  await getCurrentWindow().toggleMaximize()
}

/**
 * Closes the current window, running the cancellable close-requested flow. On
 * the sole window this typically quits the app. No-op outside Tauri.
 */
export async function closeWindow(): Promise<void> {
  if (!isTauriRuntime()) return
  await getCurrentWindow().close()
}

/** Whether the window is currently maximized. Resolves `false` outside Tauri. */
export async function isWindowMaximized(): Promise<boolean> {
  if (!isTauriRuntime()) return false
  return getCurrentWindow().isMaximized()
}

/**
 * Begins an interactive resize from the given edge/corner — required because a
 * frameless (`decorations: false`) window has no native resize border on Linux
 * and Windows. No-op outside Tauri.
 */
export async function startWindowResize(direction: ResizeDirection): Promise<void> {
  if (!isTauriRuntime()) return
  await getCurrentWindow().startResizeDragging(direction)
}

/**
 * Subscribes to window size changes (drag-resize, maximize/restore). Returns an
 * unlisten function; outside Tauri it does nothing and returns a no-op.
 *
 * @param handler - called whenever the window is resized.
 */
export async function onWindowResized(handler: () => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => {}
  return getCurrentWindow().onResized(() => handler())
}
