# Installer ownership boundary

Runtime's current-user installer ([ADR-027](../../../../docs/adr/027-desktop-installer.md)) follows Enouia Memory's reference installer.

## Template

`installer.nsi` is a byte-identical copy of Enouia Memory's `apps/workspace/src-tauri/windows/installer.nsi`, last changed in Memory commit `bdceb41`. Its SHA-256 is `F067BB1C4801A55B70D0B88BD30589D75F511874E768A0C3F7406A82B159F365`.

That file is derived from the MIT-licensed [Tauri CLI 2.12.0 template](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.12.0/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi). The unmodified upstream source has SHA-256 `DABED59013B1D78B879A1A85BC7F2EED2993B33A9A90CDABE5946DE3D3950597`. Its license is retained in `installer-LICENSE-MIT.txt`.

Two sections are removed. Nothing else in upstream's behavior changes:

- **The "delete app data" checkbox** on the uninstall confirmation page, with its callbacks. Vault and backup locations are chosen by the owner and may sit inside a folder the generic template treats as application data.
- **Two deletions in the uninstall section:**
  - the generic product-name Run value;
  - the recursive deletion of `%APPDATA%` and `%LOCALAPPDATA%\com.enouia.runtime`.

  `hooks.nsh` alone clears Runtime's fixed startup value, only when its command matches exactly. Like upstream's deletion, it runs at the end of the uninstall section, after the running-app check and not in update mode, so a cancelled uninstall keeps the value. Uninstall removes application files. Deleting Memory data remains a reviewed Core operation. The WebView2 profile and Activity data are left in place.

Upstream's own installer and uninstaller pages, application file handling, installation registration, shortcuts, language support and WebView2 installation remain in place.

## Hooks

`hooks.nsh` is Runtime's own:

- **For every file:** `AllowSkipFiles off`, so a file that cannot be replaced fails the install (exit code 2, nothing registered). NSIS's default skips it silently and registers the new version over the old files.
- **Before install:** it refuses to replace a newer or unrecognized registered version. The template's silent mode skips its own downgrade check.
- **After the uninstall has removed the app:** outside update mode, it removes `HKCU\…\Run\EnouiaRuntime` only when the value is exactly `"$INSTDIR\enouia-desktop.exe" --autostart`.

The template closes a running Runtime through Restart Manager. Its `WM_ENDSESSION` ends Runtime's event loop through `RunEvent::Exit`, which runs the Memory shutdown before the process exits.

## Changing the template or hooks

When Memory's reference installer changes, its RUNTIME.md log records it. To adopt the change:

1. Copy the file again and update the hash above and in `scripts/desktop-installer/template-check.ps1`.
2. Run that check.
3. Build the actual installer and rerun the installation, upgrade, version-guard, startup-cleanup and locked-file drills in `scripts/desktop-installer/`.

Keep generated paths, local registry data and built installers out of Git.
