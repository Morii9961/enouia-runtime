# Independent starmap measurement shell

This is a synthetic browser harness, not Runtime integration. It imports no Memory or Runtime crates, registers no commands/plugins/tray/hotkeys and grants no capabilities. Its only page is the supplied loopback `/starmap.html`; the driver creates a fresh profile and checks the CDP listener's ancestry and the native window's HWND/PID/title before resizing that window. The `tray-icon` compilation feature matches the desktop's cached Tauri build; no tray is created.

From `apps/desktop`, with the existing Windows UCRT64/Cargo toolchain on PATH:

```powershell
cargo build --release --offline --manifest-path e2e/starmap-webview2/Cargo.toml --target-dir src-tauri/target
node e2e/starmap-diagnostics.mjs src-tauri/target/release/enouia-starmap-measurement.exe target/starmap-webview2-YYYYMMDD --motion --webview2
node e2e/starmap-diagnostics.mjs '<msedge.exe>' target/starmap-edge-YYYYMMDD --motion --static
```

The shell pins Tauri 2.12.0 / tauri-build 2.7.0. Its generated lockfile is local evidence, separate from the production desktop lockfile; future transitive resolution can differ. Save it with each measurement's logs. Both commands build only the fictional starmap page into their ignored output directory. Run the two sampling commands sequentially, with no concurrent build/test jobs. WebView2 uses actual Windows DPI at a requested 1440×900 logical client area; headless Edge emulates 1440×900 at DPR 1.5. Read the report's physical bounds and DPR before comparing.

Motion uses owned-page DOM keyboard events and Reset view, never OS hotkeys. The six samples cover Sphere/Theme clusters × idle/motion/restored at 5,000 fictional records. Intervals measure draw calls, not displayed frames. Sampling wraps timing/stroke observations without omitting drawing calls; it does not implement or choose another visual strategy. Pause/minimize/other sizes and real Memory data are outside this drill.
