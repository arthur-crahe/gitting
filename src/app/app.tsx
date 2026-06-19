import { Callout, Container, Flex, Heading, Text } from '@radix-ui/themes'
import { useEffect } from 'react'
import { AppVersion } from '../components/app-version'
import { StrokeIcon } from '../components/icons'
import { UpdateNotice } from '../components/update-notice'
import { RepoPicker } from '../features/repo/repo-picker'
import { ReviewView } from '../features/review/review-view'
import { revealWindow } from '../lib/window'
import { useRepoStore } from '../stores/use-repo-store'
import { useUpdateStore } from '../stores/use-update-store'
import { Titlebar } from './titlebar'
import { WindowResizers } from './window-resizers'

/** Branch glyph for the welcome mark. */
function BranchMark() {
  return (
    <StrokeIcon viewBox="0 0 24 24" size={26} strokeWidth={1.6}>
      <circle cx="6" cy="5" r="2.4" />
      <circle cx="6" cy="19" r="2.4" />
      <circle cx="18" cy="8" r="2.4" />
      <path d="M6 7.4v9.2M6 12h6.5A5 5 0 0 0 17.5 8" />
    </StrokeIcon>
  )
}

/**
 * Welcome screen shown before a repository is opened (or after an open failed):
 * the brand mark, identity, the primary open action, and the last error if any.
 */
function Welcome() {
  const phase = useRepoStore((s) => s.phase)
  const error = useRepoStore((s) => s.error)

  return (
    <Flex direction="column" align="center" gap="4" className="welcome">
      <div className="welcome__mark">
        <BranchMark />
      </div>
      <Flex direction="column" align="center" gap="1">
        <Heading size="8" align="center">
          Gitting
        </Heading>
        <Text color="gray" size="4" align="center">
          Revue des changements git locaux.
        </Text>
      </Flex>
      {phase === 'error' && error ? (
        <Callout.Root color="red" size="1" className="welcome__error">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      ) : null}
      <RepoPicker size="3" />
      <Text size="1" color="gray">
        Choisissez un dépôt déjà cloné pour commencer.
      </Text>
    </Flex>
  )
}

/**
 * Application shell.
 *
 * Owns the whole frameless window: a custom {@link Titlebar} on top, the
 * scrollable content region below, and the {@link WindowResizers} overlay. The
 * window is created hidden (`visible: false`) and revealed after the first
 * paint to avoid a launch flash. Shows the {@link Welcome} screen until a
 * repository is opened, then the {@link ReviewView}. Also runs a silent update
 * check on launch (a no-op outside the Tauri WebView).
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
          <div className="review-shell">
            <UpdateNotice />
            <ReviewView />
          </div>
        ) : (
          <Container size="3" px="6" py="7">
            <Flex direction="column" gap="6">
              <UpdateNotice />
              <Welcome />
            </Flex>
          </Container>
        )}
      </main>
      <footer className="app-footer">
        <AppVersion />
      </footer>
      <WindowResizers />
    </div>
  )
}
