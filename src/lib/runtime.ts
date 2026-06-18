/**
 * Whether the code is running inside the Tauri WebView (vs. a plain browser
 * during `pnpm dev`). Tauri IPC and the window APIs only exist in the former,
 * so callers guard on this to stay inert in the browser.
 */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
