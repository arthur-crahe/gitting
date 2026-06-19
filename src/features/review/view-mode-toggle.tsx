import { SegmentedControl } from '@radix-ui/themes'
import { ListIcon, TreeIcon } from '../../components/icons'
import { useViewStore, type ViewMode } from '../../stores/use-view-store'

/**
 * Toolbar control switching the review between the flat list and the tree
 * layout. Bound to {@link useViewStore} (global, persisted); the change applies
 * to both review sections at once.
 */
export function ViewModeToggle() {
  const mode = useViewStore((s) => s.mode)
  const setMode = useViewStore((s) => s.setMode)

  return (
    <SegmentedControl.Root
      size="1"
      value={mode}
      onValueChange={(value) => setMode(value as ViewMode)}
      aria-label="Disposition des fichiers"
    >
      <SegmentedControl.Item value="list">
        <span className="view-toggle__item">
          <ListIcon />
          Liste
        </span>
      </SegmentedControl.Item>
      <SegmentedControl.Item value="tree">
        <span className="view-toggle__item">
          <TreeIcon />
          Arbre
        </span>
      </SegmentedControl.Item>
    </SegmentedControl.Root>
  )
}
