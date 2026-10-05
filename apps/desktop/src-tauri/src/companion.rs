//! Runtime's companion shell (ADR-026), ported from Memory's reference
//! shell (ADR-MEM-44): a tray icon, a global hotkey that opens the quick
//! search window, and the window lifecycle commands. Closing a window hides
//! it and Memory keeps running. Leaving Runtime is an explicit Exit (tray or
//! Settings), which shuts the Memory Core down before the process ends.
//! Nothing here touches Activity.

use crate::memory::MemoryHost;
use serde_json::{Value, json};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WebviewWindow};

pub const MAIN: &str = "main";
pub const QUICK_SEARCH: &str = "overlay";

pub fn show(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn hide_quick_search(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(QUICK_SEARCH) {
        let _ = window.hide();
    }
}

/// Every way of showing Runtime (tray click, tray menu, quick search's link)
/// hides the always-on-top quick search first, so it never covers the main
/// window.
pub fn show_runtime(app: &AppHandle) {
    hide_quick_search(app);
    show(app, MAIN);
}

/// Explicit exit: cancel import and index work, wait for verify or backup,
/// release the Vault, then end the process. Only the first request runs.
pub fn exit(app: &AppHandle) {
    if !app.state::<MemoryHost>().begin_close() {
        return;
    }
    hide_quick_search(app);
    if let Some(main) = app.get_webview_window(MAIN) {
        let _ = main.set_title("Enouia Runtime · finishing Memory operations");
    }
    let app = app.clone();
    std::thread::spawn(move || {
        app.state::<MemoryHost>().shutdown();
        app.exit(0);
    });
}

fn main_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == MAIN {
        Ok(())
    } else {
        Err("permission_denied".to_owned())
    }
}

#[tauri::command]
pub fn show_main(app: AppHandle) {
    show_runtime(&app);
}

#[tauri::command]
pub fn hide_window(window: WebviewWindow) {
    let _ = window.hide();
}

#[tauri::command]
pub fn exit_app(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    main_only(&window)?;
    exit(&app);
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

/// Tray: left click shows Runtime; the menu offers show, lock and exit.
pub fn tray(app: &tauri::App) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "Show Enouia Runtime", true, None::<&str>)?;
    let lock_item = MenuItem::with_id(app, "lock", "Lock Memory Vault", true, None::<&str>)?;
    let exit_item = MenuItem::with_id(app, "exit", "Exit Enouia Runtime", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &lock_item, &exit_item])?;
    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Enouia Runtime")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_runtime(app),
            "lock" => {
                hide_quick_search(app);
                // Locking joins operations; never on the event-loop thread.
                let app = app.clone();
                std::thread::spawn(move || {
                    app.state::<MemoryHost>().lock_vault();
                });
            }
            "exit" => exit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_runtime(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// `--hotkey-key X`: the letter of Ctrl+Alt+X (M by default).
pub fn hotkey_letter(args: &[String]) -> u8 {
    args.windows(2)
        .find(|w| w[0] == "--hotkey-key")
        .and_then(|w| w[1].bytes().next())
        .map(|b| b.to_ascii_uppercase())
        .filter(u8::is_ascii_uppercase)
        .unwrap_or(b'M')
}

/// Ctrl+Alt+<letter> on its own thread opens quick search. A combination
/// another program holds is reported as a conflict, never silently.
#[cfg(windows)]
pub fn hotkey(app: AppHandle, letter: u8) {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        MOD_ALT, MOD_CONTROL, MOD_NOREPEAT, RegisterHotKey,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetMessageW, MSG, WM_HOTKEY};
    std::thread::spawn(move || {
        let combo = format!("Ctrl+Alt+{}", letter as char);
        // SAFETY: a thread-level hotkey (null window) owned by this thread.
        let ok = unsafe {
            RegisterHotKey(
                std::ptr::null_mut(),
                1,
                MOD_CONTROL | MOD_ALT | MOD_NOREPEAT,
                u32::from(letter),
            )
        } != 0;
        app.state::<MemoryHost>().set_companion(json!({
            "tray": "present", "overlay": "available",
            "hotkey": {"combo": combo, "state": if ok { "registered" } else { "conflict" }},
        }));
        if !ok {
            return;
        }
        // SAFETY: zeroed MSG is a valid out-parameter for GetMessageW.
        let mut msg: MSG = unsafe { std::mem::zeroed() };
        // SAFETY: standard message loop for this thread's queue.
        while unsafe { GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) } > 0 {
            if msg.message == WM_HOTKEY {
                show(&app, QUICK_SEARCH);
            }
        }
    });
}

#[cfg(not(windows))]
pub fn hotkey(app: AppHandle, _letter: u8) {
    app.state::<MemoryHost>().set_companion(
        json!({"tray": "present", "overlay": "available", "hotkey": {"state": "unsupported"}}),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hotkey_letter_defaults_to_m_and_accepts_one_letter() {
        let args = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(hotkey_letter(&args(&["exe"])), b'M');
        assert_eq!(hotkey_letter(&args(&["exe", "--hotkey-key", "k"])), b'K');
        assert_eq!(hotkey_letter(&args(&["exe", "--hotkey-key", "7"])), b'M');
        assert_eq!(hotkey_letter(&args(&["exe", "--hotkey-key"])), b'M');
    }
}
