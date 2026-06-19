/**
 * Pure geometry for the resizable review sidebar (see ADR 0003). All bounds and
 * math live here as the single source of truth, reused by the drag handler, the
 * keyboard, the width store and the tests — no magic numbers elsewhere, and
 * fully testable without a layout engine (jsdom).
 */

/** Narrowest the sidebar may get (px); mirrors the list pane's floor. */
export const MIN_WIDTH = 240
/** Widest the sidebar may get (px); a hard cap so the diff pane keeps room. */
export const MAX_WIDTH = 560
/** Default sidebar width (px), used on first run and on double-click reset. */
export const DEFAULT_WIDTH = 320
/** Keyboard resize step (px) for the arrow keys. */
export const STEP = 16

/** Clamps a sidebar width to `[MIN_WIDTH, MAX_WIDTH]`. */
export function clampWidth(px: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, px))
}

/**
 * The clamped sidebar width for a pointer drag: `startWidth` captured at
 * pointer-down, plus the horizontal travel `currentX - startX`. Delta-only (no
 * DOM geometry), so it is exact under jsdom.
 */
export function widthFromDrag(startWidth: number, startX: number, currentX: number): number {
  return clampWidth(startWidth + (currentX - startX))
}

/** Outcome of a keyboard resize: the next width, and whether the key applied. */
export interface KeyResize {
  /** The clamped width after the key (unchanged if `handled` is false). */
  readonly width: number
  /** Whether the key was a resize key (drives a targeted `preventDefault`). */
  readonly handled: boolean
}

/**
 * The next sidebar width for a resize key on the (vertical) separator: Left/Right
 * step by {@link STEP}, Home/End jump to the min/max. Any other key returns
 * `handled: false` so the caller leaves it to the browser.
 */
export function nextWidthForKey(key: string, current: number): KeyResize {
  switch (key) {
    case 'ArrowLeft':
      return { width: clampWidth(current - STEP), handled: true }
    case 'ArrowRight':
      return { width: clampWidth(current + STEP), handled: true }
    case 'Home':
      return { width: MIN_WIDTH, handled: true }
    case 'End':
      return { width: MAX_WIDTH, handled: true }
    default:
      return { width: current, handled: false }
  }
}
