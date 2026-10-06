# Desktop installer — local evidence

Date: 2026-10-06. Scope: [ADR-027](../adr/027-desktop-installer.md), Runtime's current-user NSIS installer, and how a running Runtime is closed by Restart Manager.

All data is synthetic and lives in fresh temporary folders outside any Git working tree. No personal Vault, existing installation, foreign login entry or Activity state was used. Reports and built installers stay local and are not committed.

- **The install and upgrade drills** refuse to run when Runtime installation metadata or a Runtime Run value already exists, and the upgrade drill also refuses a running Runtime. The only startup value they write is the upgrade drill's own exact value for its test installation, which is removed afterwards.
- **The template, version-guard, startup-cleanup and locked-file drills** touch only repository files, fresh isolated keys under `HKCU\Software\EnouiaRuntimeTests` and temporary folders.

## Inputs

| Item | Value |
|---|---|
| Runtime | `ef11e51` plus this change; product version 0.1.0, with a test-only 0.1.1 for the upgrade |
| Packaging | `@tauri-apps/cli` 2.12.0, tao 0.37.1, NSIS 3.11 from Tauri's tool cache, `nsis_tauri_utils.dll` SHA-256 `5ba143b5db4a87d32d6e7802e033330aae56cbceabe0d1e3ba41948385ad4709` |
| Template | Copy of Memory's derived template at `bdceb41`. SHA-256 `f067bb1c…f365`; upstream `dabed590…0597`. |
| Synthetic Vaults | Created and verified with the Memory CLI built from Memory `156e172`. Its crates and lockfile are identical to the pinned `ff692cc`. |
| Host | Windows 11, WebView2 Runtime 154.0.4258.53, Rust 1.98.1 `x86_64-pc-windows-gnu` |

## Checks

| Drill | Result |
|---|---|
| `template-check.ps1 -RenderedTemplate <build>\nsis\x64\installer.nsi` | **25/25.** <ul><li>The configured template and hooks are the owned files, and the template equals the recorded copy. The CLI is 2.12.0, the package is current-user NSIS only, and downgrades are disabled.</li><li>There is no app-data deletion option, recursive AppData deletion or generic Run-value deletion, in the source or the rendered template.</li><li>The version guard comes before the running-app check. The startup cleanup comes after the uninstall section's running-app check, in both templates. No pre-uninstall hook remains.</li><li>Payload removal, uninstaller creation and the upstream license are kept.</li><li>The hook's value name and command match `startup.rs` and the Cargo binary. It skips update mode and sets `AllowSkipFiles off`.</li></ul> |
| `version-guard-smoke.ps1` | **7/7.** The production preinstall macro, compiled into tiny installers against an isolated key. <ul><li>Allowed: no previous version, an upgrade, a same-version reinstall, an earlier prerelease.</li><li>Refused, and nothing is written: a downgrade, a malformed version, a newer prerelease.</li></ul> Registers are restored, and the key and its empty parent are removed. |
| `startup-cleanup-smoke.ps1` | **5/5.** The production post-uninstall macro, against an isolated key. <ul><li>The exact `"$INSTDIR\enouia-desktop.exe" --autostart` is removed.</li><li>Kept: a Memory reference-shell value, a foreign Runtime value, a value that differs only by case, and the exact value in update mode.</li></ul> |
| `locked-file-smoke.ps1` | **2/2.** Each tiny installer copies over a locked synthetic file. <ul><li>With the production hooks, it fails (exit code 2) before anything after the copy runs.</li><li>The NSIS-default control skips the file and exits 0. This is the behavior the hooks prevent.</li></ul> |
| `install-smoke.ps1` | **8/8.** A silent install with `/NS` into a fresh path containing spaces. <ul><li>The install exits 0. The payload equals the build byte for byte after Tauri's single bundle-marker change. The registered location is the requested one, and no startup value is written.</li><li>The uninstall exits 0, and the app and its registration are removed.</li><li>A synthetic file outside the app directory is unchanged.</li></ul> |
| `upgrade-smoke.ps1` (0.1.0 → test-only 0.1.1) | **26/26.** Steps and results: <ul><li>A synthetic Vault with an acknowledged source is verified, and 0.1.0 is installed.</li><li>The drill writes its own exact startup value for that installation.</li><li>The installed 0.1.0 starts with `--autostart` (tray only), with a second synthetic Vault open and its host lock held. Start-up is given 5 s to settle.</li><li>The upgrade, run without `/D`, closes it through Restart Manager. The process ends with exit code 0, the code of tao's `WM_ENDSESSION` path after `RunEvent::Exit`; termination would give another code. The lock is then free, and that Vault verifies clean.</li><li>0.1.1 is registered at the same location with its exact payload, and the startup value is kept.</li><li>Reinstalling 0.1.0 is refused, leaving 0.1.1 and the startup value.</li><li>Uninstall removes the app, its registration and exactly that startup value.</li><li>The first Vault keeps every file hash and its commit throughout, and verifies clean at the end.</li></ul> |

