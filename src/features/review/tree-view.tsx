import { useCallback, useMemo, useState } from 'react'
import { Chevron } from '../../components/icons'
import type { StatusEntry } from '../../lib/git'
import type { DiffSection } from '../../stores/use-diff-store'
import { useRepoStore } from '../../stores/use-repo-store'
import { changeKindGlyph } from './change-kind'
import { buildFileTree, type FileNode, type TreeNode } from './file-tree'
import { FileTypeIcon, FolderTypeIcon } from './file-type-icon'
import { useIsSelected, useRowActions } from './row-context'
import { RowEnd } from './row-end'

/** Base left inset (px), matching the flat list's row padding. */
const ROW_INSET = 8
/** Extra left inset (px) per nesting depth (condensed, VSCode-like). */
const INDENT_STEP = 12
/** Shared empty set so a forced-open tree never allocates one per render. */
const NONE: ReadonlySet<string> = new Set()

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
  /** Step file rows back as done work (the "Validé" archive). */
  recede?: boolean
  /** Directory paths that are currently collapsed. */
  collapsed: ReadonlySet<string>
  /** Flip a directory's collapsed state. */
  onToggle: (path: string) => void
}

/** A file leaf: the select target with its status glyph and validate action. */
function TreeFile({
  node,
  depth,
  section,
  recede,
}: {
  node: FileNode
  depth: number
  section: DiffSection
  recede?: boolean
}) {
  const { select } = useRowActions()
  const selected = useIsSelected(section, node.entry.path)
  const pending = useRepoStore((s) => s.pendingPaths.has(node.entry.path))
  const glyph = changeKindGlyph(node.entry.kind)
  return (
    <div
      className="tree-file"
      style={{ paddingLeft: inset(depth) }}
      data-selected={selected || undefined}
      data-recede={recede || undefined}
      data-pending={pending || undefined}
    >
      <button
        type="button"
        className="tree-file__select"
        data-file-row=""
        data-section={section}
        data-path={node.entry.path}
        tabIndex={-1}
        onClick={() => select(section, node.entry.path)}
        title={`${glyph.label} — ${node.entry.path}`}
        aria-current={selected ? 'true' : undefined}
      >
        <FileTypeIcon name={node.name} />
        <span className="tree-file__name">{node.name}</span>
      </button>
      <RowEnd section={section} path={node.entry.path} kind={node.entry.kind} />
    </div>
  )
}

/** One tree row: a collapsible directory (with its children) or a file leaf. */
function NodeRow({ node, depth, section, recede, collapsed, onToggle }: RowProps) {
  if (node.type === 'file') {
    return <TreeFile node={node} depth={depth} section={section} recede={recede} />
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
        <FolderTypeIcon name={node.name} />
        <span className="tree-folder__name">{node.name}</span>
      </button>
      {open
        ? node.children.map((child) => (
            <NodeRow
              key={nodeKey(child)}
              node={child}
              depth={depth + 1}
              section={section}
              recede={recede}
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
 * glyph and sans name. Everything is expanded by default; collapsed directories
 * are tracked in component-local state that persists across an entries change (a
 * stage/unstage) and resets only when the component unmounts. While `forceExpand`
 * is set (the filter is active) every directory is shown open so matches are
 * always visible, without discarding the user's collapse state.
 */
export function FileTree({
  entries,
  section,
  recede,
  forceExpand,
}: {
  entries: readonly StatusEntry[]
  section: DiffSection
  recede?: boolean
  forceExpand?: boolean
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
          recede={recede}
          collapsed={forceExpand ? NONE : collapsed}
          onToggle={toggle}
        />
      ))}
    </div>
  )
}
