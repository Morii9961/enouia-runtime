//! Runtime-owned window/tray lifecycle; no Activity or Memory domain logic.
use crate::hotkey::Hotkey;
use crate::memory::MemoryHost;
use serde_json::{Value, json};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, PoisonError};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

#[derive(Default)]
pub struct ShellState {
    tray_ready: AtomicBool,
    shutdown_complete: AtomicBool,
    locking: AtomicBool,
    error: Mutex<Option<&'static str>>,
    hotkey: Mutex<Option<Hotkey>>,
    hotkey_status: Mutex<Value>,
}

impl ShellState {
    pub fn tray_ready(&self) -> bool {
        self.tray_ready.load(Ordering::SeqCst)
    }

    pub fn exit_ready(&self) -> bool {
        self.shutdown_complete.load(Ordering::SeqCst)
    }

    fn error(&self, code: Option<&'static str>) {
        *self.error.lock().unwrap_or_else(PoisonError::into_inner) = code;
    }

    fn status(&self, host: &MemoryHost) -> Value {
        json!({
            "tray": if self.tray_ready() { "present" } else { "unavailable" },
            "closeBehavior": "hide", "closing": host.is_closing(),
            "locking": self.locking.load(Ordering::SeqCst),
            "error": *self.error.lock().unwrap_or_else(PoisonError::into_inner),
            "overlay": "available",
            "hotkey": self.hotkey_status.lock().unwrap_or_else(PoisonError::into_inner).clone(),
            "vaultAdmissionError": host.admission_error(),
        })
    }
}

fn allows_shell(window: &str) -> bool {
    window == "main"
}

pub fn show_main(app: &AppHandle) -> Result<(), String> {
    hide_overlay(app);
    let window = app.get_webview_window("main").ok_or("window_unavailable")?;
    window.show().map_err(|_| "window_failed")?;
    window.unminimize().map_err(|_| "window_failed")?;
    window.set_focus().map_err(|_| "window_failed")?;
    Ok(())
}

pub fn hide_overlay(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.emit("overlay-clear", ());
        let _ = window.hide();
    }
}

pub fn show_overlay(app: &AppHandle) -> Result<(), String> {
    if app.state::<MemoryHost>().is_closing()
        || app.state::<ShellState>().locking.load(Ordering::SeqCst)
    {
        return Err("runtime_closing".into());
    }
    if app.state::<MemoryHost>().lifecycle_busy() {
        return Err("runtime_busy".into());
    }
    let window = app
        .get_webview_window("overlay")
        .ok_or("window_unavailable")?;
    let _ = window.emit("overlay-clear", ());
    window.show().map_err(|_| "window_failed")?;
    window.set_focus().map_err(|_| "window_failed")?;
    Ok(())
}

fn publish_companion(app: &AppHandle) {
    let state = app.state::<ShellState>();
    app.state::<MemoryHost>().set_companion(json!({
        "tray": "present", "overlay": "available",
        "hotkey": state.hotkey_status.lock().unwrap_or_else(PoisonError::into_inner).clone()
    }));
}

/// One asynchronous shutdown; the message loop remains responsive while Core
/// waits for verify/backup. A failed worker leaves the app recoverable.
pub fn request_exit(app: &AppHandle) {
    let host = app.state::<MemoryHost>();
    if !host.begin_close() {
        return;
    }
    let _ = show_main(app);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title("Enouia Runtime · finishing Memory operations");
    }
    app.state::<ShellState>().error(None);
    let app = app.clone();
    let host = host.inner().clone();
    tauri::async_runtime::spawn(async move {
        let worker = host.clone();
        let worker_app = app.clone();
        if matches!(
            tauri::async_runtime::spawn_blocking(move || {
                worker.shutdown();
                let state = worker_app.state::<ShellState>();
                let mut owned = state.hotkey.lock().unwrap_or_else(PoisonError::into_inner);
                if let Some(hotkey) = owned.as_mut() {
                    hotkey.stop()?;
                }
                *owned = None;
                Ok::<(), &'static str>(())
            })
            .await,
            Ok(Ok(()))
        ) {
            app.state::<ShellState>()
                .shutdown_complete
                .store(true, Ordering::SeqCst);
            app.exit(0);
        } else {
            host.close_failed();
            app.state::<ShellState>().error(Some("shutdown_failed"));
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("Enouia Runtime");
            }
        }
    });
}

fn request_lock(app: &AppHandle) {
    let state = app.state::<ShellState>();
    if state.locking.swap(true, Ordering::SeqCst) {
        return;
    }
    hide_overlay(app);
    state.error(None);
    let host = app.state::<MemoryHost>().inner().clone();
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let response = tauri::async_runtime::spawn_blocking(move || host.lock_vault()).await;
        let state = app.state::<ShellState>();
        if !matches!(response, Ok(Ok(ref value)) if value["kind"] != "memory_error") {
            state.error(Some("lock_failed"));
            let _ = show_main(&app);
        }
        state.locking.store(false, Ordering::SeqCst);
    });
}

/// Tray actions are native menu events. No page-provided Memory request or
/// file path is passed through this route.
fn dispatch(app: &AppHandle, action: &str) {
    match action {
        "show" => {
            if show_main(app).is_err() {
                app.state::<ShellState>().error(Some("window_failed"));
            }
        }
        "lock" => request_lock(app),
        "search" => {
            if show_overlay(app).is_err() {
                app.state::<ShellState>().error(Some("window_failed"));
            }
        }
        "exit" => request_exit(app),
        _ => {}
    }
}

