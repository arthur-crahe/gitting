mod commands;
mod git;

/// Builds and runs the Tauri application.
///
/// Wires the plugins, registers the git commands, and starts the event loop.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init());

    // Gated so mobile targets, which lack the updater plugin, still build.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .invoke_handler(tauri::generate_handler![
            commands::open_repo,
            commands::repo_status,
            commands::diff_unstaged,
            commands::diff_staged,
            commands::diff_stats,
            commands::stage_file,
            commands::unstage_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
