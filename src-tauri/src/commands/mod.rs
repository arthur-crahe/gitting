//! Tauri commands — thin async wrappers over the [`crate::git`] layer.
//!
//! The `gix` reads walk the working tree and block, so each command runs on the
//! blocking pool via [`tauri::async_runtime::spawn_blocking`] to keep the async
//! runtime responsive. The repository is opened per call inside the closure, so
//! nothing crosses the thread boundary but an owned `String`.

use std::path::PathBuf;

use crate::git::{self, DiffFile, GitError, RepoInfo, RepoStatus};

/// Opens the repository enclosing `path` and returns its identity.
#[tauri::command]
pub async fn open_repo(path: String) -> Result<RepoInfo, GitError> {
    run(move || git::open_repo(&PathBuf::from(path))).await
}

/// Reads the repository status, split into the unstaged and staged sections.
#[tauri::command]
pub async fn repo_status(path: String) -> Result<RepoStatus, GitError> {
    run(move || git::read_status(&PathBuf::from(path))).await
}

/// Reads the unstaged section's diff (index vs. working tree), per changed file.
#[tauri::command]
pub async fn diff_unstaged(path: String) -> Result<Vec<DiffFile>, GitError> {
    run(move || git::diff_unstaged(&PathBuf::from(path))).await
}

/// Reads the staged section's diff (HEAD-tree vs. index), per changed file.
#[tauri::command]
pub async fn diff_staged(path: String) -> Result<Vec<DiffFile>, GitError> {
    run(move || git::diff_staged(&PathBuf::from(path))).await
}

/// Validates a file: stages it, moving it from "À reviewer" to "Validé".
#[tauri::command]
pub async fn stage_file(path: String, file: String) -> Result<(), GitError> {
    run(move || git::stage_file(&PathBuf::from(path), &file)).await
}

/// Un-validates a file: unstages it, sending it back to "À reviewer".
#[tauri::command]
pub async fn unstage_file(path: String, file: String) -> Result<(), GitError> {
    run(move || git::unstage_file(&PathBuf::from(path), &file)).await
}

/// Runs a blocking git operation on the blocking pool, flattening a join panic
/// into a [`GitError`].
async fn run<T, F>(op: F) -> Result<T, GitError>
where
    F: FnOnce() -> Result<T, GitError> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(op)
        .await
        .map_err(|e| GitError::Internal(format!("tâche interrompue : {e}")))?
}
