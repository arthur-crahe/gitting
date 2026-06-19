use std::path::Path;

use gix::bstr::ByteSlice;

use super::error::GitError;
use super::RepoInfo;

/// Discovers the git repository at or above `path` and reads its identity.
///
/// Uses `gix::discover` so the caller may pass any directory inside the
/// working tree, not just its root. Bare repositories (no working tree) are
/// rejected — there is nothing to review without a checkout.
pub fn open_repo(path: &Path) -> Result<RepoInfo, GitError> {
    let repo = discover(path)?;
    let root = repo.workdir().ok_or(GitError::Bare)?;
    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    // The current branch's short name; `None` on a detached HEAD. On an unborn
    // HEAD (no commits yet) this still yields the branch the next commit lands on.
    let branch = repo
        .head_name()
        .map_err(|e| GitError::Identity(e.to_string()))?
        .map(|n| n.shorten().to_str_lossy().into_owned());

    Ok(RepoInfo {
        root: root.display().to_string(),
        name,
        branch,
    })
}

/// Opens the repository enclosing `path`, mapping discovery failures to [`GitError`].
pub(super) fn discover(path: &Path) -> Result<gix::Repository, GitError> {
    gix::discover(path).map_err(|e| GitError::Discover {
        path: path.display().to_string(),
        message: e.to_string(),
    })
}
