import type { StatusEntry } from '../../lib/git'
import { lastPathSegment } from '../../lib/path'

/** A node in the changed-files tree: a directory grouping, or a file leaf. */
export type TreeNode = DirNode | FileNode

/** A directory grouping changed files. */
export interface DirNode {
  readonly type: 'dir'
  /**
   * Display label. After compaction a single-child chain shows several segments
   * at once (e.g. `"features/review"`); otherwise it is one path segment.
   */
  readonly name: string
  /**
   * Full repository-relative path of this directory — a stable React key and the
   * unit toggled when expanding/collapsing.
   */
  readonly path: string
  /** Children, directories first then files, each group sorted by name. */
  readonly children: readonly TreeNode[]
}

/** A single changed file — a leaf of the tree. */
export interface FileNode {
  readonly type: 'file'
  /** File name only (the last path segment). */
  readonly name: string
  /** The originating status entry (full path + change kind). */
  readonly entry: StatusEntry
}

/** Mutable trie node used while assembling the tree, before finalization. */
interface DirBuilder {
  /** Child directories keyed by their (single) path segment. */
  readonly dirs: Map<string, DirBuilder>
  /** Files directly in this directory. */
  readonly files: FileNode[]
  /** Full repository-relative path of this directory (`''` for the root). */
  readonly path: string
}

/**
 * Builds the directory tree for a section's changed files.
 *
 * Paths are repository-relative and `/`-separated; the last segment is the file
 * name. The result is sorted (directories first, then files, each by name) and
 * **compacted VSCode-style**: a directory whose only child is itself a directory
 * is merged with it onto a single row (`{@link DirNode.name}` then spans several
 * segments). A directory whose only child is a *file* stays a directory.
 *
 * Pure and deterministic — safe to memoize on the entries array.
 */
export function buildFileTree(entries: readonly StatusEntry[]): readonly TreeNode[] {
  const root: DirBuilder = { dirs: new Map(), files: [], path: '' }

  for (const entry of entries) {
    const segments = entry.path.split('/')
    const name = lastPathSegment(entry.path)
    let dir = root
    for (const segment of segments.slice(0, -1)) {
      let child = dir.dirs.get(segment)
      if (!child) {
        child = { dirs: new Map(), files: [], path: dir.path ? `${dir.path}/${segment}` : segment }
        dir.dirs.set(segment, child)
      }
      dir = child
    }
    dir.files.push({ type: 'file', name, entry })
  }

  return finalizeChildren(root)
}

/** Converts a builder's children into sorted, compacted tree nodes. */
function finalizeChildren(dir: DirBuilder): TreeNode[] {
  const dirNodes = [...dir.dirs.entries()]
    .sort(([a], [b]) => compareName(a, b))
    .map(([, child]) => compact(finalizeDir(child)))
  const fileNodes = [...dir.files].sort((a, b) => compareName(a.name, b.name))
  return [...dirNodes, ...fileNodes]
}

/** Finalizes a builder directory (children first), before any compaction of it. */
function finalizeDir(builder: DirBuilder): DirNode {
  return {
    type: 'dir',
    name: lastPathSegment(builder.path),
    path: builder.path,
    children: finalizeChildren(builder),
  }
}

/**
 * Merges a directory with its sole child when that child is itself a directory.
 * The child is already finalized (its own chains compacted), so a single merge
 * collapses the whole chain.
 */
function compact(node: DirNode): DirNode {
  if (node.children.length !== 1) {
    return node
  }
  const [only] = node.children
  if (only?.type !== 'dir') {
    return node
  }
  return {
    type: 'dir',
    name: `${node.name}/${only.name}`,
    path: only.path,
    children: only.children,
  }
}

/** Locale- and number-aware name comparison (so `f2` sorts before `f10`). */
function compareName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true })
}
