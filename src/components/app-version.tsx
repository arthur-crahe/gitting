import { Text } from '@radix-ui/themes'
import { getVersion } from '@tauri-apps/api/app'
import { useEffect, useState } from 'react'

/**
 * Shows the running app version (from the Tauri bundle). Renders nothing until
 * resolved, and stays empty outside the Tauri WebView (the IPC call rejects).
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
  return (
    <Text size="1" color="gray">
      Gitting v{version}
    </Text>
  )
}
