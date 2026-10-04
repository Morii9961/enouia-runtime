#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // This shell registers no domain commands, workers, filesystem or network plugins.
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("could not start the Enouia desktop demo");
}
