//! ADR-026 command compatibility. One Runtime-owned shell installs the tray,
//! hotkey and shutdown worker; startup keeps main's fixed registry owner.
use serde_json::Value;
use tauri::{AppHandle, Manager, WebviewWindow};

fn main_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("permission_denied".into())
    }
}

#[tauri::command]
pub fn show_main(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    if !matches!(window.label(), "main" | "overlay") {
        return Err("permission_denied".into());
    }
    crate::shell::show_main(&app)
}

#[tauri::command]
pub fn hide_window(window: WebviewWindow) -> Result<(), String> {
    match window.label() {
        "overlay" => {
            crate::shell::hide_overlay(window.app_handle());
            Ok(())
        }
        "main" => window.hide().map_err(|_| "window_failed".into()),
        _ => Err("permission_denied".into()),
    }
}

#[tauri::command]
pub fn exit_app(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    main_only(&window)?;
    crate::shell::request_exit(&app);
    Ok(())
}

#[tauri::command]
pub fn startup_status(window: WebviewWindow) -> Result<Value, String> {
    main_only(&window)?;
    crate::startup::get()
}

#[tauri::command]
pub fn startup_set(window: WebviewWindow, enabled: bool) -> Result<Value, String> {
    main_only(&window)?;
    crate::startup::set(enabled)
}
