# Activity desktop integration into current Runtime

Date: 2026-10-08. Baseline: `29401fe` from `origin/main`. Branch: `codex/activity-desktop-integration`. This ports Claude's runner read slice (`f90935d`) and native surface (`095b842`) onto the current shell. Later production/discovery changes on the Claude branch are excluded. Scope: [ADR-028](../adr/028-activity-surface.md), a partial J1 integration; no B4 sign-off or B5 activation.

## Result

The native Activity surface reads the selected installed producer through its own runner. Memory stays at revision `ff692ccb6fbc1c387254d5ffbef41b105eeb2a84`; its adapter, frozen Runtime-local Core crates and personal data are unchanged. Browser previews and the Runtime Inspector retain their fictional-data disclosure.

The integration preserves the current strict TypeScript gate and shell lifecycle. It adds local structural reply validation, clears stale values on failed reads, rejects late results after a newer read or package change, keeps Refresh available for recovery, and bounds scheduler queries. A failed task query reports unknown registration. Unobserved next-trigger and local publication-observation times are not fabricated. Future source timestamps cannot count as fresh or zero-age.

## Automated and build evidence

| Check | Fresh result |
|---|---|
| Root `cargo test --workspace --locked` | 217 passed |
| Root fmt and clippy, all targets, locked, warnings denied | Pass |
| Desktop `cargo test --locked` | 31 host tests and 3 pinned-Core tests passed |
| Desktop fmt and clippy, all targets, locked, warnings denied | Pass |
| Desktop `npm test` | 36 passed |
| Default native Memory/shell smoke on the release executable | 101/101 passed, exit 0; earlier failed attempts retained below |
| Desktop `npm run build` | Full strict typecheck and Vite build passed |
| `npm run desktop:bundle` | Embedded release executable and unsigned current-user NSIS installer built |
| Installer template ownership check | 20/20 passed |
| Domain boundary checks | Root: 12 modules, no Memory dependencies, 10 negative checks; desktop: pinned Memory edges, 7 negative checks |
| Memory pin checker with cached pinned checkout and self-test | Pin/surface consistent, 8 negative checks |
| Activity evidence-index self-test | Pass; 7 historical reports, 59 links, 0 signed-off rows, 2 unresolved comparisons; B4/B5 false |

Build identity, SHA-256:

- `enouia-desktop.exe`: `de6f86e5e247e7601c3c93eed0494a9091a10b924b0d1d67531f79e074aaa765`
- `Enouia Runtime_0.1.0_x64-setup.exe`: `7b8f739b32bf20a5532a3bbc31421a2038b1da5b4f887cef7a5ecbdded11505a`
- Package runner `enouia-activity.exe`: `bc2ebbadb4626fca5fa3bffd373a7303562fadf3d50de6900ef181d7eebb6d80`

## Native Activity drill

The release executable passed **29/29** checks in `apps/desktop/e2e/activity-smoke.mjs`; the sanitized machine report is [activity-integration-smoke.json](J1/activity-integration-smoke.json). The package was prepared by `scripts/prepare-activity-surface-sandbox.mjs` using synthetic three-source history, copied read-only Moriium reference receiver/publisher files and loopback HTTP/SSH stand-ins. The package begins at observed sequence 87.

- Native folder selection validates the package and saves the choice only to the test's `--activity-settings` file. Paths do not reach the page.
- Overview, preview hash, source totals/calendars and day filtering use the real adapter and installed runner. Invalid extra fields, sources and operations are refused. Scheduler-query failure stays unknown; the page offers the current-surface skip link.
- Controlled callback delivery holds one real overview, delivers a newer read error and releases the old response. Old cards stay cleared and Run now stays disabled. Refresh remains usable and recovers from real runner reads.
- A native folder picker creates an empty synthetic Vault through the pinned Core. A real `remember` saves a candidate. A deliberately malformed Activity overview is rejected locally; the Memory page and real `candidate_list` still return that candidate. Faults and timing in this paragraph are injected into reply delivery, not real storage damage.
- Pause/resume change only the producer's durable state. A collector-less run commits sequence 88 as pending, retains historical totals/success times and shows source failure distinctly.
- Terminating the shell during retry leaves a valid store with the same pending sequence and exact hash. Restart reads that pending batch; Change package clears the isolated choice.

Screenshots of observed publication and retained pending were inspected. All package/store/Vault/profile outputs are synthetic temporary data. No scheduled task was registered, no personal Vault was opened, no account was collected, no production delivery was performed, and the default saved package choice was untouched.

## Memory and shell regression observations

The default Memory smoke also isolates Activity selection with `--activity-settings` and now expects the native connection gate instead of the obsolete fictional timeline. The first attempt reached 33/35 before a real hotkey failed to show the overlay; the second reached 63/64, with its earlier hotkey step passing, then refused a second key send because the test process was not foreground. Both failure reports remain in temporary `enouia-memory-integration-20261008-a` / `-b` directories. No input was sent to an unrelated foreground process.

The harness now waits up to five seconds for Windows foreground ownership after the native show/focus request, then checks ownership again immediately before sending. This changes an acceptance prerequisite only; the application hotkey, clearing behavior and permissions are unchanged. These observations do not establish a product root cause or universal hotkey timing reliability; earlier intermittent observations are recorded in [native window evidence](Native-window-v1.md).

The final fresh default run passes **101/101**, exit code 0, with artifacts in temporary `enouia-memory-integration-20261008-c/report`. It covers real synthetic review/import/cancellation/resume/Mock/Context operations, the native Activity connection gate, guarded Windows hotkeys, three repeated search openings, tray hide/show, locked and occupied-root refusals, startup-value readback without changes, clean explicit exit, zero autofill rows, restart persistence and a cooperative Restart Manager shutdown. This is the default script's coverage, not every focused mode or complete W01–W05 acceptance. Final shell/Quick Search screenshots were inspected.

## Remaining acceptance

An actual scheduled run with the UI closed, authenticated collectors, real SSH/public production observation, B4 comparison/migration sign-off, code signing, Narrator and a complete keyboard-only Activity workflow remain unverified. The unsigned installer was built and statically checked; this slice did not install it or repeat upgrade/uninstall drills. Historical evidence in [J1-activity-surface.md](J1-activity-surface.md) applies only to its original Claude baseline.
