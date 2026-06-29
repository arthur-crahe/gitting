import { type KeyboardEvent, type PointerEvent, type RefObject, useEffect, useRef } from 'react'
import { useSidebarStore } from '../../stores/use-sidebar-store'
import { MAX_WIDTH, MIN_WIDTH, nextWidthForKey, widthFromDrag } from './resize-utils'

/** The split container carrying the `.is-resizing` cursor/text-select guard. */
function splitOf(handle: Element): Element | null {
  return handle.closest('.review-split')
}

/**
 * The draggable separator between the file list and the diff (ADR 0003). A
 * WAI-ARIA Window Splitter we own: `role="separator"` with a live value model and
 * keyboard resize.
 *
 * The pointer drag is driven by listeners attached to `window` for the duration
 * of the gesture — not by `setPointerCapture` on the handle. WebView2 (Windows)
 * does not reliably keep mouse pointer capture, so a handle-scoped `pointermove`
 * stops firing the instant the cursor leaves the few-pixel handle; window
 * listeners receive every move regardless of the element under the cursor (and
 * regardless of the diff pane's `pointer-events: none` during the drag), so the
 * splitter behaves identically on WebKitGTK and WebView2. Each move mutates the
 * `--sidebar-width` custom property on `sidebarRef` directly — zero React
 * re-render per frame — and the width is committed to {@link useSidebarStore}
 * once when the gesture ends; the keyboard path commits each discrete step.
 * Double-click resets to the default width.
 *
 * @param sidebarRef the list pane element whose `--sidebar-width` drives its
 *   `flex-basis`; must carry `id="review-sidebar"` (referenced by `aria-controls`).
 */
export function SidebarResizer({ sidebarRef }: { sidebarRef: RefObject<HTMLElement | null> }) {
  const width = useSidebarStore((s) => s.width)
  const setWidth = useSidebarStore((s) => s.setWidth)
  const reset = useSidebarStore((s) => s.reset)
  // Tears down the in-flight gesture's window listeners (committing the latest
  // width); null when no drag is active. Also used to settle a drag that is
  // still running when the component unmounts.
  const endDrag = useRef<(() => void) | null>(null)

  const applyWidth = (px: number) => {
    sidebarRef.current?.style.setProperty('--sidebar-width', `${px}px`)
  }

  // A drag still in flight when the component unmounts must not leave its
  // listeners attached to window.
  useEffect(() => () => endDrag.current?.(), [])

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Ignore non-primary buttons and a second press while a drag is in flight.
    if (event.button !== 0 || endDrag.current) {
      return
    }
    const split = splitOf(event.currentTarget)
    const startX = event.clientX
    const startWidth = useSidebarStore.getState().width
    let latest = startWidth
    // Synchronous, no setState: arm the resize cursor / text-select guard.
    split?.classList.add('is-resizing')

    const onMove = (move: globalThis.PointerEvent) => {
      latest = widthFromDrag(startWidth, startX, move.clientX)
      applyWidth(latest)
    }
    const end = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('blur', end)
      split?.classList.remove('is-resizing')
      endDrag.current = null
      setWidth(latest)
    }
    endDrag.current = end
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    // A focus loss (e.g. the OS taking over) ends the gesture so it can't stick.
    window.addEventListener('blur', end)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const { width: next, handled } = nextWidthForKey(event.key, useSidebarStore.getState().width)
    if (!handled) {
      return
    }
    event.preventDefault()
    setWidth(next)
  }

  const rounded = Math.round(width)
  return (
    // biome-ignore lint/a11y/useSemanticElements: an interactive, focusable, resizable WAI-ARIA Window Splitter has no semantic HTML element; role="separator" is the APG pattern.
    <div
      className="review-split__handle"
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-controls="review-sidebar"
      aria-label="Largeur de la liste des fichiers"
      aria-valuenow={rounded}
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
      aria-valuetext={`${rounded} pixels`}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={reset}
    />
  )
}
