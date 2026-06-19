//! Index writes — the one place this app shells out to the system `git` binary.
//!
//! `gix` has no stable index add/remove API yet, so validating a file (`git
//! add`) and sending it back to review (`git restore --staged`) run the `git`
//! CLI. The shell-out is isolated here behind the [`IndexWriter`] trait so it
//! can be swapped for a native `gix` implementation once that lands, without
//! touching the commands or the rest of the git layer.

use std::ffi::OsString;
use std::io::ErrorKind;
use std::path::Path;
use std::process::Command;

use super::error::GitError;

/// Stages a file into the index — accepting it into the "Validé" section.
pub fn stage_file(path: &Path, file: &str) -> Result<(), GitError> {
    GitCli::default().stage(&workdir(path)?, file)
}

/// Unstages a file — sending it back to the "À reviewer" section.
pub fn unstage_file(path: &Path, file: &str) -> Result<(), GitError> {
    GitCli::default().unstage(&workdir(path)?, file)
}

/// The working-tree root of the repository enclosing `path`.
fn workdir(path: &Path) -> Result<std::path::PathBuf, GitError> {
    Ok(super::repo::discover(path)?
        .workdir()
        .ok_or(GitError::Bare)?
        .to_owned())
}

/// A per-file index mutation, isolated so the backend can swap to native `gix`.
trait IndexWriter {
    /// Adds `file` (repo-relative) to the index.
    fn stage(&self, root: &Path, file: &str) -> Result<(), GitError>;
    /// Restores `file` (repo-relative) in the index from `HEAD`.
    fn unstage(&self, root: &Path, file: &str) -> Result<(), GitError>;
}

/// Drives index writes through the `git` CLI.
struct GitCli {
    /// The program to run; overridable in tests, `git` in production.
    program: OsString,
}

impl Default for GitCli {
    fn default() -> Self {
        Self { program: "git".into() }
    }
}

impl IndexWriter for GitCli {
    fn stage(&self, root: &Path, file: &str) -> Result<(), GitError> {
        self.run(root, &["add", "--", file])
    }

    fn unstage(&self, root: &Path, file: &str) -> Result<(), GitError> {
        self.run(root, &["restore", "--staged", "--", file])
    }
}

impl GitCli {
    /// Runs `git -C <root> <args…>`, mapping a missing binary, a spawn failure
    /// or a non-zero exit to a [`GitError::Index`] carrying a usable message.
    fn run(&self, root: &Path, args: &[&str]) -> Result<(), GitError> {
        reject_unsafe_path(args)?;
        let output = Command::new(&self.program).arg("-C").arg(root).args(args).output();
        let output = match output {
            Ok(output) => output,
            // The only place the app needs an installed `git`; say so plainly.
            Err(e) if e.kind() == ErrorKind::NotFound => {
                return Err(GitError::Index(
                    "git introuvable : la validation nécessite git installé".into(),
                ))
            }
            Err(e) => return Err(GitError::Index(e.to_string())),
        };
        if output.status.success() {
            Ok(())
        } else {
            Err(GitError::Index(
                String::from_utf8_lossy(&output.stderr).trim().to_owned(),
            ))
        }
    }
}

/// Rejects an absolute path or one escaping the worktree (`..`); the file always
/// comes from our own status list, so this only guards against a malformed IPC
/// argument. The path is the last element, after the `--` separator.
fn reject_unsafe_path(args: &[&str]) -> Result<(), GitError> {
    let file = Path::new(args.last().copied().unwrap_or_default());
    let unsafe_path = file.is_absolute()
        || file
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir));
    if unsafe_path {
        return Err(GitError::Index(format!(
            "chemin de fichier invalide : {}",
            file.display()
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{stage_file, unstage_file, GitCli, IndexWriter};
    use crate::git::test_support::TempRepo;
    use crate::git::{read_status, ChangeKind, GitError};

    #[test]
    fn stage_then_unstage_moves_a_file_between_sections() {
        let repo = TempRepo::init();
        repo.write("a.txt", "x\n");
        repo.stage("a.txt");
        repo.commit("add a.txt");
        repo.write("a.txt", "y\n");

        // The edit starts unstaged.
        let status = read_status(repo.path()).expect("status");
        assert_eq!(status.unstaged.len(), 1);
        assert!(status.staged.is_empty());

        // Validating it stages it.
        stage_file(repo.path(), "a.txt").expect("stage");
        let status = read_status(repo.path()).expect("status");
        assert!(status.unstaged.is_empty());
        assert_eq!(status.staged.len(), 1);
        assert!(matches!(status.staged[0].kind, ChangeKind::Modified));

        // Un-validating it sends it back to review.
        unstage_file(repo.path(), "a.txt").expect("unstage");
        let status = read_status(repo.path()).expect("status");
        assert_eq!(status.unstaged.len(), 1);
        assert!(status.staged.is_empty());
    }

    #[test]
    fn missing_git_binary_yields_a_clear_message() {
        let repo = TempRepo::init();
        let cli = GitCli { program: "gitting-no-such-binary".into() };
        let err = cli.stage(repo.path(), "a.txt").expect_err("should fail");
        let GitError::Index(message) = err else {
            panic!("expected Index error, got {err:?}");
        };
        assert!(message.contains("git introuvable"), "got: {message}");
    }

    #[test]
    fn an_escaping_path_is_rejected() {
        let repo = TempRepo::init();
        let err = stage_file(repo.path(), "../outside.txt").expect_err("should reject");
        assert!(matches!(err, GitError::Index(_)));
    }
}
