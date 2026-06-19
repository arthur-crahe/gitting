//! Git layer — all reads go through `gix` (gitoxide), no installed-`git`
//! dependency and no text-output parsing.
//!
//! The shared, `serde`-serialized data shapes live here; the submodules hold the
//! `gix` calls: [`repo`] (open/discover + identity) and [`status`] (the two
//! review sections). Index writes (stage/unstage) are kept out of this module —
//! they belong in an isolated shell-out, per `CLAUDE.md`.

mod error;
mod repo;
mod status;

pub use error::GitError;
pub use repo::open_repo;
pub use status::read_status;

use serde::Serialize;

/// How a file changed, mirrored as a TypeScript union on the frontend.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ChangeKind {
    /// New file staged for commit, or marked intent-to-add in the worktree.
    Added,
    /// Existing file with content (or submodule) changes.
    Modified,
    /// File removed.
    Deleted,
    /// File renamed (or copied).
    Renamed,
    /// The filesystem type changed (e.g. file ↔ symlink).
    TypeChange,
    /// New file not yet tracked by git.
    Untracked,
    /// File with an unresolved merge conflict.
    Conflict,
}

/// A single changed file in one of the review sections.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusEntry {
    /// Repository-relative path.
    pub path: String,
    /// How the file changed.
    pub kind: ChangeKind,
}

/// Identity of an opened repository, shown in the titlebar.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    /// Absolute path of the working-tree root.
    pub root: String,
    /// Working-tree directory name.
    pub name: String,
    /// Current branch short name; `None` on a detached HEAD.
    pub branch: Option<String>,
}

/// The two review sections: changes awaiting review and changes accepted.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoStatus {
    /// "À reviewer" — index vs. working tree.
    pub unstaged: Vec<StatusEntry>,
    /// "Validé" — HEAD-tree vs. index.
    pub staged: Vec<StatusEntry>,
}
