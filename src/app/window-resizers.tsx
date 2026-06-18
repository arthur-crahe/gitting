import type { PointerEvent } from 'react'
import { type ResizeDirection, startWindowResize } from '../lib/window'

/** The eight edge/corner grips, each mapped to a Tauri resize direction. */
const GRIPS: ReadonlyArray<{ readonly modifier: string; readonly direction: ResizeDirection }> = [
  { modifier: 'n', direction: 'North' },
  { modifier: 's', direction: 'South' },
  { modifier: 'e', direction: 'East' },
  { modifier: 'w', direction: 'West' },
  { modifier: 'ne', direction: 'NorthEast' },
  { modifier: 'nw', direction: 'NorthWest' },
  { modifier: 'se', direction: 'SouthEast' },
  { modifier: 'sw', direction: 'SouthWest' },
]

/**
 * Invisible resize grips around the window border. A frameless window has no
 * native resize edge on Linux/Windows, so a primary-button press on a grip
 * hands off to the OS via {@link startWindowResize}. Pointer-transparent except
 * over the grips themselves, so content underneath stays fully interactive.
 */
export function WindowResizers() {
  const onPointerDown = (direction: ResizeDirection) => (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    void startWindowResize(direction)
  }

  return (
    <div className="win-resizers" aria-hidden>
      {GRIPS.map(({ modifier, direction }) => (
        <div
          key={modifier}
          className={`win-resizer win-resizer--${modifier}`}
          onPointerDown={onPointerDown(direction)}
        />
      ))}
    </div>
  )
}
