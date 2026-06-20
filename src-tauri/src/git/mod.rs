//! Git layer — all reads go through `gix` (gitoxide), no installed-`git`
//! dependency and no text-output parsing.
//!
//! The shared, `serde`-serialized data shapes live here; the submodules hold the
//! `gix` calls: [`repo`] (open/discover + identity), [`status`] (the two review
//! sections) and [`diff`] (their per-file hunks). Index writes (stage/unstage)
//! are isolated in [`index_write`] behind the `IndexWriter` trait — the one
//! place that shells out to the `git` binary, per `CLAUDE.md`.

mod diff;
mod error;
mod index_write;
mod repo;
mod status;

#[cfg(test)]
mod test_support;

pub use diff::{diff_staged, diff_stats, diff_unstaged};
pub use error::GitError;
pub use index_write::{stage_file, unstage_file};
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

/// The role of a single line within a diff hunk, mirrored as a TypeScript union.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DiffLineKind {
    /// Unchanged line, present on both sides.
    Context,
    /// Line added on the new side.
    Add,
    /// Line removed from the old side.
    Delete,
}

/// One line of a diff hunk, carrying its 1-based line numbers on each side.
///
/// `old_no` is `None` for an added line and `new_no` is `None` for a deleted
/// line; a context line has both. `content` is the line text without its
/// trailing newline.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Line {
    /// Whether the line is context, added or deleted.
    pub kind: DiffLineKind,
    /// 1-based line number on the old side, or `None` for an added line.
    pub old_no: Option<u32>,
    /// 1-based line number on the new side, or `None` for a deleted line.
    pub new_no: Option<u32>,
    /// The line text, newline excluded — decoded lossily as UTF-8, so invalid
    /// bytes in a non-binary file surface as U+FFFD.
    pub content: String,
}

/// A contiguous block of changed lines, matching a unified-diff `@@` header.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hunk {
    /// 1-based first line number on the old side.
    pub old_start: u32,
    /// Number of old-side lines the hunk spans.
    pub old_lines: u32,
    /// 1-based first line number on the new side.
    pub new_start: u32,
    /// Number of new-side lines the hunk spans.
    pub new_lines: u32,
    /// The hunk's lines, in display order.
    pub lines: Vec<Line>,
}

/// The structured diff of a single changed file — the git-faithful hunks the
/// frontend renders, and exactly the change staging this file would apply.
///
/// `hunks` is empty when there is nothing to render line-by-line: a binary file
/// (`is_binary`), an unresolved conflict, or a pure mode change (`old_mode` ≠
/// `new_mode` with identical content).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffFile {
    /// Repository-relative path (the new path for a rename).
    pub path: String,
    /// How the file changed; reuses the status [`ChangeKind`].
    pub change_kind: ChangeKind,
    /// Octal file mode on the old side (e.g. `"100644"`), or `None` if absent.
    pub old_mode: Option<String>,
    /// Octal file mode on the new side, or `None` if absent.
    pub new_mode: Option<String>,
    /// Whether either side is binary, in which case no hunks are produced.
    pub is_binary: bool,
    /// The diff hunks, in file order; empty for a binary, conflict, submodule or
    /// mode-only file.
    pub hunks: Vec<Hunk>,
}

/// The added/removed line magnitude of one changed file — the sidebar's `+N −N`
/// signal, summed from the same `gix` hunks the diff renders. A binary, conflict,
/// submodule or mode-only file (no hunks) reports `add: 0, del: 0`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    /// Repository-relative path.
    pub path: String,
    /// Lines added on the new side.
    pub add: u32,
    /// Lines removed from the old side.
    pub del: u32,
}

/// Per-file line magnitudes for both review sections — the lightweight counts
/// the sidebar shows, computed server-side so only the totals cross the IPC
/// boundary instead of every hunk.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffStats {
    /// "À reviewer" per-file counts.
    pub unstaged: Vec<FileStat>,
    /// "Validé" per-file counts.
    pub staged: Vec<FileStat>,
}

#[cfg(test)]
mod tests {
    use super::{ChangeKind, DiffFile, DiffLineKind, Hunk, Line};

    /// The diff wire shape must serialise to the camelCase keys the frontend
    /// types mirror, including the `null` line numbers on added/deleted lines.
    #[test]
    fn diff_file_serialises_to_camel_case() {
        let file = DiffFile {
            path: "src/a.rs".into(),
            change_kind: ChangeKind::Modified,
            old_mode: Some("100644".into()),
            new_mode: Some("100644".into()),
            is_binary: false,
            hunks: vec![Hunk {
                old_start: 1,
                old_lines: 1,
                new_start: 1,
                new_lines: 2,
                lines: vec![
                    Line { kind: DiffLineKind::Context, old_no: Some(1), new_no: Some(1), content: "keep".into() },
                    Line { kind: DiffLineKind::Add, old_no: None, new_no: Some(2), content: "new".into() },
                ],
            }],
        };

        let json = serde_json::to_value(&file).expect("serialise DiffFile");
        assert_eq!(json["changeKind"], "modified");
        assert_eq!(json["oldMode"], "100644");
        assert_eq!(json["isBinary"], false);

        let line = &json["hunks"][0]["lines"][1];
        assert_eq!(line["kind"], "add");
        assert_eq!(line["oldNo"], serde_json::Value::Null);
        assert_eq!(line["newNo"], 2);
    }
}
