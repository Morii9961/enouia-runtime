# Global hotkey and Quick Search — local evidence

Date: 2026-10-05. Baseline: `2d7ee3c`. Scope: Runtime's Windows companion, on one development host with synthetic Vaults only.

Ctrl+Alt+M opens a separate hidden native window that calls only the pinned Core's `memory_search`. The main-only picker and lifecycle commands remain outside its capabilities, and request fields cannot impersonate another window. Results are text snippets, limited to eight current matches. Escape, blur, close, returning to main, Vault transitions and exit clear the page and invalidate delayed results. Settings and the tray provide manual opening when the shortcut conflicts. Invalid overrides remain unavailable rather than silently selecting another shortcut.

The hotkey is registered on an owned Windows message thread. Queue creation precedes its readiness handshake, and shutdown unregisters the shortcut on that same thread and joins it off the UI thread. Vault transitions have counted admission so queued changes keep search closed. Memory's exact revision and contract remain unchanged. The only lockfile change adds a direct edge to the already resolved `windows-sys 0.61.2` package; no version changes or plugin is added.

| Check | Result |
|---|---|
| Full frontend type checking and existing React/client suite | Pass; 13 tests |
| Desktop formatting, locked offline tests, Clippy with warnings denied | Pass; 16 host unit tests and 3 pinned-Core integration tests |
| Embedded-assets Windows GNU release | Pass; no installer |
| Locked desktop metadata/domain guard | Pass; 7 Memory packages, 7 negative checks |
| Memory pin/surface checker with self-test and Memory checkout | Pass; 8 negative checks |
| Focused real release Quick Search smoke | 22/22 pass |
| Full real release regression on a fresh synthetic Vault | 55/55 pass; eight screenshots, empty autofill database, persistence and hotkey registration after explicit exit/restart |

The native checks use Windows `SendInput` while the test process is foreground to trigger Ctrl+Alt+Q. They exercise real search, plain text markup, six representative Memory command refusals and four capability refusals, edit/hide invalidation, lock/locked error, return to main, and a second isolated process for conflict plus manual fallback and clean exit. A Rust test rejects every command in the pinned catalog except search for `QuickSearch`. Another test covers multiple queued lifecycle guards. Default M and explicit letter parsing are unit-tested.

Delayed delivery is synthetic: the CDP test defers a real response in Tauri's installed debug callback map, then releases it after editing or hiding. This proves frontend invalidation for that sequence, not arbitrary network or OS timing. Search snippets are intentionally partial; assertions check the query in the snippet rather than assuming the full memory text. The actual Quick Search screenshot was inspected. Reports and screenshots remain in temporary test folders, and remote debugging exists only in the test environment.

Release executable SHA-256: `55bbfc749469d3564468fcf0d7666cb63e9788a27d3c0ca674461f587301b7dc`.

No personal data, production Activity, cloud Provider, migration, login startup or installer was used. Physical tray interaction, long verify/backup shutdown, Narrator, real contrast theme, installed-artifact and remaining W01–W05 paths remain unverified. Builds/native acceptance and the Node checker that spawns Git ran outside the restricted sandbox.

Sources: Memory's reference overlay and host at pinned `a181308b3496c07281c1030cc53b7c9f1bbb7705`, installed Tauri 2.12.0 API, and Microsoft's [RegisterHotKey](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerhotkey), [PostThreadMessage](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-postthreadmessagew), and [SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput) contracts.
