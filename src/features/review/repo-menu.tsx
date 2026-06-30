import { DropdownMenu, IconButton, Tooltip } from '@radix-ui/themes'
import { KebabIcon } from '../../components/icons'
import { useRepoStore } from '../../stores/use-repo-store'

/**
 * Overflow menu in the sidebar header for the repo-scoped actions — re-read the
 * working tree, and switch to a different repository — kept here so the review
 * split runs edge to edge.
 */
export function RepoMenu() {
  const refresh = useRepoStore((s) => s.refresh)
  const openViaDialog = useRepoStore((s) => s.openViaDialog)
  const phase = useRepoStore((s) => s.phase)

  return (
    <DropdownMenu.Root>
      <Tooltip content="Actions du dépôt">
        <DropdownMenu.Trigger>
          <IconButton variant="ghost" color="gray" size="1" aria-label="Actions du dépôt">
            <KebabIcon />
          </IconButton>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Content className="repo-menu__content" size="1" variant="soft" align="end">
        <DropdownMenu.Item disabled={phase === 'loading'} onSelect={() => void refresh()}>
          Rafraîchir
        </DropdownMenu.Item>
        <DropdownMenu.Item disabled={phase === 'loading'} onSelect={() => void openViaDialog()}>
          Changer de dépôt…
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}
