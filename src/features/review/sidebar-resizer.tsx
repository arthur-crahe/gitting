import { type KeyboardEvent, type PointerEvent, type RefObject, useRef } from 'react'
import { useSidebarStore } from '../../stores/use-sidebar-store'
import { MAX_WIDTH, MIN_WIDTH, nextWidthForKey, widthFromDrag } from './resize-utils'

/** Live drag state, kept in a ref so pointer moves never re-render React. */
interface Drag {
  /** Pointer x at pointer-down. */
  readonly startX: number
  /** Sidebar width at pointer-down. */
  readonly startWidth: number
  /** Latest clamped width during the drag, committed on pointer-up. */
  latest: number
}

/**
 * The draggable separator between the file list and the diff (ADR 0003). A
 * WAI-ARIA Window Splitter we own: `role="separator"` with a live value model and
 * keyboard resize. During a pointer drag it mutates the `--sidebar-width` custom
 * property on `sidebarRef` directly — zero React re-render per frame — and commits
 * the width to {@link useSidebarStore} once on pointer-up; the keyboard path
 * commits each discrete step. Double-click resets to the default width.
 *
 * @param sidebarRef the list pane element whose `--sidebar-width` drives its
 *   `flex-basis`; must carry `id="review-sidebar"` (referenced by `aria-controls`).
 */
export function SidebarResizer({ sidebarRef }: { sidebarRef: RefObject<HTMLElement | null> }) {
  const width = useSidebarStore((s) => s.width)
  const setWidth = useSidebarStore((s) => s.setWidth)
  const reset = useSidebarStore((s) => s.reset)
  const drag = useRef<Drag | null>(null)

  const applyWidth = (px: number) => {
    sidebarRef.current?.style.setProperty('--sidebar-width', `${px}px`)
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }
    const startWidth = useSidebarStore.getState().width
    drag.current = { startX: event.clientX, startWidth, latest: startWidth }
    // Synchronous, no setState: arm the resize cursor / text-select guard.
    event.currentTarget.parentElement?.classList.add('is-resizing')
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state) {
      return
    }
    const next = widthFromDrag(state.startWidth, state.startX, event.clientX)
    state.latest = next
    applyWidth(next)
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state) {
      return
    }
    drag.current = null
    event.currentTarget.parentElement?.classList.remove('is-resizing')
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    setWidth(state.latest)
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
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={reset}
    />
  )
}