The drills also remove the empty `HKCU\Software\enouia` key that NSIS creates for its install-location preference, but only when the drill created it.

**What the drills found.** Two defects were fixed in Memory's reference installer, then here.

- **An upgrade that left the old files.** The first run of the upgrade drill, after the review, upgraded while the just-started app still held its executable. The 0.1.1 installer exited 0 and registered 0.1.1 over the 0.1.0 executable. A standalone NSIS test confirmed the cause: with `AllowSkipFiles on`, a silent `File` onto a locked target is skipped and the install continues. With `AllowSkipFiles off` it aborts with exit code 2.
  - Without the settle pause, two further runs with the final installers gave one normal upgrade and one clean failure. In the failure, exit code 2 left both the files and the registration at 0.1.0.
  - Restart Manager itself returned only after Runtime had exited, and the executable was writable at once.
- **Startup lost on a cancelled uninstall.** The adversarial review found this order defect. The startup cleanup now runs after the running-app check.

**Real-app smoke.** `apps/desktop/e2e/memory-smoke.mjs` passed **59/59** on the release build, including two session-end checks:
- A cancelled session end, sent to every top-level window of the process, leaves Runtime running with the Vault open.
- A Restart Manager close of the executable, made exactly as the installer makes it, ends Runtime with exit code 0.

The harness also picks each window's page by URL before confirming its native label. Before that change, it briefly attached a second DevTools client to the other window, and 3 of 5 runs then failed in the harness: a status read threw, or the first page check timed out. Two of those five runs were instrumented. Every run since the change has passed. A DevTools connection that closes now fails its pending requests instead of hanging the run.

**Code.** These pass:
- in `apps/desktop/src-tauri`: `cargo fmt`, `cargo test --locked` and `cargo clippy --locked --all-targets -- -D warnings`;
- in `apps/desktop`: `npm run check`, `npm test` and `npm run build`.

Runtime adds no session-end code. It relies on tao 0.37.1's handling, which `main.rs` documents.

## Limits

- **Unsigned.** SmartScreen and signing are not exercised.
- **Interactive pages not driven.** The drills run silent installs. Not run: the reinstall page and its default "uninstall before installing" path (which removes the startup value), the language selector, shortcuts, Narrator on the installer, and a manual upgrade.
- **Session end exercised through Restart Manager only.** No actual Windows sign-out or shutdown was performed with Runtime running.
- **Exit code 0 is the evidence of the shutdown path.** The drills observe the exit code, which only tao's `WM_ENDSESSION` path produces after `RunEvent::Exit`. They do not observe a marker written by the Memory shutdown.
- **Long work.** No drill closed Runtime during a verify or backup. Those wait to finish, and Restart Manager may terminate after its timeout.
- **Same source.** Both package versions come from the same source with a test-only version override. This does not prove migration from an earlier data format.
- **WebView2 present.** The host already had WebView2. On a machine without it, the default installer downloads Microsoft's bootstrapper.
