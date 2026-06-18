/// Builds and runs the Tauri application.
///
/// Kept free of business logic for the scaffold. The git commands (status, diff,
/// stage, unstage) and shared state are wired here in a later step — see CLAUDE.md.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_process::init());

    // The updater plugin is desktop-only; gate it so mobile targets still build.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
