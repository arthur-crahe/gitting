/**
 * Best-effort `localStorage` access for persisted UI preferences.
 *
 * Both helpers tolerate the absence of `localStorage` (jsdom tests, hardened
 * WebView, private mode) by swallowing failures: the in-memory store stays
 * authoritative and persistence is treated as a nice-to-have.
 */

/** Reads a key from `localStorage`, returning `null` if unavailable or unset. */
export function readStorage(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
  } catch {
    return null
  }
}

/** Writes a key to `localStorage`, ignoring failures (private mode, tests). */
export function writeStorage(key: string, value: string): void {
  try {
    localStorage?.setItem(key, value)
  } catch {}
}
