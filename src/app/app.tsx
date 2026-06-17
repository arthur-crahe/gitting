import { Container, Flex, Heading, Text } from '@radix-ui/themes'

/**
 * Root application view.
 *
 * Placeholder landing page — the repo picker and the review sections
 * (À reviewer / Validé) are added on top of this shell.
 */
export function App() {
  return (
    <Container size="2" px="5" py="9">
      <Flex direction="column" gap="2">
        <Heading size="8">Gitting</Heading>
        <Text color="gray" size="4">
          Revue des changements git locaux.
        </Text>
      </Flex>
    </Container>
  )
}
