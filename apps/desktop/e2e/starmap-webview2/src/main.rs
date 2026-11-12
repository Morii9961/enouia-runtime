#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Independent browser only: no Runtime/Memory imports, commands or grants.
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let url: tauri::Url = args[1].parse().expect("measurement URL");
    assert!(url.scheme() == "http" && url.host_str() == Some("127.0.0.1"));
    assert!(url.path() == "/starmap.html");
    let profile = std::path::PathBuf::from(&args[2]);
    tauri::Builder::default()
        .setup(move |app| {
            tauri::WebviewWindowBuilder::new(app, "measurement", tauri::WebviewUrl::External(url))
                .title("Enouia starmap measurement")
                .inner_size(1440.0, 900.0)
                .data_directory(profile)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("measurement shell");
}
