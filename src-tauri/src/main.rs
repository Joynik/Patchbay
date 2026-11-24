mod agents;
mod commands;
mod mcp;
mod storage;

use mcp::sync::Workspace;
use std::sync::Mutex;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let workspace = Workspace::open(app.path().home_dir()?, app.path().app_data_dir()?)
                .map_err(std::io::Error::other)?;
            app.manage(Mutex::new(workspace));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::snapshot,
            commands::change
        ])
        .run(tauri::generate_context!())
        .expect("could not run Patchbay");
}
