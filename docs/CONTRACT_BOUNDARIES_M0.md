# M0 shared contract agreement

Date: 2026-09-26. This closes M0's shared interface decisions after M0.1. It does not implement Track A, Track B, a UI, or production delivery. Architecture v0.3 and the ADR register remain authoritative.

## Local IPC v1

The machine-readable local DTOs are [common-v1](../contracts/ipc/common-v1.schema.json) and [activity-v1](../contracts/ipc/activity-v1.schema.json). They describe the backend-to-Windows-shell boundary, not the Moriium public batch. The `enouia-common` Rust DTO names and enum values match the common schema. Every Activity response has `schemaVersion: 1` and a discriminating `kind`; frontend code handles a different major version as unsupported. Optional fields may be added within v1 after updating the schema and tests; existing required fields and meanings cannot be repurposed.

| Operation | Arguments | Response kind | Owner |
|---|---|---|---|
| `activity_get_overview` | none | `activity_overview` | Activity read facade |
| `activity_get_days` | source, inclusive `from` and `to` dates | `activity_days` | Activity read facade |
| `activity_preview_public_payload` | none | `activity_public_preview` | Activity contract/read facade |
| `activity_run_now` | none | `activity_run_accepted` | Worker launcher |
| `activity_retry_pending` | none | `activity_run_accepted` | Worker launcher |
| `activity_set_paused` | boolean | `activity_pause_acknowledged` | Activity runner state |
| `activity_get_run` | run ID | `activity_run_status` | Activity runner/read facade |

Backend validation of `from <= to`, real dates, run-ID ownership, lock state, and permissions remains mandatory; Schema patterns alone cannot prove these. Mutations return a run ID promptly. `activity_get_run` reports sanitized progress without raw tool output. A failed command returns `activity_error` with a structured code, component and retryability. The Activity UI consumes these DTOs through typed IPC; it never opens the archive or invokes a collector itself.

Overview totals are decimal strings so the shell does not round them through JavaScript numbers. `recordedDays` counts actual records; a missing day is not an explicit zero. `lastAttemptAt`, `lastSuccessAt`, transport time, and publication observation are separate facts. Codex's `Codex` day labels remain independent of Claude's `Asia/Shanghai` labels. The default three-hour stale policy is local health policy; a heartbeat or UI refresh cannot advance source success time. Public preview uses the exact ActivityData v1 allowlist and its data-byte hash.

The global navigation route is `activity`. Track A owns navigation and shell lifecycle; Track B owns this route's content, read facade and commands. Both may depend on `enouia-common`. No Activity code may depend on Memory, Context, Session, Provider, or the author database. Core may compose read-only health from Activity without sharing a canonical store.

For the Track B handoff, `Collector.collect` yields exactly one local `SourceAttempt` per fixed source. Success carries `source`, the run's common `attemptedAt`, and a validated incoming snapshot. Failure carries `source`, the same attempt time, and a redacted local error code. Neither variant carries `succeededAt`, a sequence, pending bytes, credentials, or a public upload result. The [synthetic handoff fixture](../tests/fixtures/activity/source-attempts-v1.json) uses one fixed clock and previous archive, with an explicit success, failure retention, and zero-valued day; a Rust test checks its source snapshots. B1 owns the Rust type and merger. This internal interface is separate from ActivityData/batch v1 and may gain local error variants without changing the wire protocol.

`enouia-common` also defines the `ProcessRunner`, `JsonLineSession`, `Cancellation`, `AtomicFile`, and `LockProvider` ports. `ProcessRequest` and `ProcessOutput` are private in-memory types without serialization. `JsonLineSession` was added for the B1.2 interactive Codex app-server protocol. The later `enouia-windows-process` crate implements its bounded, job-owned Windows session; it does not implement `ProcessRunner`, `AtomicFile`, or `LockProvider`. A1/B2/B3 still need to prove Windows path restrictions, process cancellation, lock lifetime, and durable replacement at their owning milestones.

## Track A handoff to A1

M0 fixes ownership and names, leaving full persistence schemas to A1 before any Vault write:

- Canonical Memory records are versioned JSON, one record per memory. The five first-phase kinds are `fact`, `preference`, `episode`, `project_state`, and `session_checkpoint`. The required common fields from Architecture §6 remain `schema_version`, `memory_id`, `type`, `content`, `source_id`, `created_at`, `updated_at`, and `status`. ProjectState and checkpoint fields, provenance, validity, confidence, and supersession need full A1 schemas and fixtures.
- Identity is human-readable Markdown; raw conversations, candidate inbox items, reviewed canonical memories, sessions, checkpoints, and disposable SQLite/FTS indexes remain separate. Inferred memories cannot skip candidate review. A source ID must resolve; a supersession link preserves the earlier record and cannot cycle.
- The Context Capsule is built from Memory/Session and the actual capsule sent is inspectable. Activity is not a retrieval source or implicit provider prompt field. A1/A2 must freeze capsule versioning, token-budget estimation, inclusion/exclusion reasons, and deterministic tie-breaking before persistence and provider orchestration depend on them.
- Provider ports remain `ProviderRequest`, `ProviderResponse`, `ToolRequest`, `ToolResult`, and `ProviderCapabilities`; the first implementation uses a deterministic Mock. Activity CLI usage collection is not a Provider implementation.

The next Track A artifact is the A1 Memory/Session/source/candidate schema and synthetic fixture set. The next Track B artifact is B1's pure `previous + SourceAttempt` merge and then isolated collector adapters. Neither may interpret this M0 agreement as permission to migrate real data or activate delivery.
