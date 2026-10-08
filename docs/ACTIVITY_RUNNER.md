# Activity one-shot runner

The Windows `enouia-activity.exe` composes collection, merge, generation storage, restricted SSH, and public observation. Each invocation holds one Activity writer lock and exits with one sanitized JSON result. It needs neither the desktop UI nor the Moriium checkout. Scheduler installation, real-tool capability acceptance, isolated receiver acceptance, and production cutover remain later gates.

## Build and configuration

With the pinned Rust 1.98.1 GNU toolchain and cached dependencies:

```powershell
$env:CARGO_NET_OFFLINE = 'true'
cargo build --release -p enouia-activity-runner --bin enouia-activity
```

The executable is `target/release/enouia-activity.exe`. Use the [explicit installation and scheduler tools](ACTIVITY_SCHEDULER.md) to prepare an independent installed directory. The release executable runs without allocating a console; redirected JSON output remains available. It has no runtime npm install or repository-relative data fallback. Select installed `gh`, Codex app-server, Node, Runtime-owned `ccusage@20.0.20`, SSH, and curl paths explicitly; the installer records version probes separately from the runner's file-presence diagnostics. Existing authentication remains with those tools. The current authenticated Codex method and CLI compatibility must be checked separately before operational acceptance.

[The sandbox example](examples/activity-sandbox-config.json) contains fictional paths and a placeholder login. Replace them with selected sandbox paths. `version`, `mode`, and an absolute `dataRoot` are required. Omitted collector objects become failed attempts for their respective sources; malformed collector paths make the configuration invalid. Missing installed collector executables retain that source's old data. Unknown fields, including credential fields, are rejected. Configuration input is capped at 64 KiB and reparse files are rejected.

`deliveryEnabled` defaults to `false`. A `delivery` object is required when enabling it. Sandbox public origins are restricted to HTTP loopback; production origins obey the existing observer's HTTPS/loopback validation. The configured SSH alias must independently point to an isolated receiver: the mode label cannot inspect or guarantee SSH routing. Enabling delivery does not constitute migration approval or verify remote high-water. Follow the [migration runbook](ACTIVITY_MIGRATION_v0.3.md) for those gates.

The overall collection/delivery cancellation budget is 1–900 seconds (default 900). Every subprocess retains its existing individual deadline and output cap. Cowork discovery checks the selected normal store, roaming Claude roots, Microsoft Store package roots, and expected-store inventory without retaining raw reports. It walks each root completely up to depth 32 and 50,000 directories and fails the Claude source past either bound rather than skip a store; real Cowork roots also hold deep installed-skill trees. `claude_probe` (a development example) reports discovery and per-store adapter outcomes as codes only for operator capability checks. Hostile concurrent directory replacement and hard bounds on filesystem discovery latency remain outside this evidence.

## Commands

All configuration, data, input, and output paths are absolute. The data root must already exist. `sync` does not silently create or reset missing state.

```text
enouia-activity diagnostics --config PATH
enouia-activity overview --config PATH
enouia-activity preview --config PATH
enouia-activity sync --config PATH
enouia-activity retry-pending --config PATH
enouia-activity set-paused true|false --config PATH
enouia-activity migration-inspect --input COPIED_TRIO --output NEW_REPORT [--against BASELINE_TRIO]
enouia-activity migration-import --bundle COPIED_TRIO --config PATH --high-water N [--verified-unused true]
enouia-activity migration-export-legacy --config PATH --output NEW_DIRECTORY
```

`diagnostics` reports pause, pending sequence/hash/age/retry state, delivery configuration, and tool-file presence. Presence is not a capability or authentication claim. Diagnostics never collects, sends, or probes authenticated tools. It acquires the same lock for a consistent view; a busy store returns code 3.

