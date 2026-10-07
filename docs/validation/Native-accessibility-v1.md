# Native accessibility names and keyboard entry — 2026-10-07

Runtime now offers a keyboard entry that skips the window controls and primary navigation, names the current main content, and distinguishes saved session branches in the Windows accessibility tree. Baseline: main `dc154443e9431f548de3881a550a38ff22fcec52`, executable SHA-256 `2aa9d860f3c87eadc5312824f486f9f7178611e63d111bc7d6f18e9f1d534223`.

## Observed issues and fixes

- `apps/desktop/src/App.tsx:353` — first Tab previously reached an icon-only window-control button, before the navigation. The new first link, “Skip to current surface”, becomes visible with focus and moves focus into the actual main element. The next Tab reaches a surface control. It does not change routes or submit any action.
- `apps/desktop/src/App.tsx:543` — the seven main landmarks now have page-specific names, such as “Home content” and “Memory Vault content”. Windows UI Automation exposes these as named groups with the `runtime-content` identifier. Their negative tab index permits deliberate focus without inserting another stop in the ordinary tab order.
- `apps/desktop/src/memory/SessionsSurface.tsx:91` — two actual saved sessions created in the same minute both had the native button name `2026-10-07 15:01 0 events`. Their accessible names now include their saved session and branch identifiers, date and event count; the original full identifiers remain in the tooltip. No session data is changed or renamed in Core.
- `apps/desktop/src/quiet-runtime.css:8` — the skip link uses the existing palette, stays outside the native drag region, and appears only while focused. The ordinary view and seven surfaces retain their layout.

The relevant naming, semantic HTML, focus and skip-link rules were checked against the [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md). The probe reads properties supplied by the actual Windows provider, as described in [Microsoft's UI Automation properties overview](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-propertiesoverview). Provider values are evidence about the accessibility tree, not proof of what Narrator speaks.

## Native evidence

`memory-smoke.mjs --accessibility-only` uses a dedicated fresh temporary synthetic Vault, checks that it starts without memories or sessions, and launches its own release process with an isolated WebView2 profile. CDP checks listener ancestry. UI Automation reads only below the main HWND whose Win32 title and process identity match that owned live child; it never starts Narrator, searches other application windows or changes Windows settings.

The probe waits for actual provider controls because the first read can precede WebView2 accessibility activation. Its child process emits UTF-8 so Unicode names and identifiers survive exactly. Synthetic fixture writes are sequential and their Core results are checked; no operation result or accessibility name is invented.

The baseline complete probe passed **13/23**, exit 1, reproducing missing page-specific landmark names, missing keyboard bypass and indistinguishable session names. The final probe passes **29/29**, exit 0, with 14 native UI Automation captures. It checks:

- Enabled focusable native form/action controls have names on each of the seven surfaces.
- Each main content name appears in both the DOM and the actual Windows provider.
- First Tab reaches the skip link; it is visible, within the viewport, has an outline and has native hyperlink focus/name. Enter moves focus into Home content; the next Tab reaches a real Home button and native focus agrees.
- Two real saved session rows have distinct names that identify their saved branches.
- The actual question, checkpoint, Context preview and Memory input controls have native names.
- A real review plan has its named confirmation button and heading. While it is modal, the background skip link is withheld from enabled focusable native hyperlinks. Escape cancels without approving a memory, then the owned host exits 0.

The native skip-link screenshot was inspected: the link and focus outline are visible, and the ordinary content remains in place. Its link covers part of the titlebar only while deliberately focused, then disappears when focus enters the surface.

## Checks

| Check | Result |
|---|---|
| Native names/focus/review probe | 29/29, exit 0 |
| Fresh full native regression | 101/101, exit 0 |
| Frontend strict check, production build and tests | Pass; 24/24 tests, including all seven rendered landmark names and the skip target |
| Rust formatting, locked tests and Clippy with warnings denied | Pass; 24 host tests and 3 pinned-Core integration tests |
| Memory pin/self-test and pinned surface comparison | Pass; 8 negative checks; unchanged revision |
| Locked desktop domain boundary | Pass; 7 pinned Memory packages and 7 negative checks |
| Unsigned x64 NSIS bundle generation | Pass; approximately 7.19 MiB |
| Installer ownership checks, including rendered template | 26/26 |
| Harness syntax and diff checks | Pass |

Release executable SHA-256: `665dd51adf2b57f954df746bab7f197add6c029b82d82a06fa4d7c8516aec0bb`. Installer SHA-256: `86ea9ee1216d2cf5378a40566512b52afeb589633d285bd5812aba03f598e871`. Memory remains pinned to `ff692ccb6fbc1c387254d5ffbef41b105eeb2a84`, surface aggregate `c49bbaa9f82c21a812a34a247e4a5595cd51707ab406bb8205444f8259a17212`.

Reports, native tree captures and screenshots remain outside Git under `%TEMP%`:

- `enouia-runtime-native-accessibility-baseline-v2-20261007-01a10b3a/smoke`
- `enouia-runtime-native-accessibility-final-20261007-01a10b3a/smoke`
- `enouia-runtime-native-accessibility-regression-20261007-01a10b3a/smoke`

For reproduction, initialize an empty temporary `vault` directory through the pinned Core CLI, inside a fixture root whose name starts `enouia-runtime-native-accessibility-`. Pass the release executable, Vault, an unused synthetic import path and a fresh output directory directly beneath that root to the smoke harness, followed by `--accessibility-only`. The fixture's two sessions and one review candidate are actual Core records, solely for this probe.

## Limits

This is Windows UI Automation property inspection and keyboard behavior in an owned WebView2 page. It is not an actual Narrator reading session, speech/event-order verification, a complete keyboard-only task journey, a real contrast-theme test, a physical tray-menu drill, installed-artifact acceptance or a monitor/DPI matrix. Native control naming passes only for the controls/states exercised here, including the populated session and review states; it does not prove every future record or dialog state.

No personal Vault, real export, migration, live Provider, cloud stage, production Activity, real startup change or owner's installed application was used. The existing [long-work lifecycle report](Long-operation-lifecycle-v1.md) retains its separately verified workload and executable. The full regression preserves the native hotkey, window-scope, lock/exit, startup-read-only, restart and owned-process session-end checks; it does not rerun every historical focused mode.
