# J1 Activity surface — partial

Date: 2026-10-07. Runtime baseline: `f90935d` plus the desktop slice. Scope: [ADR-028](../adr/028-activity-surface.md). This is local, synthetic evidence for the Activity part of J1. It is not full J1 acceptance and says nothing about live tools, the installed schedule or production delivery.

## What was built

- Runner: lock-free `overview` and `preview` commands emitting Activity IPC v1, and `lastOutcomes` kept at acknowledgment ([runner](../ACTIVITY_RUNNER.md), commit `f90935d`).
- Shell: `src-tauri/src/activity.rs` with `activity_call` and `activity_setup`, granted to the main window only.
- Page: `src/activity/` client, view model and surface, shown only in the native shell.

## Checks

| Check | Result |
|---|---|
| Domain workspace: fmt, `cargo test --workspace --locked`, clippy `-D warnings` | Pass: 219 tests, including the IPC conformance walker, five rejected malformed overviews, lock-free read under a held writer lock, and `lastOutcomes` retention and forgery refusal |
| Desktop Rust: fmt, `cargo test --locked`, clippy `--all-targets -D warnings` | Pass: 18 unit tests (6 new: request shapes, day filtering, task marker and UTF-16 query output, exit-to-stage mapping, manifest and runner-hash checks, scheduler health) and 3 pinned-Core tests |
| Desktop frontend: `npm run check`, `npm test`, `npm run build` | Pass: 20 tests (5 client, 5 view model) |
| `node scripts/check-memory-integration.mjs --self-test`, evidence index self-test, domain boundary check | Pass; Memory pin unchanged |
| Native smoke [`e2e/activity-smoke.mjs`](../../apps/desktop/e2e/activity-smoke.mjs) on the debug shell | 20/20, [report](J1/activity-smoke.json) |

The smoke used a package made by [`prepare-activity-surface-sandbox.mjs`](../../scripts/prepare-activity-surface-sandbox.mjs). That script imports about a year of synthetic three-source history at sequence 87 and delivers it through the marked SSH stand-in to a copied reference receiver and publisher on 127.0.0.1, so the store holds a real observed publication. It writes `install.json` in the installer's format. The real `install-activity.ps1` was not used, because this host has no PowerShell 7.

The smoke drives the real shell over CDP and fills its real folder dialog through UI Automation:

- **A.** Without a package the page shows the connection gate, and IPC answers a structured `unconfigured`.
- **B.** Choosing the folder connects; the page never shows the path; the choice is saved by the shell; the three sources are fresh and their calendars draw.
- **C.** The overview shows the observed publication with no pending; the unregistered task is reported as such with an unavailable scheduler component; the preview hash equals the published hash; day ranges filter; a fourth source, an unknown operation and an extra field are refused.
- **D.** Pause changes the runner's durable state and disables Run now; Resume restores it.
- **E.** Run now (no collectors, SSH stand-in refusing outside its harness) commits sequence 88 with three failed sources and keeps it pending. Totals and last-success times are unchanged and the page says history is retained.
- **F.** The shell is terminated while a retry runs. The installed runner afterwards reads a valid store whose pending exact hash is unchanged, and a restarted shell shows the same pending.
- **G.** Change package forgets the choice.

The shell's saved choice was absent before the run and is removed afterwards. Screenshots were inspected and not committed.

## Not covered

- An installed, registered task running on schedule with the UI closed (C17, B3.2 live scheduler, B5).
- Authenticated collectors, real SSH and the production receiver (O2/O3).
- An Activity fault while Memory is in use. The surfaces share no state, but no combined fault drill was run.
- Narrator, high-contrast themes and a keyboard-only walk-through; buttons, details and tables are native elements.
- Scheduled next-trigger time: the shell reports registration and enablement only, so the page says "Hourly while logged in".
