import { IconButton, Tooltip } from '@radix-ui/themes'
import { ListIcon, TreeIcon } from '../../components/icons'
import { useViewStore } from '../../stores/use-view-store'

/**
 * Toolbar toggle switching the review file layout between the flat list and the
 * tree. A single ghost icon button carrying the icon of the layout it switches
 * *to* (tree while listing, list while treeing); the change applies to both
 * review sections at once (global, persisted via {@link useViewStore}).
 */
export function ViewModeToggle() {
  const mode = useViewStore((s) => s.mode)
  const setMode = useViewStore((s) => s.setMode)
  const toTree = mode === 'list'
  const label = toTree ? 'Afficher en arbre' : 'Afficher en liste'

  return (
    <Tooltip content={label}>
      <IconButton
        variant="ghost"
        color="gray"
        size="1"
        aria-label={label}
        onClick={() => setMode(toTree ? 'tree' : 'list')}
      >
        {toTree ? <TreeIcon /> : <ListIcon />}
      </IconButton>
    </Tooltip>
  )
}
