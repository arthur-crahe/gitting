import { Container, Flex, Heading, Text } from '@radix-ui/themes'
import { useEffect } from 'react'
import { AppVersion } from '../components/app-version'
import { UpdateNotice } from '../components/update-notice'
import { revealWindow } from '../lib/window'
import { useUpdateStore } from '../stores/use-update-store'
import { Titlebar } from './titlebar'
import { WindowResizers } from './window-resizers'

/**
 * Application shell.
 *
 * Owns the whole frameless window: a custom {@link Titlebar} on top, the
 * scrollable content region below, and the {@link WindowResizers} overlay. The
 * window is created hidden (`visible: false`) and revealed after the first
 * paint to avoid a launch flash. Also runs a silent update check on launch (a
 * no-op outside the Tauri WebView); the user can re-check on demand.
 */
export function App() {
  const check = useUpdateStore((s) => s.check)

  useEffect(() => {
    // Show only once the UI has painted; no-op in a plain browser.
    void revealWindow()
    // Silent: only an available update surfaces; offline/up-to-date stay quiet.
    void check()
  }, [check])

  return (
    <div className="app-shell">
      <Titlebar />
      <main className="app-content">
        <Container size="2" px="5" py="9">
          <Flex direction="column" gap="5">
            <UpdateNotice />
            <Flex direction="column" gap="2">
              <Heading size="8">Gitting</Heading>
              <Text color="gray" size="4">
                Revue des changements git locaux.
              </Text>
            </Flex>
            <AppVersion />
          </Flex>
        </Container>
      </main>
      <WindowResizers />
    </div>
  )
}
