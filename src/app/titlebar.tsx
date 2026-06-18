import { CheckForUpdatesButton } from '../components/check-for-updates-button'
import { WindowControls } from './window-controls'

/**
 * Seamless, frameless action bar that doubles as the window titlebar.
 *
 * Left: app identity and a breadcrumb (a drag handle; the repo/branch switcher
 * lands here once the git layer exists). Centre: a flexible drag surface.
 * Right: app actions followed by the window controls. The left zone and centre
 * carry `data-tauri-drag-region` so the window stays movable; the right zone is
 * interactive and excluded from dragging.
 */
export function Titlebar() {
  return (
    <header className="titlebar">
      {/* Native drag handling via the data attribute — no JS handlers here. */}
      <div className="titlebar__zone titlebar__zone--left" data-tauri-drag-region>
        <span className="titlebar__brand">
          <span className="titlebar__brand-dot" />
          Gitting
        </span>
        <span className="titlebar__crumb">
          <span className="titlebar__crumb-sep">/</span>
          Aucun dépôt ouvert
        </span>
      </div>

      <div className="titlebar__drag" data-tauri-drag-region />

      <div className="titlebar__zone titlebar__zone--right">
        <CheckForUpdatesButton />
        <span className="titlebar__winctls">
          <WindowControls />
        </span>
      </div>
    </header>
  )
}
