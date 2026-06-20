import { Callout, Container, Flex, Text } from '@radix-ui/themes'
import { useEffect } from 'react'
import { AppVersion } from '../components/app-version'
import { BrandMark } from '../components/icons'
import { UpdateNotice } from '../components/update-notice'
import { RepoPicker } from '../features/repo/repo-picker'
import { ReviewProgress } from '../features/review/review-progress'
import { ReviewView } from '../features/review/review-view'
import { revealWindow } from '../lib/window'
import { useRepoStore } from '../stores/use-repo-store'
import { useUpdateStore } from '../stores/use-update-store'
import { Titlebar } from './titlebar'
import { WindowResizers } from './window-resizers'

/**
 * Welcome screen shown before a repository is opened (or after an open failed):
 * the monochrome brand mark, the wordmark, the primary open action, and the last
 * error if any. The one centred moment in the app — stripped of any marketing feel
 * (no card, no accent square, no illustration).
 */
function Welcome() {
  const phase = useRepoStore((s) => s.phase)
  const error = useRepoStore((s) => s.error)

  return (
    <Flex direction="column" align="center" gap="4" className="welcome">
      <div className="welcome__mark">
        <BrandMark size={34} />
      </div>
      <Flex direction="column" align="center" gap="2">
        <span className="welcome__wordmark">gitting</span>
        <Text color="gray" size="2" align="center">
          Revue des changements git locaux.
        </Text>
      </Flex>
      {phase === 'error' && error ? (
        <Callout.Root color="red" size="1" className="welcome__error">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      ) : null}
      <RepoPicker size="2" />
      <Text size="1" color="gray">
        Choisissez un dépôt déjà cloné pour commencer.
      </Text>
    </Flex>
  )
}

/**
 * Application shell.
 *
 * Owns the whole frameless window: a custom {@link Titlebar} on top, the content
 * region below (the centred {@link Welcome} until a repository is opened, then the
 * edge-to-edge {@link ReviewView}), a slim footer carrying the review progress and
 * version, and the {@link WindowResizers} overlay. The window is created hidden
 * (`visible: false`) and revealed after the first paint to avoid a launch flash.
 * Also runs a silent update check on launch (a no-op outside the Tauri WebView).
 */
export function App() {
  const check = useUpdateStore((s) => s.check)
  const ready = useRepoStore((s) => s.phase === 'ready')

  useEffect(() => {
    void revealWindow()
    // Surfaces only an available update; offline/up-to-date stay quiet.
    void check()
  }, [check])

  return (
    <div className="app-shell">
      <Titlebar />
      <main className={`app-content${ready ? ' app-content--review' : ''}`}>
        {ready ? (
          <ReviewView />
        ) : (
          <Container size="2" px="6" py="7">
            <Flex direction="column" gap="6">
              <UpdateNotice />
              <Welcome />
            </Flex>
          </Container>
        )}
      </main>
      <footer className="app-footer">
        {ready ? <ReviewProgress /> : <span />}
        <AppVersion />
      </footer>
      <WindowResizers />
    </div>
  )
}
