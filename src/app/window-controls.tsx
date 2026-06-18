import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import {
  closeWindow,
  isWindowMaximized,
  minimizeWindow,
  onWindowResized,
  toggleMaximizeWindow,
} from '../lib/window'

/**
 * Minimize / maximize-restore / close buttons for the custom titlebar, laid out
 * on the right per the Windows and Linux convention. The maximize button tracks
 * the live window state so its glyph flips between maximize and restore.
 */
export function WindowControls() {
  const maximized = useWindowMaximized()

  return (
    <>
      <button
        type="button"
        className="winctl"
        aria-label="Réduire"
        onClick={() => void minimizeWindow()}
      >
        <ControlIcon>
          <line x1="2.5" y1="6" x2="9.5" y2="6" />
        </ControlIcon>
      </button>
      <button
        type="button"
        className="winctl"
        aria-label={maximized ? 'Restaurer' : 'Agrandir'}
        onClick={() => void toggleMaximizeWindow()}
      >
        <ControlIcon>
          {maximized ? (
            <>
              <rect x="2.3" y="3.7" width="6" height="6" rx="1" />
              <path d="M4.3 3.7 V2.3 H9.7 V7.7 H8.3" />
            </>
          ) : (
            <rect x="2.5" y="2.5" width="7" height="7" rx="1" />
          )}
        </ControlIcon>
      </button>
      <button
        type="button"
        className="winctl winctl--close"
        aria-label="Fermer"
        onClick={() => void closeWindow()}
      >
        <ControlIcon>
          <path d="M3 3 L9 9 M9 3 L3 9" />
        </ControlIcon>
      </button>
    </>
  )
}

/** Tracks whether the window is maximized, refreshing on every resize event. */
function useWindowMaximized(): boolean {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let active = true
    const sync = () => {
      void isWindowMaximized().then((value) => {
        if (active) setMaximized(value)
      })
    }
    sync()
    let unlisten: (() => void) | undefined
    void onWindowResized(sync).then((fn) => {
      if (active) unlisten = fn
      else fn()
    })
    return () => {
      active = false
      unlisten?.()
    }
  }, [])

  return maximized
}

/**
 * Shared 12×12 stroked frame for the control glyphs. Decorative: the enclosing
 * button carries the accessible name, so the SVG is hidden from assistive tech.
 */
function ControlIcon({ children }: { readonly children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative glyph; the button provides the aria-label.
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}
