import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

/**
 * How a file changed. Mirrors the Rust `ChangeKind` enum (camelCase via serde);
 * the two are kept in lockstep — see `src-tauri/src/git/mod.rs`.
 */
export type ChangeKind =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'typeChange'
  | 'untracked'
  | 'conflict'

/** A single changed file in one of the review sections. */
export interface StatusEntry {
  /** Repository-relative path. */
  readonly path: string
  /** How the file changed. */
  readonly kind: ChangeKind
}

/** Identity of an opened repository. */
export interface RepoInfo {
  /** Absolute path of the working-tree root. */
  readonly root: string
  /** Working-tree directory name. */
  readonly name: string
  /** Current branch short name; `null` on a detached HEAD. */
  readonly branch: string | null
}

/**
 * The two review sections: {@link RepoStatus.unstaged} ("À reviewer", index vs.
 * working tree) and {@link RepoStatus.staged} ("Validé", HEAD-tree vs. index).
 */
export interface RepoStatus {
  readonly unstaged: readonly StatusEntry[]
  readonly staged: readonly StatusEntry[]
}

/**
 * The role of a line within a diff hunk. Mirrors the Rust `DiffLineKind`
 * (camelCase via serde); kept in lockstep — see `src-tauri/src/git/mod.rs`.
 */
export type DiffLineKind = 'context' | 'add' | 'delete'

/** One line of a diff hunk, with its 1-based line numbers on each side. */
export interface DiffLine {
  /** Whether the line is context, added or deleted. */
  readonly kind: DiffLineKind
  /** 1-based old-side line number, or `null` for an added line. */
  readonly oldNo: number | null
  /** 1-based new-side line number, or `null` for a deleted line. */
  readonly newNo: number | null
  /** The line text, newline excluded. */
  readonly content: string
}

/** A contiguous block of changed lines, matching a unified-diff `@@` header. */
export interface Hunk {
  readonly oldStart: number
  readonly oldLines: number
  readonly newStart: number
  readonly newLines: number
  readonly lines: readonly DiffLine[]
}

/**
 * The structured diff of one changed file — the git-faithful hunks to render,
 * which are exactly the change staging this file would apply. `hunks` is empty
 * for a binary file, an unresolved conflict, or a pure mode change.
 */
export interface DiffFile {
  /** Repository-relative path (the new path for a rename). */
  readonly path: string
  /** How the file changed. */
  readonly changeKind: ChangeKind
  /** Octal old-side mode (e.g. `"100644"`), or `null` if absent. */
  readonly oldMode: string | null
  /** Octal new-side mode, or `null` if absent. */
  readonly newMode: string | null
  /** Whether either side is binary, in which case there are no hunks. */
  readonly isBinary: boolean
  /** The diff hunks; empty for binary/conflict/mode-only files. */
  readonly hunks: readonly Hunk[]
}

/**
 * Discovers the git repository enclosing `path` and returns its identity.
 *
 * @throws if no repository is found, it is bare (no working tree), or its
 *   identity (current branch / HEAD) cannot be read.
 */
export function openRepo(path: string): Promise<RepoInfo> {
  return invoke<RepoInfo>('open_repo', { path })
}

/** Reads the repository status, split into the unstaged and staged sections. */
export function readStatus(path: string): Promise<RepoStatus> {
  return invoke<RepoStatus>('repo_status', { path })
}

/**
 * Reads the unstaged diff (index vs. working tree) of the repo at `path`, one
 * {@link DiffFile} per changed file — the changes still awaiting review.
 *
 * @throws if the repository cannot be read.
 */
export function diffUnstaged(path: string): Promise<readonly DiffFile[]> {
  return invoke<DiffFile[]>('diff_unstaged', { path })
}

/**
 * Reads the staged diff (HEAD-tree vs. index) of the repo at `path`, one
 * {@link DiffFile} per changed file — the changes already accepted.
 *
 * @throws if the repository cannot be read.
 */
export function diffStaged(path: string): Promise<readonly DiffFile[]> {
  return invoke<DiffFile[]>('diff_staged', { path })
}

/**
 * Validates a file: stages `file` (repo-relative) in the repo at `path`, moving
 * it from "À reviewer" to "Validé".
 *
 * @throws if the index write fails (e.g. `git` is not installed).
 */
export function stageFile(path: string, file: string): Promise<void> {
  return invoke<void>('stage_file', { path, file })
}

/**
 * Un-validates a file: unstages `file` (repo-relative) in the repo at `path`,
 * sending it back to "À reviewer".
 *
 * @throws if the index write fails (e.g. `git` is not installed).
 */
export function unstageFile(path: string, file: string): Promise<void> {
  return invoke<void>('unstage_file', { path, file })
}

/**
 * Prompts for a directory to open as the repository.
 *
 * @returns the chosen absolute path, or `null` if the dialog was cancelled.
 */
export async function pickRepoDirectory(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false })
  // `open` returns a path, an array (only with `multiple`), or null on cancel.
  return typeof selected === 'string' ? selected : null
}
