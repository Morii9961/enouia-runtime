# AI Usage Ledger U1 — manual desktop delivery

2026-10-22, Asia/Shanghai. Morii explicitly selected “同时加入桌面手动操作页面” and asked to finish this portion before stopping. This completes the local manual desktop continuation of R0–R3 and [U1 runner support](AI-usage-ledger-U1-backend.md); it does not activate production collection or constitute personal-data acceptance.

## Delivered behavior

Activity now contains the existing public view and an on-demand private Usage view. The private flow selects a separate program package, opens/creates an external private ledger, selects Codex/Claude roots, scans manually, displays exact counts and coverage, pages through conflicts, inspects count-only evidence, requires acknowledgment for a signed current-evidence correction/exclusion, and exports a new aggregate JSON file. Replay does not rescan. Unknown counts stay unknown; reasoning remains a subset. The persistent notice explains dataset-wide unallocated facts and the absence of reliable daily attribution. Browser preview is disconnected and never invents backend facts.

The native channel has typed opaque picker bindings, main-window-only permissions, a single-operation gate, a closed stdin request, a 64 KiB request cap, a 256 KiB reply cap and a 150-second host deadline. It rechecks the selected unsigned package's manifest/hash and pins its local normal directories/executable. This is consistency checking, not signing. Only closed typed replies and finite errors reach the page. A process exit with an inherited pipe still open cannot force an unbounded worker join; cancellation/timeout/error returns without joining unfinished pipe workers. Such an untrusted program's inherited-pipe worker may outlive the request until its pipe closes; the owner must select a trusted build. This host does not sandbox arbitrary executables or promise descendant-process termination. The delivered Usage executable does not spawn descendants.

Stopping kills only the owned Usage child and preserves prior committed facts. Explicit application exit closes admission and stops that child before the existing Memory shutdown; close-to-tray retains the existing lifecycle. The private controller survives navigation and performs no automatic reads at mount/startup. The Memory pin remains `a6e4da9958730ac8d7a151ce49c1108ff80f4228`; no Memory adapter/domain, Activity producer, dependency manifest or lockfile changed.

## Checks actually run

| Check | Observed result |
| --- | --- |
| Independent Usage backend suite | 27 pass, 3 deliberately ignored special entry points; recorded at backend commit `728fbd9`. |
| New public-source adapter comparison | 2 focused tests pass; strict all-target Usage Clippy and formatting pass. No production adapter change. |
| Desktop native default tests | 69 unit tests plus 8 pinned-Core rendered-field tests pass; the explicit process fixture is ignored by default. |
| Final closed native reply test | 1 additional focused test passes: rejects nested extra fields, arbitrary errors/timestamps, wrong source and raw cursors; replaces arbitrary notice text. |
| Actual manual runner native fixture | Pass, including a final rerun after deadline handling: native package grants → real subprocess init/scan/export, 100,000-line cancellation with retained prior revision, and tampered manifest refusal. Entirely owned synthetic directories. |
| Desktop `cargo fmt` / strict all-target Clippy | Pass on final native code. |
| `npm test` | 123 Node tests pass, including 4 new Usage client tests; all 69 registered DOM journeys pass, 924 assertions at that run. |
| Final pending-cancellation component refinement | Focused `usage-manual` journey passes 17/17 assertions after that full run; previous full run contained 16 Usage assertions. No claim that the entire DOM suite was rerun after this refinement. |
| TypeScript / frontend production build | Pass, including the final bundle's build; Usage view is a separate lazy chunk. Existing main chunk remains 523.09 kB with Vite's size advisory. |
| Native executable / current-user NSIS build | Both pass. Final `npm run desktop:bundle` completes with a 9.38 MiB installer; installer is not executed. |
| Root / desktop domain guards | Pass with 14 / 7 negative cases, respectively; desktop still imports no Runtime domain crate. |
| `check-memory-integration.mjs --self-test` | Pass, 8 negative cases, unchanged exact Memory pin. |
| Real browser preview | Activity → private Usage renders at default width and 1100×700; document width equals viewport width, no horizontal overflowing elements. Disconnected browser controls are disabled. |
| Portable Usage package | New package script creates manifest/executable/standalone Chinese README; copied CLI `help` succeeds from an unrelated working directory with only Windows system paths. |

Local ignored logs retain the earlier complete frontend/native runs. Initial offline npm installation failed for a missing cached `ws@8.22.0`; normal installation succeeded without lockfile changes. An initial NSIS download failed DNS resolution; the permitted retry and final bundle succeeded. An early synthetic native test tried changing a recently executed image and hit Windows sharing error 32; the fixture instead changes the manifest's expected hash and passes. One last check request previously could not run because automatic approval reported account quota; the checks listed above subsequently ran successfully. These failed attempts are not counted as passes.

## Public-format evidence and limits

The two unchanged public reporting fixtures and MIT license under `crates/enouia-usage/tests/fixtures/ccusage-v20.0.20/` are pinned to `ccusage/ccusage@bd7f89b469aee5635fb2e6722dd6d70f2d113ac1`. These are upstream fictional test samples, not actual personal logs. Source URLs are in their README.

The Claude sample omits top-level assistant type, so the adapter skips it unchanged. With an explicitly synthetic assistant-type augmentation, its existing message/request identity and ordinary/read/write/output counts yield the expected exact values, missing duration remains unknown, duplicate copies deduplicate and source prices/fast-speed labels/IDs are absent from facts. The Codex sample lacks session metadata and contains totals that add reasoning twice; unchanged input is refused and its counters fail conservation. No missing identity or total is silently repaired. This checks public shapes and records incompatibilities; it does not prove all real historical logs are supported. R1 separately records the pinned official Codex protocol source review.

## Local artifacts

Portable folder: ignored `target/Usage-Desktop-20261022/`, containing the final desktop executable, same-build `WebView2Loader.dll`, standalone instructions and a `Usage/` subfolder with independent runner and manifest. The application requires an available Windows WebView2 Runtime. No application process was launched against personal settings during this delivery. The unsigned NSIS installer remains under the desktop target bundle directory.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `enouia-desktop.exe` | 54,972,002 | `54c65705c1bf1334fa473a031d86012ba09a680db53fca20ad2471b801dc963d` |
| `WebView2Loader.dll` | 160,880 | `86545b66cdb0603bc26b626fb9ad610cb6e71f28d468f5ea66df23b03dda96d5` |
| `Usage/enouia-usage.exe` | 5,040,439 | `35f68197a7c6a2a110e9caa130c6116257128f154936221b9904e2563ec401f1` |
| `Usage/usage-package.json` | 196 | `2302593dbd5fdefc1ebb575638c0a2980c20368ca1d5756a67c529598ecd446a` |
| `Enouia Runtime_0.1.0_x64-setup.exe` | 9,831,691 | `f4b41cf4f0d6d0ed4aaf1c184e581d63d8fb7d9d975884c9ecc733c515841ade` |

Physical native picker interaction, installed upgrade/uninstall behavior, Narrator/DPI coverage, personal history reconciliation and physical power-loss recovery were not run. No personal logs/Vault/credentials were read, no Provider called, no task/watch/upload/pricing/VPS enabled, and no PR merged. Dashboard's merged manual-import contract remains version 1.1 at `b66a472d04da3f7767dc5ba747ba1d5b9c494a9d`. Personal sample acceptance remains a separate explicit owner action.
