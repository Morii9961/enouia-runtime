# ADR-026 — Companion shell for Memory's local client

Date: 2026-10-05. Status: adopted and implemented in the desktop shell. Authority: the owner's request to continue the Memory integration after [ADR-025](025-enouia-memory-integration.md); Enouia Memory ADR-MEM-44 (companion shell, four stops) and ADR-MEM-45 (Runtime hosts the local client).

## Context

ADR-025 connected the Memory, Context and Sessions surfaces to the pinned Memory Core. Memory's design and its reference shell also define a companion layer:

- a tray
- a global hotkey that opens a read-only quick search
- opt-in login startup
- "four stops" (close, lock, exit, pause sync) that are different operations

Until Runtime provided these, Runtime and the reference shell each covered part of the local client. One Core per Vault (ADR-MEM-46) means the owner could not run both on the same Vault.

## Decision

1. **Close hides; Exit is explicit.**
   - Closing any window hides it. The Memory Core and its operations keep running, and the tray icon stays.
   - Exit, from the tray or from Settings, takes the lifecycle gate and shuts the Core down. That cancels import and index work, waits for verify or backup, and releases the Vault. Only then does the process end.
   - While the Core shuts down, `workspace_status` reports `companion.exiting`, so every window says that Memory is finishing its operations instead of offering to open a Vault.
   - Neither action pauses or touches the independently installed Activity producer.
2. **Tray.** Left click shows Runtime. The menu has Show, Lock Memory Vault and Exit. Lock runs on a worker thread, never on the event loop.
3. **Global hotkey and quick search.**
   - Ctrl+Alt+M (another letter with `--hotkey-key`) is registered on its own thread. It opens a small always-on-top quick-search window (`overlay`).
   - A combination held by another program is reported in Settings as a conflict, never silently.
   - The window maps to Memory's `HostSurface::QuickSearch`, so its requests are limited to `memory_search`, checked by native window identity.
   - Its capability grants only `memory_call`, `show_main` and `hide_window`. It has no picker, exit, review, write or startup command.
   - Focus clears it; blur and Escape clear it, and Escape hides it. Escape is handled on the whole window, so it works after a click anywhere in it.
  - Every way of showing the main window (tray click, tray menu, quick search's link) hides quick search first.
4. **Opt-in login startup.**
   - Runtime owns one fixed Run value, `HKCU\…\Run\EnouiaRuntime` = `"<Runtime exe>" --autostart`. It is off by default and is switched only from the main window's Settings.
   - Login start shows only the tray, with the main window hidden before creation, and opens no Vault.
   - The page cannot choose the key, the executable or the arguments.
   - A value that belongs to another installation is reported without disclosing its path, and it is never overwritten.
   - Memory's reference shell keeps its own separate value.
5. **Least privilege.**
   - `build.rs` declares exactly `memory_call`, `memory_pick`, `show_main`, `hide_window`, `exit_app`, `startup_status` and `startup_set`.
   - The main window's capability adds `exit_app`, `startup_status` and `startup_set` to window controls and the Memory adapter.
   - Both windows keep the CSP, frozen prototype and disabled autofill of ADR-025.

## Consequences

- Runtime now provides the whole local Memory client except the installer. Memory's reference shell stays Memory's acceptance harness, not something the owner needs alongside Runtime.
- **Closing no longer exits.** An owner who expects close to quit must use Exit. Settings and the Memory Vault page explain the four stops.
- **Hotkey conflicts.** Two Runtime processes, or Runtime and the reference shell, compete for the same hotkey. The second reports a conflict, and the second embedded Core is refused by Memory's host lock.
- **Installer still pending.** `bundle.active` stays false. A current-user installer needs its own ownership rules and a downgrade guard, as Memory's has, and is a separate slice.

## Evidence

The [validation report](../validation/Memory-integration-v1.md) covers this ADR. It includes:

- adapter and companion unit tests: window scope, hotkey letter, startup command and a registry round trip on an isolated test key
- the pinned-Core field tests
- a real-app smoke on synthetic Vaults with:
  - tray-start hidden, and shown again through quick search
  - quick-search scope and denied commands
  - hotkey registration and conflict, the real hotkey opening quick search empty, and Escape hiding and clearing it after focus left the input
  - the startup value written and removed exactly
  - close hides, Exit ends the process
  - one Core per Vault across two processes

Still pending: Narrator and a real contrast theme, an installed artifact, signing, an actual Windows sign-in start, and the tray icon and its menu. No automated run clicks the notification area; the tray's Show and Exit call the same functions the tested paths call, while the tray's Lock runs only from the tray.
