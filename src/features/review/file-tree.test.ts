import { describe, expect, it } from 'vitest'
import type { ChangeKind, StatusEntry } from '../../lib/git'
import { buildFileTree, type DirNode, type FileNode, type TreeNode } from './file-tree'

/** Builds a status entry; the kind is irrelevant to tree shape, so it defaults. */
function entry(path: string, kind: ChangeKind = 'modified'): StatusEntry {
  return { path, kind }
}

/** Narrows a node to a directory, failing the test otherwise. */
function asDir(node: TreeNode | undefined): DirNode {
  if (node?.type !== 'dir')
    throw new Error(`expected dir, got ${node ? `file "${node.name}"` : 'nothing'}`)
  return node
}

/** Narrows a node to a file, failing the test otherwise. */
function asFile(node: TreeNode | undefined): FileNode {
  if (node?.type !== 'file')
    throw new Error(`expected file, got ${node ? `dir "${node.name}"` : 'nothing'}`)
  return node
}

describe('buildFileTree', () => {
  it('returns nothing for no entries', () => {
    expect(buildFileTree([])).toEqual([])
  })

  it('keeps a root-level file as a leaf', () => {
    const [node] = buildFileTree([entry('README.md', 'untracked')])
    const file = asFile(node)
    expect(file.name).toBe('README.md')
    expect(file.entry.kind).toBe('untracked')
  })

  it('groups files sharing a directory under one node', () => {
    const tree = buildFileTree([entry('a/b.txt'), entry('a/c.txt')])
    expect(tree).toHaveLength(1)
    const dir = asDir(tree[0])
    expect(dir.name).toBe('a')
    expect(dir.path).toBe('a')
    expect(dir.children.map((c) => c.name)).toEqual(['b.txt', 'c.txt'])
  })

  it('compacts a single-child directory chain onto one row', () => {
    const tree = buildFileTree([entry('x/y/z/f.txt')])
    expect(tree).toHaveLength(1)
    const dir = asDir(tree[0])
    expect(dir.name).toBe('x/y/z')
    expect(dir.path).toBe('x/y/z')
    expect(dir.children.map((c) => c.name)).toEqual(['f.txt'])
  })

  it('does not compact a directory whose only child is a file', () => {
    const tree = buildFileTree([entry('stores/use-repo-store.ts')])
    expect(tree).toHaveLength(1)
    const dir = asDir(tree[0])
    expect(dir.name).toBe('stores')
    expect(dir.path).toBe('stores')
    expect(asFile(dir.children[0]).name).toBe('use-repo-store.ts')
  })

  it('does not compact a directory with more than one child', () => {
    const tree = buildFileTree([entry('a/b/c.txt'), entry('a/d.txt')])
    const a = asDir(tree[0])
    expect(a.name).toBe('a')
    // Two children: the "b" directory (not merged into "a") and the file "d.txt".
    expect(a.children.map((c) => `${c.type}:${c.name}`)).toEqual(['dir:b', 'file:d.txt'])
  })

  it('orders directories before files, each by name', () => {
    const tree = buildFileTree([entry('z.txt'), entry('a/x.txt'), entry('m.txt'), entry('b/y.txt')])
    expect(tree.map((n) => `${n.type}:${n.name}`)).toEqual([
      'dir:a',
      'dir:b',
      'file:m.txt',
      'file:z.txt',
    ])
  })

  it('matches the documented compaction example', () => {
    const tree = buildFileTree([
      entry('src/features/review/review-view.tsx'),
      entry('src/features/review/tree-view.tsx', 'added'),
      entry('src/stores/use-repo-store.ts'),
      entry('README.md', 'untracked'),
    ])

    expect(tree.map((n) => `${n.type}:${n.name}`)).toEqual(['dir:src', 'file:README.md'])

    const src = asDir(tree[0])
    expect(src.children.map((c) => c.name)).toEqual(['features/review', 'stores'])

    const review = asDir(src.children[0])
    expect(review.path).toBe('src/features/review')
    expect(review.children.map((c) => c.name)).toEqual(['review-view.tsx', 'tree-view.tsx'])

    const stores = asDir(src.children[1])
    expect(stores.path).toBe('src/stores')
    expect(stores.children.map((c) => c.name)).toEqual(['use-repo-store.ts'])
  })

  it('gives every directory node a unique path', () => {
    const tree = buildFileTree([
      entry('a/b/c.txt'),
      entry('a/d.txt'),
      entry('a/b/e.txt'),
      entry('f/g.txt'),
    ])
    const paths: string[] = []
    const walk = (nodes: readonly TreeNode[]) => {
      for (const node of nodes) {
        if (node.type === 'dir') {
          paths.push(node.path)
          walk(node.children)
        }
      }
    }
    walk(tree)
    expect(new Set(paths).size).toBe(paths.length)
  })
})
