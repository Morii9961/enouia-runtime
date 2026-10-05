fn main() {
    // Only the app's own commands exist; no plugin is registered. Declaring
    // them makes every command need an explicit capability grant.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "memory_call",
            "memory_pick",
            "shell_status",
            "shell_show",
            "shell_exit",
        ]),
    ))
    .expect("tauri build");
}
