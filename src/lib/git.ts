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
 * Prompts for a directory to open as the repository.
 *
 * @returns the chosen absolute path, or `null` if the dialog was cancelled.
 */
export async function pickRepoDirectory(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false })
  // `open` returns a path, an array (only with `multiple`), or null on cancel.
  return typeof selected === 'string' ? selected : null
}
