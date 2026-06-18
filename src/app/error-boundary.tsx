import { Callout, Code, Container, Flex, Heading, Text } from '@radix-ui/themes'
import { Component, type ReactNode } from 'react'
import { revealWindow } from '../lib/window'
import { Titlebar } from './titlebar'
import { WindowResizers } from './window-resizers'

interface ErrorBoundaryProps {
  readonly children: ReactNode
}

interface ErrorBoundaryState {
  readonly error: Error | null
}

/**
 * Top-level safety net for render-time failures in the app tree.
 *
 * The window is created hidden (`visible: false`) and only revealed from
 * {@link App}'s effect after the first successful paint. A throw during that
 * initial render would otherwise leave the window invisible and unrecoverable —
 * the app would appear not to launch. This boundary catches such failures,
 * reveals the window regardless, and renders a fallback that keeps the custom
 * {@link Titlebar} and {@link WindowResizers} so a frameless window stays
 * movable, resizable and closable.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error): void {
    // App's effect never ran (or threw): reveal the window so the fallback is
    // visible instead of leaving the hidden window stuck off-screen.
    void revealWindow()
    console.error(error)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) {
      return this.props.children
    }

    return (
      <div className="app-shell">
        <Titlebar />
        <main className="app-content">
          <Container size="2" px="5" py="9">
            <Flex direction="column" gap="3">
              <Heading size="6">Une erreur est survenue</Heading>
              <Text color="gray" size="3">
                L'application n'a pas pu s'afficher correctement. Redémarrez-la ; si le problème
                persiste, le détail ci-dessous aide au diagnostic.
              </Text>
              <Callout.Root color="red" variant="surface">
                <Callout.Text>
                  <Code variant="ghost">{error.message}</Code>
                </Callout.Text>
              </Callout.Root>
            </Flex>
          </Container>
        </main>
        <WindowResizers />
      </div>
    )
  }
}
