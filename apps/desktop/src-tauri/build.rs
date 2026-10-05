fn main() {
    // Only the app's own commands exist; no plugin is registered. Declaring
    // them makes every command need an explicit capability grant.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "memory_call",
            "memory_pick",
            "show_main",
            "hide_window",
            "exit_app",
            "startup_status",
            "startup_set",
        ]),
    ))
    .expect("tauri build");
}
