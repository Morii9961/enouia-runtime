# Tray and explicit exit — local evidence

Follow-up: [Quick Search validation](Quick-search-v1.md) records the later hotkey/overlay slice and expanded native regression. This report retains the tray baseline.

Date: 2026-10-05. Baseline: `66fd99b`. Scope: Runtime's Windows host lifecycle, on one development host with a fresh synthetic Vault.

The native tray offers Show, Lock Memory Vault and Exit. Closing hides the existing window without constructing another Core or releasing its Vault. Settings exposes tray status and explicit Exit. Shutdown runs in a worker, closes admission to new work and waits for the Core before process exit; status and progress can still answer. Canonical commits share the lifecycle gate with operation starts. Only the native main window can invoke host lifecycle commands. Native tray locking uses the same gate as page locking.

The Memory revision, contract, lockfile and domain sources remain unchanged. No personal Vault, migration, Activity scheduler, account, cloud service or installer was used. The tray uses Tauri's installed 2.12.0 API and its [official system tray guidance](https://v2.tauri.app/learn/system-tray/).

| Check | Result |
|---|---|
| Full frontend type checking and React/client tests | Pass; 13 tests |
| Desktop formatting, offline locked tests, Clippy with warnings denied | Pass; 13 host unit tests and 3 pinned-Core integration tests |
| Embedded-assets Windows GNU release | Pass; no installer |
| Locked desktop metadata and domain guard | Pass; 7 Memory packages and 7 negative checks |
| Memory pin/surface checker with self-test | Pass; 8 negative checks |
| Real release `memory-smoke.mjs` | 32/32 pass; seven screenshots |

The native smoke adds installed tray status, close-to-hide, Core access while hidden, restoring the same window and Settings Exit with process exit code zero to the existing review/import/Context/index/lock/security/restart checks. Shutdown refusal, scope and shared admission are also exercised by unit tests. Machine reports and screenshots stay in the temporary synthetic test directory. The Settings screenshot was inspected; the Exit control reuses the existing Memory button style.

Release executable SHA-256: `77a8f0cd27d51e349da302165d227589f9d895274a54960356235c37b6b75135`.

This does not prove physical tray menu interaction, Narrator, contrast themes, installed artifacts or exit/lock during a real long verify/backup. Those remain acceptance gates. Global hotkey/overlay and login startup remain separate slices. Frontend builds and native acceptance ran outside the restricted execution sandbox.