`overview` and `preview` are the local surface's reads. They print the Activity IPC v1 `activity_overview` and `activity_public_preview` DTOs (see the [contract agreement](CONTRACT_BOUNDARIES_M0.md)). They read `CURRENT` once without the writer lock, so a running sync is neither blocked nor made busy, and they write nothing. The overview gives per-source totals, date range, last success, the last attempt and result, freshness against the three-hour window, pending and publication state, and health components. Preview is the exact allowlisted data the next send carries, with its public SHA-256. A missing or invalid store returns code 6 with a structured `storage_failed` error.

`sync` audits recovery first. Pause ends the invocation. Existing pending blocks new collection: the runner first tries to observe its publication, even during a persisted retry wait. If unresolved and due, it sends the original bytes once. `retry-pending` supplies manual retry intent, bypassing only the wait; it never collects and still respects pause and locking. A resolved old pending ends that invocation, so the next invocation performs any new collection.

With no pending, `sync` collects three source attempts under one UTC attempt timestamp, merges history, checks failure retention and public publishability, and durably commits `highestReserved + 1` before transport. A batch over 4 MiB is rejected without truncating history or reserving a sequence. With delivery disabled, the new pending is retained and the invocation ends at code 4; subsequent collection remains blocked by that pending.

SSH exit zero means only `transportCompleted`. When publication is observed and pending is cleared, `delivery.json` also keeps that batch's per-source outcomes and the local observation time as `lastOutcomes`. Status readers use them for the last attempt after pending is gone; delivery decisions never read them, and older runners ignore the key. Publication requires matching exact public data and all three source outcomes. After one send, observation polls at five-second spacing for at most the configured 1–60 seconds, sharing that budget across both HTTP fetches. `observationSeconds: 0` performs one bounded probe without a polling loop. If publication remains unresolved, the runner records failure count, sanitized error, transport time, and the next eligibility time (default one hour; configurable 1–86400 seconds). It never sends twice in one invocation. Missing transport configuration/capability returns code 5 and keeps pending.

`migration-inspect` validates a quiescent copied trio, records raw and canonical hashes plus source time/date-count/total/range inventory, and optionally compares it against another validated trio. `unpublishableSuccessTimes` lists sources whose retained `updatedAt` is valid ActivityData but not the manifest's exact UTC millisecond form, without changing the string. Comparison lists date gaps, value corrections, success-time regressions, source hashes, and reconciliation flags; it chooses no winner. The new report must be outside the input directory and cannot replace an existing file.

`migration-import` requires an explicit reconciled high-water covering known local/receiver/publisher state. It bootstraps only an unused root, preserves exact pending bytes and successful history, and persists pause. Zero requires verified unused identity and empty archive constraints. A seed with any unpublishable success time is refused as `unpublishable_history` (code 6) before any write; reconcile a reviewed copy rather than letting Runtime restamp it. Interrupted bootstrap remnants block a repeat import for explicit reconciliation. `migration-export-legacy` exports the current audited archive/high-water/pending trio to a new separate directory. These three commands never upload or collect.

## Results and exit categories

Run JSON separates `collectionAttempted`, `sourceFailures`, `transportAttempted`, `transportCompleted`, and `publicationObserved`; failed source counts describe the pending batch being processed, including retries. The summary includes sequence, next eligibility, and stable errors without raw process output, private paths, or credentials. Cancellation before commit abandons the candidate; cancellation after commit retains pending.

| Code | Meaning |
|---|---|
| 0 | Operation completed or no pending to retry |
| 2 | Publication observed for a batch containing source failures |
| 3 | Busy, paused, not due, or cancelled; inspect JSON state |
| 4 | Pending delivery unresolved or delivery disabled |
| 5 | Invalid arguments/configuration or missing transport prerequisite |
| 6 | Storage, clock, migration integrity, or contract failure |

This runner never registers scheduled tasks, activates production automatically, installs collector packages, copies authentication, or prunes generations. Retained generations and pending data follow the existing v0.3 recovery and migration rules. See [runner validation](validation/B3.1-runner.md) for the tested scope.
