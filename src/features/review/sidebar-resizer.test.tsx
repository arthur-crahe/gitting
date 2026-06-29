import { fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSidebarStore } from '../../stores/use-sidebar-store'
import { DEFAULT_WIDTH, MAX_WIDTH, MIN_WIDTH, STEP } from './resize-utils'
import { SidebarResizer } from './sidebar-resizer'

/** The handle next to a stand-in sidebar element, matching the real DOM shape. */
function Harness() {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div className="review-split">
      <div className="review-split__list" id="review-sidebar" ref={ref} />
      <SidebarResizer sidebarRef={ref} />
    </div>
  )
}

function sidebarWidthVar() {
  return document.getElementById('review-sidebar')?.style.getPropertyValue('--sidebar-width')
}

describe('SidebarResizer', () => {
  beforeEach(() => {
    localStorage.clear()
    useSidebarStore.setState({ width: DEFAULT_WIDTH })
  })

  it('exposes the Window Splitter ARIA contract', () => {
    render(<Harness />)
    const handle = screen.getByRole('separator')
    expect(handle).toHaveAttribute('aria-orientation', 'vertical')
    expect(handle).toHaveAttribute('aria-controls', 'review-sidebar')
    expect(handle).toHaveAttribute('aria-valuemin', String(MIN_WIDTH))
    expect(handle).toHaveAttribute('aria-valuemax', String(MAX_WIDTH))
    expect(handle).toHaveAttribute('aria-valuenow', String(DEFAULT_WIDTH))
    expect(handle).toHaveAttribute('aria-label')
    // aria-controls must point at a real element.
    expect(document.getElementById('review-sidebar')).not.toBeNull()
  })

  it('resizes by one step per arrow key (no double handling)', () => {
    render(<Harness />)
    const handle = screen.getByRole('separator')

    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(useSidebarStore.getState().width).toBe(DEFAULT_WIDTH + STEP)
    expect(handle).toHaveAttribute('aria-valuenow', String(DEFAULT_WIDTH + STEP))

    fireEvent.keyDown(handle, { key: 'End' })
    expect(useSidebarStore.getState().width).toBe(MAX_WIDTH)
  })

  it('drags the width via the CSS variable and commits once on release', () => {
    render(<Harness />)
    const handle = screen.getByRole('separator')

    // The gesture starts on the handle but is driven by window-level listeners,
    // so the cursor can leave the handle without dropping the drag (WebView2).
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 160, pointerId: 1 })
    // Mid-drag: the variable tracks the drag, the store is untouched.
    expect(sidebarWidthVar()).toBe(`${DEFAULT_WIDTH + 60}px`)
    expect(useSidebarStore.getState().width).toBe(DEFAULT_WIDTH)

    fireEvent.pointerUp(window, { clientX: 160, pointerId: 1 })
    expect(useSidebarStore.getState().width).toBe(DEFAULT_WIDTH + 60)
  })

  it('clamps a drag past the maximum', () => {
    render(<Harness />)
    const handle = screen.getByRole('separator')
    fireEvent.pointerDown(handle, { button: 0, clientX: 0, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 1000, pointerId: 1 })
    fireEvent.pointerUp(window, { clientX: 1000, pointerId: 1 })
    expect(useSidebarStore.getState().width).toBe(MAX_WIDTH)
  })

  it('resets to the default width on double-click', () => {
    useSidebarStore.setState({ width: 500 })
    render(<Harness />)
    fireEvent.doubleClick(screen.getByRole('separator'))
    expect(useSidebarStore.getState().width).toBe(DEFAULT_WIDTH)
  })

  it('commits and drops the resizing state on a cancelled gesture', () => {
    render(<Harness />)
    const handle = screen.getByRole('separator')
    const split = handle.closest('.review-split')

    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 })
    expect(split).toHaveClass('is-resizing')
    fireEvent.pointerMove(window, { clientX: 140, pointerId: 1 })
    fireEvent.pointerCancel(window, { clientX: 140, pointerId: 1 })

    // A cancel ends the same gesture: width still commits and the class is removed.
    expect(useSidebarStore.getState().width).toBe(DEFAULT_WIDTH + 40)
    expect(split).not.toHaveClass('is-resizing')
  })
})
