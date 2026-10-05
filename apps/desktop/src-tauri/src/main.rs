#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Enouia Runtime's Windows shell. It hosts Enouia Memory's local client
//! through the Memory adapter (ADR-025). It registers no filesystem, shell,
//! network, provider or Activity command, and closing it never pauses the
//! independently installed Activity producer.

mod hotkey;
mod memory;
mod shell;

use memory::MemoryHost;
use tauri::{Manager, RunEvent, WindowEvent};

fn main() {
    let host = MemoryHost::new();
    let args: Vec<String> = std::env::args().collect();
    if let Some(root) = memory::vault_argument(&args) {
        host.open_root(&root);
    }
    let app = tauri::Builder::default()
        .manage(host)
        .manage(shell::ShellState::default())
        .invoke_handler(tauri::generate_handler![
            memory::memory_call,
            memory::memory_pick,
            shell::shell_status,
            shell::shell_show,
            shell::shell_search,
            shell::shell_hide,
            shell::shell_exit
        ])
        .setup(|app| {
            shell::install(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing hides; explicit exit owns Core shutdown. Never hide
            // the last access point unless its tray was installed.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if window.label() == "overlay" {
                    shell::hide_overlay(window.app_handle());
                    return;
                }
                if window
                    .app_handle()
                    .state::<shell::ShellState>()
                    .tray_ready()
                {
                    let _ = window.hide();
                }
            }
            if matches!(event, WindowEvent::Focused(false)) && window.label() == "overlay" {
                shell::hide_overlay(window.app_handle());
            }
        })
        .build(tauri::generate_context!())
        .expect("could not start Enouia Runtime");
    app.run(|app, event| {
        if let RunEvent::ExitRequested { api, .. } = &event
            && !app.state::<shell::ShellState>().exit_ready()
        {
            api.prevent_exit();
            shell::request_exit(app);
        }
        if let RunEvent::Exit = event {
            app.state::<MemoryHost>().shutdown();
        }
    });
}
