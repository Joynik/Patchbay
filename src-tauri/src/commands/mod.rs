use crate::mcp::sync::{Action, Snapshot, Workspace};
use std::sync::Mutex;
use tauri::State;

#[tauri::command]
pub fn snapshot(workspace: State<'_, Mutex<Workspace>>) -> Result<Snapshot, String> {
    workspace
        .lock()
        .map_err(|error| error.to_string())?
        .refresh()
}

#[tauri::command]
pub fn change(workspace: State<'_, Mutex<Workspace>>, action: Action) -> Result<Snapshot, String> {
    workspace
        .lock()
        .map_err(|error| error.to_string())?
        .change(action)
}
