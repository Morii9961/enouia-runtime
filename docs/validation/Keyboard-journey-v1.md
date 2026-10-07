# Keyboard task journey and session focus — 2026-10-07

Runtime's session composer now receives focus after a successful new session or question submission, and the checkpoint input receives focus after saving its summary. Restoration waits until the actual write and detail reads settle and the inputs are enabled. If focus has moved to another control, it stays there.

The complete baseline probe on main `f00c1a45363b5f502e331bd0291c030b1a6498d8` passed **13/15**, exit 1. After creating a session and sending its question, `document.activeElement` was `BODY`; disabling the submitting controls had blurred them, and the surface did not restore focus. The baseline executable SHA-256 was `665dd51adf2b57f954df746bab7f197add6c029b82d82a06fa4d7c8516aec0bb`. Earlier probe attempts corrected harness Enter-event construction and selected a query with observed local evidence; they are not product-failure baselines.

## Actual task coverage

`memory-smoke.mjs --keyboard-journey-only` launches the release application on a dedicated, initially empty synthetic Vault and uses an isolated WebView2 profile. After initialization, all task actions use CDP keyboard events and text insertion within that owned page. The journey does not click or focus elements through JavaScript, set input values, submit forms directly, or manufacture Core fixture writes. Read-only DOM predicates find when the actual keyboard focus reaches each control, and real Core reads establish the saved results.

The final journey passes **17/17**, exit 0:

- Skip the shell controls into Home, then switch to Memory with Ctrl+2.
- Reach the inbox, enter a statement and topic key, and save one candidate. Verify it is still unapproved.
- Open and read the literal review plan, confirm it, and return to the inbox heading.
- Reach the approved memory, activate it with Space, and open its actual source excerpt.
- Switch to Sessions with Ctrl+4, create a session, and enter the question composer without another navigation circuit.
- Send `Lantern` to the local Mock. Read the saved answer and its approved statement, with focus restored to the question composer.
- Save a checkpoint and return to its input. Confirm it remains a session artifact, without approving another memory.
- Inspect the answer's saved capsule and the hash-checked actual local request, then compile a separate preview with no dispatch and retain query focus.
- Read one actual completed turn, one checkpoint, one session and one approved memory; exit the owned host cleanly.

Seven captures record DOM focus and native UI Automation beneath the exact owned Runtime HWND. At new-session, answer and checkpoint completion, the Windows provider reports focus on the correctly named, enabled `ControlType.Edit`, agreeing with the DOM input. Source and preview screenshots were inspected for visible content and focus cues.

The separate session-write probe passes **21/21**, exit 0. It observes actual Core receipts with controlled delivery timing to check that an acknowledgement respects focus explicitly moved to primary navigation. Its existing retry/draft checks retain their original purpose; controlled delivery is not a storage-error simulation or a natural-duration acceptance claim.

## Build and integration evidence

- Frontend tests: **24/24**; strict TypeScript and production Vite build passed through `desktop:bundle`.
- Rust: formatting, **24** unit tests plus **3** pinned-Core integration tests, and Clippy with warnings denied passed.
- Fresh locked dependency metadata: domain boundaries passed, **7** Memory packages and **7** negative checks.
- Pin verifier: **8** negative checks passed; the committed surface aggregate matches the exact pinned Memory revision `ff692ccb6fbc1c387254d5ffbef41b105eeb2a84`.
- Unsigned current-user NSIS bundle built; static and rendered installer ownership checks passed **26/26**.
- Default native regression: **33/34**, exit 1, on each of two fresh fixtures. Review/source/retry/paging/import cancellation and resume, session/local Mock, Context and overlay command refusals passed before the existing OS hotkey guard stopped the run. No key was sent: the expected Runtime PID was not the Windows foreground PID. The remaining default checks were not reached in these runs; the previous release's 101/101 report is historical evidence, not a current all-pass claim.
- Executable SHA-256: `4421811ca4b9177e2e39174665b3f3fda6d2ee29d80ab399fafc47b6484c253a`.
- Installer SHA-256: `e79589b9d215ea3247edd08b3c77d9a75a2630714b90a7b8007e89a2decc8a4c`.

The immutable Memory pin, adapter, write payloads and backend implementation are unchanged.

## Artifacts and reproduction

All fixture roots are beneath `C:/Users/Morii/AppData/Local/Temp/`:

- `enouia-runtime-keyboard-journey-baseline-v3-20261007-01a10b3a/smoke`: complete 13/15 baseline and focus captures.
- `enouia-runtime-keyboard-journey-final-20261007-01a10b3a/smoke`: 17/17 journey, seven captures and two screenshots.
- `enouia-runtime-keyboard-journey-session-writes-20261007-01a10b3a/smoke`: 21/21 controlled receipt/retry/draft and moved-focus checks.
- `enouia-runtime-keyboard-journey-regression-20261007-01a10b3a/smoke` and `enouia-runtime-keyboard-journey-regression-v2-20261007-01a10b3a/smoke`: 33/34 partial default runs, stopped at guarded OS input.

Focused diagnostics prepared the native input helper before requesting main-window focus, then attempted to activate only the HWND whose PID and title matched the owned host. Windows still retained a different foreground root (`owned child False`), so the helper refused input. These diagnostics are retained in the `keyboard-journey-quick[-v2/-v3]` fixture reports; the experimental helper changes were removed. The final harness retains its original foreground PID gate. The distinction follows [Microsoft's foreground-window rules](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow): activation is restricted and may be denied. No foreground-lock setting, foreign window, or physical input was modified to bypass that refusal.

Create an empty temporary `vault` directory using the CLI built from the pinned Memory revision. Its parent must have a name starting `enouia-runtime-keyboard-journey-`. Pass the release executable, Vault, an unused synthetic import path and a fresh output directory immediately under that fixture root, followed by `--keyboard-journey-only`. The fixture must initially have no sessions, candidates or memories. Do not rerun this fresh-fixture mode against its populated completed Vault.

## Limits

This completes the specified synthetic task journey using keyboard events scoped to WebView2, with native provider focus observations. It does not establish physical keyboard input across the whole journey, Narrator speech or event ordering, a real Windows contrast theme, personal/provider acceptance, installed-artifact behavior, actual sign-in startup or physical tray-menu interaction. It covers these task states, not every error, import, purge or recovery path, and does not complete all W01–W05 acceptance gates. No personal Vault, live Provider, production Activity or Windows accessibility setting was opened or changed.
