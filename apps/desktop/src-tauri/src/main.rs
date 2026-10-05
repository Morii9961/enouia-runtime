#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Enouia Runtime's Windows shell. It hosts Enouia Memory's local client
//! through the Memory adapter (ADR-025). It registers no filesystem, shell,
//! network, provider or Activity command, and closing it never pauses the
//! independently installed Activity producer.

mod memory;

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
        .invoke_handler(tauri::generate_handler![
            memory::memory_call,
            memory::memory_pick
        ])
        .on_window_event(|window, event| {
            // Keep the window until the Core has finished: shutdown cancels
            // import and index work and waits for verify or backup, which
            // cannot be cancelled. Then the process exits.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app = window.app_handle().clone();
                if app.state::<MemoryHost>().begin_close() {
                    let _ = window.set_title("Enouia Runtime · finishing Memory operations");
                    std::thread::spawn(move || {
                        app.state::<MemoryHost>().shutdown();
                        app.exit(0);
                    });
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("could not start Enouia Runtime");
    app.run(|app, event| {
        if let RunEvent::Exit = event {
            app.state::<MemoryHost>().shutdown();
        }
    });
}
