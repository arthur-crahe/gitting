use serde::{Serialize, Serializer};

/// Errors from the git layer, surfaced to the frontend.
///
/// Serialized as a flat human-readable string (its [`std::fmt::Display`] form)
/// so the React side receives a ready-to-show message rather than a tagged
/// variant — the UI never branches on the kind, only displays it.
#[derive(Debug, thiserror::Error)]
pub enum GitError {
    /// No git repository could be discovered at or above the given path.
    #[error("aucun dépôt git trouvé à « {path} » : {message}")]
    Discover { path: String, message: String },

    /// The repository has no working tree (a bare repo), which this app cannot review.
    #[error("le dépôt n'a pas d'arbre de travail (dépôt nu)")]
    Bare,

    /// The repository identity (current branch / HEAD) could not be read.
    #[error("échec de la lecture de l'identité du dépôt : {0}")]
    Identity(String),

    /// Reading the repository status (index/worktree/HEAD comparison) failed.
    #[error("échec de la lecture du statut du dépôt : {0}")]
    Status(String),

    /// Computing a file diff (blob comparison / hunk extraction) failed.
    #[error("échec du calcul du diff : {0}")]
    Diff(String),

    /// Writing the index (staging / unstaging a file) failed.
    #[error("échec de la mise à jour de l'index : {0}")]
    Index(String),

    /// An internal failure not tied to a specific git operation, e.g. a blocking
    /// task that panicked or was cancelled.
    #[error("erreur interne : {0}")]
    Internal(String),
}

impl Serialize for GitError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
