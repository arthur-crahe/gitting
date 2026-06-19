import { useCallback, useMemo, useState } from 'react'
import { Chevron } from '../../components/icons'
import type { StatusEntry } from '../../lib/git'
import type { DiffSection } from '../../stores/use-diff-store'
import { changeKindGlyph } from './change-kind'
import { buildFileTree, type TreeNode } from './file-tree'
import { isSelected, useRowActions } from './row-context'
import { StatusGlyph } from './status-glyph'
import { ValidateButton } from './validate-button'

/** Base left inset (px), matching the flat list's row padding. */
const ROW_INSET = 8
/** Extra left inset (px) per nesting depth. */
const INDENT_STEP = 16

/** Left padding for a row at the given depth. */
function inset(depth: number): number {
  return ROW_INSET + depth * INDENT_STEP
}

/** Stable React key for a node — directory by path, file by full entry path. */
function nodeKey(node: TreeNode): string {
  return node.type === 'dir' ? `d:${node.path}` : `f:${node.entry.path}`
}

/** Props shared by every recursive row. */
interface RowProps {
  node: TreeNode
  depth: number
  /** Which review section the tree belongs to. */
  section: DiffSection
  /** Directory paths that are currently collapsed. */
  collapsed: ReadonlySet<string>
  /** Flip a directory's collapsed state. */
  onToggle: (path: string) => void
}

/** One tree row: a collapsible directory (with its children) or a file leaf. */
function NodeRow({ node, depth, section, collapsed, onToggle }: RowProps) {
  const { selected, select } = useRowActions()

  if (node.type === 'file') {
    const { entry } = node
    const glyph = changeKindGlyph(entry.kind)
    return (
      <div
        className="tree-file"
        style={{ paddingLeft: inset(depth) }}
        data-selected={isSelected(selected, section, entry.path)}
      >
        <button
          type="button"
          className="tree-file__select"
          onClick={() => select(section, entry.path)}
          title={`${glyph.label} — ${entry.path}`}
        >
          <StatusGlyph kind={entry.kind} />
          <span className="tree-file__name">{node.name}</span>
        </button>
        <ValidateButton section={section} path={entry.path} />
      </div>
    )
  }

  const open = !collapsed.has(node.path)
  return (
    <>
      <button
        type="button"
        className="tree-folder"
        aria-expanded={open}
        style={{ paddingLeft: inset(depth) }}
        onClick={() => onToggle(node.path)}
        title={node.path}
      >
        <Chevron open={open} className="disclosure-chevron" />
        <span className="tree-folder__name">{node.name}</span>
      </button>
      {open
        ? node.children.map((child) => (
            <NodeRow
              key={nodeKey(child)}
              node={child}
              depth={depth + 1}
              section={section}
              collapsed={collapsed}
              onToggle={onToggle}
            />
          ))
        : null}
    </>
  )
}

/**
 * Tree layout of a section's changed files: collapsible directories (compacted
 * VSCode-style by {@link buildFileTree}) with file leaves carrying their status
 * glyph. Everything is expanded by default; collapsed directories are tracked in
 * component-local state, so the set resets whenever the component remounts — on a
 * section toggle, a switch back to the list, or a change in entries.
 */
export function FileTree({
  entries,
  section,
}: {
  entries: readonly StatusEntry[]
  section: DiffSection
}) {
  const tree = useMemo(() => buildFileTree(entries), [entries])
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())

  const toggle = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  return (
    <div className="tree">
      {tree.map((node) => (
        <NodeRow
          key={nodeKey(node)}
          node={node}
          depth={0}
          section={section}
          collapsed={collapsed}
          onToggle={toggle}
        />
      ))}
    </div>
  )
}
