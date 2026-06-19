use std::path::Path;

use gix::bstr::{BString, ByteSlice};
use gix::status::plumbing::index_as_worktree::{Change as WorktreeChange, EntryStatus};
use gix::status::{self, index_worktree};

use super::error::GitError;
use super::{ChangeKind, RepoStatus, StatusEntry};

/// Reads the repository status in a single pass and splits it into the two
/// review sections.
///
/// The `gix` status iterator yields both comparisons interleaved:
/// - [`status::Item::IndexWorktree`] — index vs. working tree → **unstaged**
///   ("À reviewer"), the changes still awaiting review.
/// - [`status::Item::TreeIndex`] — HEAD-tree vs. index → **staged** ("Validé"),
///   already accepted. An unborn HEAD (fresh repo) is treated as the empty tree,
///   so every staged file surfaces as an addition.
///
/// Entries are returned sorted by path within each section for a stable list.
pub fn read_status(path: &Path) -> Result<RepoStatus, GitError> {
    let repo = super::repo::discover(path)?;

    let iter = repo
        .status(gix::progress::Discard)
        .map_err(|e| GitError::Status(e.to_string()))?
        // Detect index↔worktree renames so an unstaged rename collapses into a
        // single `Renamed` row, as on the staged side; without it the rename
        // shows as a deletion plus an untracked addition.
        .index_worktree_rewrites(Some(gix::diff::Rewrites::default()))
        .into_iter(None::<BString>)
        .map_err(|e| GitError::Status(e.to_string()))?;

    let mut unstaged = Vec::new();
    let mut staged = Vec::new();

    for item in iter {
        let item = item.map_err(|e| GitError::Status(e.to_string()))?;
        match item {
            // Staged: HEAD-tree vs. index.
            status::Item::TreeIndex(change) => {
                let (location, ..) = change.fields();
                let path = path_string(location);
                let kind = match &change {
                    gix::diff::index::Change::Addition { .. } => ChangeKind::Added,
                    gix::diff::index::Change::Deletion { .. } => ChangeKind::Deleted,
                    gix::diff::index::Change::Modification { .. } => ChangeKind::Modified,
                    gix::diff::index::Change::Rewrite { .. } => ChangeKind::Renamed,
                };
                staged.push(StatusEntry { path, kind });
            }

            // Unstaged: index vs. working tree.
            status::Item::IndexWorktree(index_worktree::Item::Modification {
                rela_path,
                status,
                ..
            }) => {
                if let Some(kind) = worktree_kind(status) {
                    unstaged.push(StatusEntry {
                        path: path_string(&rela_path),
                        kind,
                    });
                }
            }
            status::Item::IndexWorktree(index_worktree::Item::DirectoryContents {
                entry, ..
            }) => {
                // Classify on the entry's own status: the default dirwalk drops
                // collapsed children, so `collapsed_directory_status` is always
                // `None` here and `entry.status` is the only reliable signal.
                if matches!(entry.status, gix::dir::entry::Status::Untracked) {
                    unstaged.push(StatusEntry {
                        path: path_string(&entry.rela_path),
                        kind: ChangeKind::Untracked,
                    });
                }
            }
            status::Item::IndexWorktree(index_worktree::Item::Rewrite {
                dirwalk_entry, ..
            }) => {
                unstaged.push(StatusEntry {
                    path: path_string(&dirwalk_entry.rela_path),
                    kind: ChangeKind::Renamed,
                });
            }
        }
    }

    unstaged.sort_by(|a, b| a.path.cmp(&b.path));
    staged.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(RepoStatus { unstaged, staged })
}

/// Maps an index-vs-worktree entry status to a [`ChangeKind`], or `None` for a
/// `NeedsUpdate` entry — a stat-only refresh that is not a real content change
/// and must not appear as a pending review item.
///
/// Shared with [`super::diff`] so the unstaged file list and the unstaged diff
/// classify entries identically.
pub(super) fn worktree_kind(
    status: EntryStatus<(), gix::submodule::Status>,
) -> Option<ChangeKind> {
    match status {
        EntryStatus::Conflict { .. } => Some(ChangeKind::Conflict),
        EntryStatus::IntentToAdd => Some(ChangeKind::Added),
        EntryStatus::NeedsUpdate(_) => None,
        EntryStatus::Change(change) => Some(match change {
            WorktreeChange::Removed => ChangeKind::Deleted,
            WorktreeChange::Type { .. } => ChangeKind::TypeChange,
            WorktreeChange::Modification { .. } => ChangeKind::Modified,
            WorktreeChange::SubmoduleModification(_) => ChangeKind::Modified,
        }),
    }
}

/// Owned, lossy-UTF-8 rendering of a repo-relative path. Takes `&[u8]` so every
/// `BStr`/`BString`/`Cow<BStr>` path coerces in. Shared with [`super::diff`].
pub(super) fn path_string(path: &[u8]) -> String {
    path.to_str_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::read_status;
    use crate::git::test_support::TempRepo;
    use crate::git::ChangeKind;

    #[test]
    fn modification_moves_from_unstaged_to_staged() {
        let repo = TempRepo::init();
        repo.write("a.txt", "one\ntwo\n");
        repo.stage("a.txt");
        repo.commit("add a.txt");

        // A worktree edit is pending review: it shows up unstaged, not staged.
        repo.write("a.txt", "one\ntwo\nthree\n");
        let status = read_status(repo.path()).expect("read status");
        assert_eq!(status.unstaged.len(), 1);
        assert_eq!(status.unstaged[0].path, "a.txt");
        assert!(matches!(status.unstaged[0].kind, ChangeKind::Modified));
        assert!(status.staged.is_empty());

        // Validating it (staging) moves it into the accepted section.
        repo.stage("a.txt");
        let status = read_status(repo.path()).expect("read status");
        assert!(status.unstaged.is_empty());
        assert_eq!(status.staged.len(), 1);
        assert_eq!(status.staged[0].path, "a.txt");
        assert!(matches!(status.staged[0].kind, ChangeKind::Modified));
    }
}
