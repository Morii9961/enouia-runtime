# Core asynchronous jobs v1 — backend design

Date: 2026-10-02. Status: proposed backend worker/status contract; no job runner, IPC, UI or scheduler installed. Authority: [command design](CORE_COMMANDS_v2_DESIGN.md) and [ADR-023](adr/023-command-receipts-and-jobs.md).

## Job ownership and lifetime

Backend jobs are `job_` plus 32 lowercase hex digits and belong to one Core process instance `run_` plus 32 hex digits. Supported design kinds are `index_rebuild`, `context_preview`, and `mock_submission`. Clients supply bounded typed arguments and an action token, not paths/SQL/worker configuration. A process owns a finite bounded queue and emits explicit `busy` on exhaustion; initial limits are four active workers, 32 queued jobs and at most one index rebuild owner per Vault. These are worker limits, not authorization to spawn Codex agents.

The status job is a disposable observation of work. For Mock submission, canonical operation/invocation records own accepted inputs and final outcomes; the job's result references their binding. For index/preview, canonical data never changes merely because a job started. Index rebuild acceptance/retry deduplication is process-local; after restart a new rebuild action is safe because it has no canonical mutation. Do not present an old process token as a resumed live worker.

The [closed job/event shape schema](../contracts/ipc/backend-jobs-v1.schema.json) specifies job/process ID, kind, state, backend start/update times, nullable pinned/current result binding, phase, processed/total counts, event sequence, cancellation capability and nullable operation/invocation/preview references/error code. A successful preview still has only a disposable capsule reference; it proves no durable invocation. No raw paths, queries, memory text, capsule contents or exception dumps appear in status/exported events. Detailed private content is fetched via separate typed reads with canonical authorization.

## States and cancellation

States: queued, running, cancel_requested, succeeded, failed, cancelled and interrupted. Terminal states never become running. `cancel_requested` is acknowledgement of intent, not proof of completion. A queued job can cancel without running. During work, tokens are checked between bounded batches and through the future adapter's supported interrupt/cancellation port. Worker errors or cancellation cannot return a successful partial search/capsule/database.

The durable effect boundary wins races: if canonical answer completion or verified index publication already committed before cancellation was accepted, return that completed binding. Otherwise cancellation suppresses later transient output. A Mock job cancellation must route through canonical submission cancellation before preparation or invocation cancellation afterward; a local flag alone is insufficient to manufacture a durable cancelled outcome. Cancel commands are repeatable under their own receipts.

On process restart, old disposable jobs report interrupted/expired; they are not resumed automatically. Durable outcomes are re-read from operation/invocation records. Only explicit action can resume a prepared Mock invocation; unresolved commit selection stays blocked. Background execution here is a Core worker, not Activity scheduling, a resident service or a real provider.

## Event ordering and bounded polling

Allocate per-job event sequence starting at one and increasing strictly within a process lifetime. `poll(jobId, processId, afterSequence, limit)` binds both identities, with limit 1–128. Retain at most 256 events/job and terminal jobs for at most 30 minutes or 128 entries/process. An out-of-range cursor returns explicit `event_gap` plus a complete current status, never silently skips events. Returned next cursor equals the last delivered sequence; polling beyond the current cursor yields no invented progress.

Status/event snapshots come from one serialized job state; a terminal result cannot precede its durable proof. Expose counts, not a fake percentage when total is unknown. Processed count is monotonic within a phase; a new phase has its own counters. Unknown total is null, not zero. Status may advance while a client is disconnected; client timers do not own worker execution.

Bound completed preview payloads to 4 MiB/process and ten minutes; eviction returns `preview_expired`, never fabricates a recorded capsule. Persisted actual invocation capsules are not disposable preview cache. A UI closes without automatically cancelling jobs; actual Core process death is a separate lifecycle fact and is not promised to leave embedded Core running.

## Acceptance before implementation claims

The DTO/event shape schema is now specified; complete positive/negative synthetic traces and semantic validators are an implementation prerequisite. Prove actual backend worker queue/owner limits, cooperative cancellation, terminal race arbitration, callback after process/job replacement, event gaps, restart interruption and no frontend-thread blocking. Mock completion must match the canonical receipt/ledger; index success must match the verified selected binding. These are specified tests, not executed evidence.
