#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Enouia Runtime's Windows shell. It hosts Enouia Memory's local client
//! through the Memory adapter (ADR-025) and the companion shell (ADR-026):
//! tray, quick search and opt-in login startup. Closing a window hides it;
//! Exit is explicit and shuts the Memory Core down first, as does the end of
//! the Windows session or an installer's request to close (ADR-027). It registers no
//! filesystem, shell, network, provider or Activity command, and it never
//! pauses the independently installed Activity producer.

mod companion;
mod hotkey;
mod memory;
mod root_lease;
mod shell;
mod startup;

use memory::MemoryHost;
use tauri::{Manager, RunEvent, WindowEvent};

fn main() {
    let host = MemoryHost::new();
    let args: Vec<String> = std::env::args().collect();
    let autostart = args.iter().any(|arg| arg == "--autostart");
    if !autostart && let Some(root) = memory::vault_argument(&args) {
        host.open_root(&root);
    }
    let mut context = tauri::generate_context!();
    // Login startup (`--autostart`) starts in the tray: the main window is
    // hidden before it is created, and no Vault is opened.
    if autostart {
        for window in &mut context.config_mut().app.windows {
            if window.label == "main" {
                window.visible = false;
            }
        }
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
            shell::shell_exit,
            companion::show_main,
            companion::hide_window,
            companion::exit_app,
            companion::startup_status,
            companion::startup_set
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
        .build(context)
        .expect("could not start Enouia Runtime");
    // Every way the event loop ends reaches here: Exit, and WM_ENDSESSION at
    // sign-out, shutdown or an installer's Restart Manager request, which tao
    // turns into `RunEvent::Exit` before it ends the process (ADR-027).
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
