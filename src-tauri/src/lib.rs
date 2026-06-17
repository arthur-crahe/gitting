/// Builds and runs the Tauri application.
///
/// Kept free of business logic for the scaffold. The git commands (status, diff,
/// stage, unstage) and shared state are wired here in a later step — see CLAUDE.md.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
