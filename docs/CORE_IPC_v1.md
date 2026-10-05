# Local Core IPC v1

Historical Runtime-local design, frozen by [ADR-025](adr/025-enouia-memory-integration.md); the Memory domain is defined by Enouia Memory.

Date: 2026-10-01. Scope: A1.1 typed local interface contract. No Tauri handler, UI, filesystem command, provider or deployment is implemented here.

[core-v1 schema](../contracts/ipc/core-v1.schema.json) and `enouia-core-contract` define eight requests and four response families. Request/response wrappers use camelCase; nested canonical Memory/Source/Session records and turn ranges keep their existing snake_case contract names. Every response carries `schemaVersion: 1` and a discriminating `kind`.

| Operation | Arguments | Backend obligation |
|---|---|---|
| `core_get_snapshot` | none | Return a complete validated local Memory/Session bundle |
| `core_save_memory` | saveMode, draft | Require explicit Inspector/remember action; generate ID/source/time; validate and commit |
| `core_review_candidate` | candidateId, review | Require actual human approve/edit/reject interaction; preserve original proposal and provenance |
| `core_undo_supersession` | memoryId | Revalidate current successor/predecessor and preserve both meanings |
| `core_create_session` | title | Allocate session identity and backend creation time |
| `core_get_session` | sessionId | Resolve ownership and return a provenance-validated session |
| `core_append_user_turn` | sessionId, content | Allocate immutable turn/source/time and sequence; user role only |
| `core_create_checkpoint` | sessionId, coveredTurns, lastState, openLoops | Resolve existing ordered turns; validate canonical checkpoint and append its event |

Drafts contain content and type-specific proposed fields, never a canonical memory/source ID, status, creation/update time or schema version. Ordinary explicit save excludes SessionCheckpoint; its dedicated command enforces the session boundary. Candidate review may edit a checkpoint draft, but the backend still preserves candidate ID/provenance/kind and validates complete turn linkage. Inferred proposal creation is an internal backend operation, without an IPC command that pretends review happened.

The shared draft type/schema belongs to Memory and is re-exported by this interface. Provider can propose the same draft without depending on a UI contract or creating a future Core/Provider dependency cycle.

Closed request shapes reject unknown fields, including the no-argument snapshot command. Client path-like IDs fail validation. A client marker is not proof of authorization: the future handler must originate mutations from actual UI user interactions and revalidate current backend state. This crate implements DTO validation, not those handlers or a security sandbox.

Responses are `core_snapshot`, `core_session`, `core_mutation_completed`, or `core_error`. Mutation results distinguish `model_only` from `canonical_files_committed`; tests/models may emit the first. A handler must emit the second only after canonical files and the associated Session/Memory boundary are committed, even when the disposable index remains degraded. The enum cannot itself prove a disk commit. Complete snapshot validation checks provenance and Session linkage; single-session validation checks shape and requires the read facade to have checked canonical provenance.

Errors reuse shared structured code/component/retryability. Core error components exclude Activity. No raw process output, credential, filesystem path or personal authentication data is added to an error DTO. Local inspectors may display private Memory content/provenance through typed responses; those DTOs must never become Activity public data or an implicit provider prompt.

The interface crate depends on common, Memory, Session and serde. Activity has no reverse dependency. Context compile/actual-capsule inspection and asynchronous index operations remain later contracts; no generic filesystem, arbitrary SQL, collector or assistant-message mutation request is exposed.

Backend follow-up: [proposed command v2](CORE_COMMANDS_v2_DESIGN.md) and [job/event v1](CORE_JOBS_v1.md) now specify exact binding, durable retry receipts, typed reads and bounded workers/events. These are sibling design artifacts, not changes to this v1 schema or implemented handler support. Any frontend integration must negotiate actual capabilities rather than assuming proposed v2 exists.
