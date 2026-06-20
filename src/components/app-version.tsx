import { getVersion } from '@tauri-apps/api/app'
import { useEffect, useState } from 'react'

/**
 * Shows the running app version (from the Tauri bundle) in the footer. Renders
 * nothing until resolved, and stays empty outside the Tauri WebView (the IPC call
 * rejects). Monospace and lowercase to match the wordmark.
 */
export function AppVersion() {
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null))
  }, [])

  if (!version) {
    return null
  }
  return <span className="app-footer__version">gitting v{version}</span>
}
