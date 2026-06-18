import { Button, Card, Flex, Text } from '@radix-ui/themes'
import { useUpdateStore } from '../stores/use-update-store'

/**
 * Percentage `[0, 100]` of an in-flight download, or `null` when the total
 * size is unknown (server sent no content length).
 */
function percent(downloaded: number, total: number): number | null {
  if (total <= 0) {
    return null
  }
  return Math.min(100, Math.round((downloaded / total) * 100))
}

/**
 * Inline notice for the in-app updater: offers an available update, shows
 * download progress, or reports an error. Renders nothing while idle/checking.
 */
export function UpdateNotice() {
  const phase = useUpdateStore((s) => s.phase)
  const available = useUpdateStore((s) => s.available)
  const downloaded = useUpdateStore((s) => s.downloaded)
  const total = useUpdateStore((s) => s.total)
  const error = useUpdateStore((s) => s.error)
  const install = useUpdateStore((s) => s.install)
  const dismiss = useUpdateStore((s) => s.dismiss)

  if (phase === 'available' && available) {
    return (
      <Card>
        <Flex direction="column" gap="2">
          <Text size="2" weight="medium">
            Mise à jour disponible : {available.currentVersion} → {available.version}
          </Text>
          {available.notes ? (
            <Text size="1" color="gray">
              {available.notes}
            </Text>
          ) : null}
          <Flex gap="2">
            <Button size="1" onClick={() => void install()}>
              Mettre à jour et redémarrer
            </Button>
            <Button size="1" variant="soft" color="gray" onClick={dismiss}>
              Plus tard
            </Button>
          </Flex>
        </Flex>
      </Card>
    )
  }

  if (phase === 'downloading') {
    const pct = percent(downloaded, total)
    return (
      <Card>
        <Text size="2">Téléchargement de la mise à jour{pct !== null ? ` (${pct} %)` : '…'}</Text>
      </Card>
    )
  }

  if (phase === 'error' && error) {
    return (
      <Card>
        <Flex direction="column" gap="2">
          <Text size="2" color="red">
            Échec de la mise à jour : {error}
          </Text>
          <Flex>
            <Button size="1" variant="soft" color="gray" onClick={dismiss}>
              Fermer
            </Button>
          </Flex>
        </Flex>
      </Card>
    )
  }

  return null
}
