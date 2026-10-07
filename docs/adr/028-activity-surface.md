# ADR-028 — Activity surface over the installed runner

Date: 2026-10-07. Status: adopted and implemented. Authority: the owner's 2026-10-07 instruction to continue Activity & Usage work on both backend and frontend; Architecture v0.3 section 13 and the M0 Activity IPC v1 contract.

## Context

Architecture section 13 asks for a dedicated Activity screen with the three source charts, freshness, schedule, pending, transport and publication state, and manual Run now, Retry pending and Pause/Resume that "use the runner and its lock". Until now the desktop showed a fictional event timeline, and the shell registered no Activity command.

The Activity producer is installed separately (B3.2) and runs from Windows Task Scheduler with the UI closed. The shell must not become a second writer, a second store reader with its own version of the format, or a way to change the scheduled task. Activity must stay outside Memory, Context and the Memory adapter.

## Decision

1. **The installed runner is the only path.** The shell calls the selected package's `enouia-activity.exe` as a bounded, windowless subprocess with that package's config. Reads use the runner's new `overview` and `preview` commands. They read `CURRENT` once without the writer lock, so a status refresh never makes a scheduled run busy. `sync`, `retry-pending` and `set-paused` take the runner's own lock exactly as a scheduled run does. The shell never opens the store, links the Activity crates or holds the lock.
2. **One typed command.** `activity_call` accepts exact Activity IPC v1 requests (contracts/ipc/activity-v1.schema.json) from the main window only. Unknown operations, extra fields, unreal or reversed dates and sources other than `github`, `codex` and `claude` return `contract_invalid`. Runner exits map to structured codes, and the page never receives a path, raw report or subprocess text. Run now and Retry pending return a run ID at once and run on a background thread. `activity_get_run` reports `running`, then `completed`, `blocked` or `failed` with the runner's sanitized summary. Only one shell-started mutation runs at a time.
3. **Package selection.** `activity_setup` chooses the package folder through a native dialog, forgets it, or reports it. The shell validates `install.json` (schema, package marker, task name, mode, the exact binary and config paths inside the folder) and the runner's SHA-256. It checks the hash again before every start, so a replaced runner is refused. Only the folder name, mode and task name reach the page. The choice is kept in the app config directory as `activity-install.json`.
4. **Schedule is read-only.** The shell queries the package's task with `schtasks /Query /XML`. A task is the package's only if its registration source equals the package marker. The overview reports whether it is registered and enabled; the shell never registers, enables, disables or runs it.
5. **Store addition.** Acknowledgment keeps the cleared batch's per-source outcomes and local observation time as `lastOutcomes` in `delivery.json`, so the last attempt survives pending clearance. It is validated on read and retained across delivery-only commits; delivery decisions never read it, and older runners ignore it.
6. **IPC v1 additions before the first consumer.** The overview gains optional `generatedAt`, `producer`, `pending` and `schedule.task`; run status gains the `running` stage, `operation` and `summary`. They are recorded in the [contract agreement](../CONTRACT_BOUNDARIES_M0.md).
7. **Surface.** In the native shell the Activity page shows per-source totals (exact decimal strings), recorded-day range, last success and last attempt, freshness against the three-hour window, a 53-week calendar that keeps explicit zeros, unrecorded gaps and the source's possibly incomplete current day distinct, and an accessible table. It shows schedule, delivery, pending, transport and publication separately, plus a read-only public payload preview and a copy of the sanitized overview. It offers no sequence, pending or archive editing and no combined AI total. A production package with delivery enabled asks once inline before Run now. Browser previews keep the fictional timeline.

## Consequences

- Closing or exiting the shell leaves a started run to finish on its own; the runner and its lock decide the outcome. The native smoke terminates the shell mid-run and finds the exact pending bytes intact.
- The UI shows the producer's real state but does not by itself prove the scheduler, live tools or production delivery. Those stay with B4/B5 and their operational gates.
- A package installed by an older runner without `overview` and `preview` reports a structured error; reinstall the package from this revision.
- Memory, Context and the Memory adapter are unchanged. Activity failures stay inside the Activity page.
