mod commands;
mod git;

/// Turns on WebKitGTK's smooth wheel scrolling for the given window. It is off by
/// default in WebKitGTK, which is why the Linux WebView scrolls in coarse, jerky
/// steps; WebView2 (Windows) and WKWebView already animate, so this is Linux-only.
#[cfg(target_os = "linux")]
fn enable_smooth_scrolling(window: &tauri::WebviewWindow) {
    use webkit2gtk::{SettingsExt, WebViewExt};

    // `inner()` hands back the live `webkit2gtk::WebView`; flip the setting on its
    // own `WebKitSettings`. A failure here only forgoes the nicety, so never panic.
    let _ = window.with_webview(|webview| {
        if let Some(settings) = WebViewExt::settings(&webview.inner()) {
            settings.set_enable_smooth_scrolling(true);
        }
    });
}

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
        .setup(|_app| {
            #[cfg(target_os = "linux")]
            {
                use tauri::Manager;
                if let Some(window) = _app.get_webview_window("main") {
                    enable_smooth_scrolling(&window);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_repo,
            commands::repo_status,
            commands::diff_unstaged,
            commands::diff_staged,
            commands::stage_file,
            commands::unstage_file,
            commands::stage_files,
            commands::unstage_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
