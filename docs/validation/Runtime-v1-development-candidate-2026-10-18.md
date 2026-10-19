# Runtime v1 development candidate packaging

Date: 2026-10-18 (Asia/Shanghai). Code baseline: `bd592b740ab0cad963d11d83cb18569f3ceaa501` on `codex/provider-settings-status`; Memory pin `56bc5eb8b08fb80cd6df892bf53d200ff23afc4c`. This is a local development candidate, not the final desktop v1 freeze, a published release or Morii acceptance. The original owner edits to `AGENTS.md` and two Activity handoff files remain excluded from the feature commits and do not enter the build.

## Included delivery

| Slice | Repository state at packaging | Evidence |
| --- | --- | --- |
| Native component Inspector and import reports | PR #82 merged into main at `b6d32e5` after explicit owner approval | [Inspector](Runtime-inspector-v1.md), [import](Import-report-v1.md) |
| Verified non-secret model settings drafts | PR #83 open; base retargeted to main after #82 merged | [draft](Provider-config-draft-v1.md) |
| Existing workspace operation observation | PR #84 open, based on #83 | [operations](Workspace-operations-inspector-v1.md) |
| Native draft save without implicit adoption | PR #85 open, based on #84 | [save](Provider-draft-save-v1.md) |
| Loaded model settings and explicit reload in Settings | PR #86 open, based on #85 | [Settings](Provider-settings-status-v1.md) |

The package contains the stacked code through #86. Only #82 is merged. Local test/build success does not approve merging the other PRs or establish human acceptance.

## Package and verification

`npm --prefix apps/desktop run desktop:bundle -- --target x86_64-pc-windows-gnu` completed: production TypeScript/Vite, Windows GNU release build (25.15 seconds) and NSIS packaging. The generated installer and matching payload were copied into a separate local delivery directory with a manifest so subsequent development builds do not replace them. Generated binaries and local paths are not committed.

| Artifact | Bytes | SHA-256 |
| --- | --- | --- |
| `Enouia Runtime_0.1.0_x64-setup.exe` | 9585024 | `82de28366ec2ad4b385f41dad7ed57c9348953950ead9c97608c3e8126f43738` |
| `enouia-desktop.exe` (NSIS-tagged payload) | 53738789 | `cc3e12cd542c4ea78e9394ef05213591c0cd46204fa2a9bec7e32ce5edbf2cd0` |

Authenticode reports `NotSigned`. Product version remains `0.1.0`; this is not a new public version. Tauri explicitly patches the bundle type into the payload, so its hash differs from the earlier no-bundle executable in the Settings report. The source installer template/hooks are unchanged; `template-check.ps1 -RenderedTemplate <generated installer.nsi>` passed all 26 ownership checks against this actual render, including retained data, downgrade ordering and fail-on-locked-file rules.

Current source evidence: 110 Node tests and 64 synthetic DOM journeys (852 assertions), strict fixture typing, pin guard and the Settings build. Unchanged native code/dependencies reuse the 68 unit tests, 6 pinned-Core integration tests, strict Clippy, Rust format and resolved dependency checks from the draft-save slice. Packaging changes no implementation or dependencies; these suites were not repeated merely for the package.

No installer or payload was executed or installed. The existing Runtime process, installation, login setting, personal Vaults, credentials, Activity producer and scheduler remain untouched. Earlier installation/upgrade evidence in [ADR-027's report](Desktop-installer-v1.md) describes its original baseline; it is not a fresh install/upgrade acceptance of this package.

## Remaining route

The first missing functional dependency is [Memory's read-only history-planning host entry](../integration/history-host-request-v1.md). Its subsequent batch/extraction/review slices remain separate. This package does not close that gap or activate MV-8, cloud or generic model tools. Unified acceptance still needs the owner-selected data/Provider workflow and the outstanding Windows/Activity items in [the delivery plan](../RUNTIME_V1_DELIVERY_PLAN.md).
