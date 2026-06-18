import { Container, Flex, Heading, Text } from '@radix-ui/themes'
import { useEffect } from 'react'
import { CheckForUpdatesButton } from '../components/check-for-updates-button'
import { UpdateNotice } from '../components/update-notice'
import { useUpdateStore } from '../stores/use-update-store'

/**
 * Root application view.
 *
 * Placeholder landing page — the repo picker and the review sections
 * (À reviewer / Validé) are added on top of this shell. Runs a silent update
 * check once on launch (a no-op outside the Tauri WebView); the user can also
 * re-check on demand.
 */
export function App() {
  const check = useUpdateStore((s) => s.check)

  useEffect(() => {
    // Silent: only an available update surfaces; offline/up-to-date stay quiet.
    void check()
  }, [check])

  return (
    <Container size="2" px="5" py="9">
      <Flex direction="column" gap="5">
        <Flex justify="end">
          <CheckForUpdatesButton />
        </Flex>
        <UpdateNotice />
        <Flex direction="column" gap="2">
          <Heading size="8">Gitting</Heading>
          <Text color="gray" size="4">
            Revue des changements git locaux.
          </Text>
        </Flex>
      </Flex>
    </Container>
  )
}
