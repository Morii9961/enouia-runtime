#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Enouia Runtime's Windows shell. It hosts Enouia Memory's local client
//! through the Memory adapter (ADR-025) and the companion shell (ADR-026):
//! tray, quick search and opt-in login startup. Closing a window hides it;
//! Exit is explicit and shuts the Memory Core down first. It registers no
//! filesystem, shell, network, provider or Activity command, and it never
//! pauses the independently installed Activity producer.

mod companion;
mod memory;
mod startup;

use memory::MemoryHost;
use tauri::{Manager, RunEvent, WindowEvent};

fn main() {
    let host = MemoryHost::new();
    let args: Vec<String> = std::env::args().collect();
    if let Some(root) = memory::vault_argument(&args) {
        host.open_root(&root);
    }
    let letter = companion::hotkey_letter(&args);
    let mut context = tauri::generate_context!();
    // Login startup (`--autostart`) starts in the tray: the main window is
    // hidden before it is created, and no Vault is opened.
    if args.iter().any(|arg| arg == "--autostart") {
        for window in &mut context.config_mut().app.windows {
            if window.label == companion::MAIN {
                window.visible = false;
            }
        }
    }
    let app = tauri::Builder::default()
        .manage(host)
        .invoke_handler(tauri::generate_handler![
            memory::memory_call,
            memory::memory_pick,
            companion::show_main,
            companion::hide_window,
            companion::exit_app,
            companion::startup_status,
            companion::startup_set
        ])
        .setup(move |app| {
            companion::tray(app)?;
            companion::hotkey(app.handle().clone(), letter);
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing a window hides it; Memory keeps running. Exit is the
            // tray's or Settings' explicit action.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(context)
        .expect("could not start Enouia Runtime");
    app.run(|app, event| {
        if let RunEvent::Exit = event {
            app.state::<MemoryHost>().shutdown();
        }
    });
}
