# ADR-027 — Current-user installer for the desktop shell

Date: 2026-10-06. Status: adopted and implemented. Authority: the owner's request to continue with the next pending step after [ADR-026](026-companion-shell.md); Enouia Memory's reference installer (MV-6 follow-up and upgrade evidence) and ADR-MEM-45.

## Context

ADR-025 and ADR-026 made Runtime the Windows client for Enouia Memory's local part. The installer was the last piece Memory's reference shell still had and Runtime lacked.

**The installer must own only application files.**
- The upstream Tauri template offers to delete `%APPDATA%` and `%LOCALAPPDATA%\<identifier>` on uninstall, and it deletes a generic Run value.
- A Vault, a backup or the WebView2 profile may sit in those places, and Runtime's startup value is one specific command.
- Memory's reference installer already removes both behaviors. It also adds a downgrade guard, because the template's own check is skipped in silent mode.

**Runtime usually stays running.** Closing hides to the tray (ADR-026). The template closes a running app through Windows Restart Manager. Restart Manager, like Windows sign-out and shutdown, sends `WM_ENDSESSION`.
- The pinned tao 0.37.1 handles that message on its event-target window. It ends the event loop, which Tauri reports as `RunEvent::Exit`. Runtime's handler for that event runs the Memory shutdown, and then tao exits with code 0.
- So Runtime is closed through its normal shutdown, not terminated.

**The review and drills of this ADR found two installer defects:**
- *A cancelled uninstall lost the startup setting.* The exact startup cleanup ran before the running-app check, so an uninstall cancelled at that prompt kept the app but lost its opt-in startup value.
- *A failed copy could pass as a successful upgrade.* NSIS's default `AllowSkipFiles on` lets a silent install skip a file it cannot replace, then exit 0 and register the new version over the old files. This happened when an upgrade ran while Runtime was still starting and its executable was briefly locked.

Both were fixed first in Memory's reference installer (Memory `bdceb41` and `090a0d1`) and are carried here.

## Decision

1. **Package.**
   - `npm run desktop:bundle` builds a current-user NSIS installer with the pinned Tauri CLI 2.12.0. It offers Simplified Chinese and English and refuses downgrades.
   - `desktop:build` stays the no-installer build.
   - The installer is unsigned. Signing is a separate step.
2. **Template.**
   - `apps/desktop/src-tauri/windows/installer.nsi` is a byte-identical copy of Memory's derived template: upstream without the app-data deletion option and the generic Run-value deletion.
   - [`windows/README.md`](../../apps/desktop/src-tauri/windows/README.md) records the hashes and the Memory commit.
   - `scripts/desktop-installer/template-check.ps1` enforces the copy, the removals and the hook placement.
3. **Hooks.** Runtime's own [`hooks.nsh`](../../apps/desktop/src-tauri/windows/hooks.nsh):
   - `AllowSkipFiles off`: a file that cannot be replaced fails the install with exit code 2, before anything is registered.
   - Before install, it refuses a newer or unrecognized registered version.
   - After the uninstall section's running-app check, and outside update mode as upstream does, it removes `HKCU\…\Run\EnouiaRuntime`. It does so only when the value is exactly `"$INSTDIR\enouia-desktop.exe" --autostart`.
   - It never touches Memory's own Run value, a Vault, a backup, the WebView2 profile or Activity.
4. **Session end uses the existing exit path.**
   - Runtime adds no window-message handler. Restart Manager, sign-out and shutdown reach `RunEvent::Exit` through tao, which runs the same Memory shutdown as Exit.
   - The real-app smoke and the upgrade drill verify this with a real Restart Manager request.
   - Restart Manager targets processes by file path, so only the installed copy is closed.
5. **Activity stays separate.** The desktop installer neither installs nor removes the Activity producer, its scheduled task or its data. `scripts/install-activity.ps1` remains its own explicit tool.

## Consequences

- **Owner data is never inferred from a path.**
  - Uninstall leaves Vaults, backups, the WebView2 profile under `%LOCALAPPDATA%\com.enouia.runtime` and Activity data in place. The template check and the template's missing deletions establish this; no drill observes the real profile folder.
  - Deleting Memory data remains a reviewed Core operation.
- **Startup across upgrades.** A silent upgrade keeps the startup value. On the interactive reinstall page, choosing "uninstall before installing" is the default for upgrades. It runs a real uninstall, which removes the value, as upstream does. The owner turns startup on again in Settings.
- **Upgrade right after launch.** An upgrade started in the first seconds after Runtime starts can find its executable still locked. It then fails with exit code 2, leaves the installed version and its registration unchanged, and can simply be rerun.
- **Long work can delay a session end.** Install, upgrade, sign-out and shutdown wait for a running verify or backup, because those cannot be cancelled. Restart Manager forces termination after its timeout, and the Vault's crash safety covers that case.
- **Template changes are routed.** Memory's Runtime surface manifest now lists the reference installer. A change there arrives as a RUNTIME.md log row, and Runtime adopts it by copying again and rerunning the drills.
- **Dev builds are unaffected.** They can run beside an installed copy and are not closed by its installer. A second Core on the same Vault is still refused (ADR-MEM-46).

## Evidence

The [installer validation report](../validation/Desktop-installer-v1.md) covers:

- 25 static ownership checks;
- 7 version-guard cases, 5 startup-cleanup cases and 2 locked-file cases;
- an 8-check install and uninstall drill;
- a 26-check upgrade drill on real packages. It covers:
  - a Restart Manager close of the running, Vault-holding 0.1.0;
  - the drill's own startup value surviving the upgrade and a refused downgrade;
  - removal of that value by uninstall.

The real-app smoke adds a cancelled session end and a Restart Manager close.

Still pending: code signing, an interactive installer run with Narrator, upgrades from a future signed release, and an actual Windows sign-out with Runtime running.
