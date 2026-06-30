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

    let mut unstaged = Vec::new();
    let mut staged = Vec::new();

    for item in status_iter(&repo)? {
        match item? {
            // Staged: HEAD-tree vs. index.
            status::Item::TreeIndex(change) => {
                let (location, ..) = change.fields();
                let path = path_string(location);
                staged.push(StatusEntry { path, kind: staged_kind(&change) });
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
                // One entry per untracked file (the walk emits `Files`, never a
                // collapsed directory), classified on its own status — the path is
                // the full `newdir/inner.txt`, which the sidebar nests on its own.
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

/// The configured `gix` status iterator shared by the file list ([`read_status`])
/// and the per-file diffs ([`super::diff`]), so both classify and collapse
/// entries identically — same index↔worktree rename detection, so an unstaged
/// rename collapses into a single `Renamed` row instead of a deletion plus an
/// untracked addition. Each item is a [`Result`]; a mid-iteration failure
/// surfaces as a [`GitError::Status`] rather than silently truncating the walk.
///
/// [`UntrackedFiles::Files`](gix::status::UntrackedFiles::Files) recurses the
/// dirwalk into brand-new directories (gix defaults to `Collapsed`, which would
/// yield one entry for the whole directory) so every untracked **file** surfaces
/// as its own `newdir/inner.txt` entry — each reviewable on its own, instead of a
/// single opaque `newdir` row. A nested repository, symlink or non-regular entry
/// is still emitted as one non-`File` entry and listed without hunks downstream.
pub(super) fn status_iter(
    repo: &gix::Repository,
) -> Result<impl Iterator<Item = Result<status::Item, GitError>> + '_, GitError> {
    let iter = repo
        .status(gix::progress::Discard)
        .map_err(|e| GitError::Status(e.to_string()))?
        .index_worktree_rewrites(Some(gix::diff::Rewrites::default()))
        .untracked_files(gix::status::UntrackedFiles::Files)
        .into_iter(None::<BString>)
        .map_err(|e| GitError::Status(e.to_string()))?;
    Ok(iter.map(|item| item.map_err(|e| GitError::Status(e.to_string()))))
}

/// Maps a staged (HEAD-tree vs. index) change to a [`ChangeKind`]. Shared with
/// [`super::diff`] so the staged file list and the staged diff classify a file
/// identically — the staged counterpart of [`worktree_kind`].
pub(super) fn staged_kind(change: &gix::diff::index::Change) -> ChangeKind {
    use gix::diff::index::Change;
    match change {
        Change::Addition { .. } => ChangeKind::Added,
        Change::Deletion { .. } => ChangeKind::Deleted,
        Change::Modification { .. } => ChangeKind::Modified,
        Change::Rewrite { .. } => ChangeKind::Renamed,
    }
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

    #[test]
    fn brand_new_directory_lists_each_file_not_the_folder() {
        let repo = TempRepo::init();
        repo.write("seed.txt", "seed\n");
        repo.stage("seed.txt");
        repo.commit("seed");

        // A brand-new untracked directory: the walk must recurse into it and list
        // each contained file on its own (sorted by path), never the bare folder.
        repo.write("newdir/a.txt", "one\n");
        repo.write("newdir/sub/b.txt", "two\n");

        let status = read_status(repo.path()).expect("read status");
        let untracked: Vec<&str> = status
            .unstaged
            .iter()
            .filter(|e| matches!(e.kind, ChangeKind::Untracked))
            .map(|e| e.path.as_str())
            .collect();
        assert_eq!(untracked, vec!["newdir/a.txt", "newdir/sub/b.txt"]);
        assert!(
            !status.unstaged.iter().any(|e| e.path == "newdir"),
            "the directory itself must not be listed"
        );
    }
}