fn tray_icon() -> tauri::image::Image<'static> {
    let size = 32u32;
    let mut rgba = Vec::with_capacity((size * size * 4) as usize);
    for y in 0..size {
        for x in 0..size {
            let distance = (x as i32 - 16).pow(2) + (y as i32 - 16).pow(2);
            let pixel = match distance {
                0..=5 => [0xee, 0xe7, 0xdc, 255],
                100..=145 => [0x9f, 0xc2, 0xd2, 255],
                6..=225 => [0x0c, 0x11, 0x17, 255],
                _ => [0, 0, 0, 0],
            };
            rgba.extend_from_slice(&pixel);
        }
    }
    tauri::image::Image::new_owned(rgba, size, size)
}

pub fn install(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Enouia Runtime", true, None::<&str>)?;
    let lock = MenuItem::with_id(app, "lock", "Lock Memory Vault", true, None::<&str>)?;
    let search = MenuItem::with_id(app, "search", "Quick Search", true, None::<&str>)?;
    let exit = MenuItem::with_id(app, "exit", "Exit Enouia Runtime", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &search, &lock, &exit])?;
    TrayIconBuilder::with_id("runtime")
        .icon(tray_icon())
        .tooltip("Enouia Runtime")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| dispatch(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                dispatch(tray.app_handle(), "show");
            }
        })
        .build(app)?;
    app.state::<ShellState>()
        .tray_ready
        .store(true, Ordering::SeqCst);
    let args = std::env::args().collect::<Vec<_>>();
    let (owned, status) = match crate::hotkey::letter(&args) {
        Some(letter) => {
            let pressed_app = app.handle().clone();
            let failed_app = app.handle().clone();
            Hotkey::start(
                letter,
                move || {
                    let app = pressed_app.clone();
                    // Never block the hotkey thread waiting for the UI thread.
                    let _ = pressed_app.run_on_main_thread(move || {
                        let _ = show_overlay(&app);
                    });
                },
                move || {
                    let state = failed_app.state::<ShellState>();
                    state
                        .hotkey_status
                        .lock()
                        .unwrap_or_else(PoisonError::into_inner)["state"] = json!("unavailable");
                    publish_companion(&failed_app);
                },
            )
        }
        None => (None, json!({"state":"unavailable", "reason":"invalid_key"})),
    };
    *app.state::<ShellState>()
        .hotkey
        .lock()
        .unwrap_or_else(PoisonError::into_inner) = owned;
    *app.state::<ShellState>()
        .hotkey_status
        .lock()
        .unwrap_or_else(PoisonError::into_inner) = status;
    publish_companion(app.handle());
    Ok(())
}

#[tauri::command]
pub fn shell_status(
    host: State<'_, MemoryHost>,
    state: State<'_, ShellState>,
    window: WebviewWindow,
) -> Result<Value, String> {
    if !allows_shell(window.label()) {
        return Err("permission_denied".to_owned());
    }
    let mut status = state.status(&host);
    status["visible"] = json!(
        window
            .is_visible()
            .map_err(|_| "window_failed".to_owned())?
    );
    status["overlayVisible"] = json!(app_overlay_visible(&window));
    Ok(status)
}

#[tauri::command]
pub fn shell_show(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    if !matches!(window.label(), "main" | "overlay") {
        return Err("permission_denied".to_owned());
    }
    show_main(&app)
}

fn app_overlay_visible(window: &WebviewWindow) -> bool {
    window
        .app_handle()
        .get_webview_window("overlay")
        .is_some_and(|overlay| overlay.is_visible().unwrap_or(false))
}

#[tauri::command]
pub fn shell_search(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    if !allows_shell(window.label()) {
        return Err("permission_denied".into());
    }
    show_overlay(&app)
}

#[tauri::command]
pub fn shell_hide(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    if window.label() != "overlay" {
        return Err("permission_denied".into());
    }
    hide_overlay(&app);
    Ok(())
}

#[tauri::command]
pub fn shell_exit(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    if !allows_shell(window.label()) {
        return Err("permission_denied".to_owned());
    }
    request_exit(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shell_commands_require_the_main_window() {
        assert!(allows_shell("main"));
        for label in ["", "Main", "main ", "overlay", "foreign"] {
            assert!(!allows_shell(label));
        }
    }

    #[test]
    fn shell_status_exposes_only_lifecycle_state() {
        let host = MemoryHost::new();
        let state = ShellState::default();
        assert_eq!(
            state.status(&host),
            json!({"tray":"unavailable", "closeBehavior":"hide", "closing":false, "locking":false, "error":null, "overlay":"available", "hotkey":null,"vaultAdmissionError":null})
        );
        state.tray_ready.store(true, Ordering::SeqCst);
        state.error(Some("lock_failed"));
        host.begin_close();
        assert_eq!(state.status(&host)["closing"], true);
        assert_eq!(state.status(&host)["error"], "lock_failed");
    }

    #[test]
    fn tray_icon_has_opaque_presence_ring_and_transparent_corners() {
        let icon = tray_icon();
        assert_eq!((icon.width(), icon.height()), (32, 32));
        assert_eq!(&icon.rgba()[0..4], &[0, 0, 0, 0]);
        let center = (16 * 32 + 16) * 4;
        assert_eq!(&icon.rgba()[center..center + 4], &[0xee, 0xe7, 0xdc, 255]);
    }
}
