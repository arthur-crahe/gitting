import { AccentPicker } from '../components/accent-picker'
import { AppearanceToggle } from '../components/appearance-toggle'
import { CheckForUpdatesButton } from '../components/check-for-updates-button'
import { useRepoStore } from '../stores/use-repo-store'
import { WindowControls } from './window-controls'

/**
 * Seamless, frameless action bar that doubles as the window titlebar.
 *
 * Left: app identity and a breadcrumb — the opened repository name and branch,
 * or a hint when none is open (also a drag handle). Centre: a flexible drag
 * surface. Right: app actions followed by the window controls. The left zone and
 * centre carry `data-tauri-drag-region` so the window stays movable; the right
 * zone is interactive and excluded from dragging.
 */
export function Titlebar() {
  const info = useRepoStore((s) => s.info)

  return (
    <header className="titlebar">
      <div className="titlebar__zone titlebar__zone--left" data-tauri-drag-region>
        <span className="titlebar__brand">
          <span className="titlebar__brand-dot" />
          Gitting
        </span>
        <span className="titlebar__crumb">
          <span className="titlebar__crumb-sep">/</span>
          {info ? (
            <>
              {info.name}
              {info.branch ? <span className="titlebar__crumb-sep">·</span> : null}
              {info.branch}
            </>
          ) : (
            'Aucun dépôt ouvert'
          )}
        </span>
      </div>

      <div className="titlebar__drag" data-tauri-drag-region />

      <div className="titlebar__zone titlebar__zone--right">
        <AccentPicker />
        <AppearanceToggle />
        <CheckForUpdatesButton />
        <span className="titlebar__winctls">
          <WindowControls />
        </span>
      </div>
    </header>
  )
}
