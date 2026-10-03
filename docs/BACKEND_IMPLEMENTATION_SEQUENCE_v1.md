# Backend implementation sequence and acceptance v1

Date: 2026-10-02. Status: consolidated design-to-implementation handoff; no full A1/A2 completion or Runtime persistence activation. The user authorized continuous backend **design** work across slices, with separately progressing frontend work. This plan specifies later implementation and honest proof boundaries.

## Dependency order

| Slice | Deliverable | Depends on | Required acceptance before moving its implementation forward |
|---|---|---|---|
| P01 | Closed storage/canonical-transition Rust DTOs and golden bytes | Existing pure Memory/Session plus storage design | Unsupported/unknown/duplicate data refused; complete model/Session/invocation/receipt linkage; compact capsule exception; no self-hash |
| P02 | OS entropy, checked root/parent/file ports and Core lock | P01 | Cryptographic entropy failure/collision, reparse/alias/parent-swap refusal before outside access; actual multi-process lock |
| P03 | Immutable staging, pinned reader and selector transaction | P02 | Complete old/new or explicit blocked outcomes; hash/lineage/resource/collision checks; no automatic bootstrap/branch promotion |
| P04 | Recovery audit and controlled inspection/export | P03 | Retained source/Session/candidate/Identity meaning; orphan ambiguity; actual process restart; no guessed rollback/replay; V01–V22 method coverage remains itemized |
| P05 | Disposable index projection, candidate rebuild and read owner | P03/P04 | Canonical projection oracle, exact packaged SQLite capability, corrupt/delete rebuild, cancel/replace/owner races, V11/V12 applicable evidence |
| P06 | Literal/scoped retrieval and real capsule compile/inspection | P05 | CJK/short/literal/full-rank fixtures, exact scoped lanes, stale/cancel/limits, actual canonical bytes and whole-record budget |
| P07 | Durable command receipts and proposed v2 typed facade | P03/P04 | Every typed digest fixture, real human-action routing, identical/conflicting retries, stale binding and lost acknowledgement, compatibility negotiation |
| P08 | Actual capsule ledger and Mock/Session orchestration | P06/P07 | Prepare-before-dispatch, same-Session gaps, cancellation/completion race, assistant/source/result atomics, interrupted dispatch and explicit resume |
| P09 | Bounded job/event workers and health/read DTOs | P05/P07/P08 | Queue/owner caps, real cancellation, process replacement, event gaps, preview expiry and durable-versus-disposable result distinctions |
| P10 | Headless synthetic continuity integration | P04/P06/P08/P09 | Manually saved ProjectState → exact capsule → actual Mock answer → explicit checkpoint → real restart → index removal/rebuild → same retained semantics |

`P01` means actual Rust semantic validators/golden wire fixtures, not merely reading the design JSON schemas. Some independent pure tasks can be interleaved; the dependency arrows determine acceptance, not permission to create Codex agents or alter frontend work. Commit/push independently verified implementation features only within separately authorized implementation scope.

## Module and adapter boundary

Keep existing pure models and Provider DTO/Mock behavior independent of Windows, SQLite, real accounts and Activity. Proposed additions are a pure Vault contract layer, Windows Vault store, disposable Memory index and Core orchestration/facade. These are names/ownership proposals, not created packages. Before adding modules update architecture/module ownership, Cargo graph fixtures and the current resolved-dependency guard together; the present guard still intentionally expects twelve modules.

Provider may consume only prepared exact bytes; it cannot receive a Vault/index/source-registry handle. Store validation may depend on pure DTOs without invoking a Provider. Core composes backend ports; the proposed command DTO layer must not become a reverse Provider dependency. Index repair receives no Activity write capability. Capability negotiation advertises only implemented/verified operations, never design-only schemas.

## Canonical bundle oracle

Freeze legal operation histories, not arbitrary imported snapshots masquerading as bootstrap. Include five Memory kinds, manual/remember provenance, pending/edited/approved/rejected candidates, supersession/undo, mandatory Identity, ordered Session turns/multiple checkpoints, empty Session, exact request/capsule/response bytes, invocation attempts and operation receipts. Original source text and prior meanings are always retained. Index data is a separately reconstructed expected projection.

Acceptance records exact source/binary/schema hashes, named clocks, synthetic root markers, initial/observed pointers, file inventories, OS/filesystem/tool versions and outcome selectors. Compare the separate Activity sentinel tree before/after every Memory repair/orchestration recovery. A local fixture, injection, actual process kill, actual device/storage fault and live account/production cycle are distinct evidence types; never aggregate them into a false acceptance percentage.

## Operation and orchestration matrix

| ID | Test boundary | Minimum proof |
|---|---|---|
| O01 | Exact storage wire and full graph | Closed shape plus semantic provenance/lineage/status/history checks; malformed inputs preserve prior state |
| O02 | Digest/receipt identity | All twelve command digests; same-key/same-request replay and same-key/different-request refusal under two processes |
| O03 | Accepted user input | Turn/source/receipt together; compile refusal/cancel before invocation preserves one saved input |
| O04 | Recorded preparation | Exact compact capsule/request and input generation before dispatch; no LF/hash confusion |
| O05 | Single active Session | Accepted-to-prepared gap, other Session mutations, checkpoint approval and explicit resume/cancel exceptions |
| O06 | Completion | One assistant/source/response/ledger/owning-receipt commit; no half-turn or hidden Provider text |
| O07 | Cancellation race | Prepared/no-call, queued submission, dispatch intent, late callback and already committed answer cases |
| O08 | Lost response/commit uncertainty | Exact receipt/result lookup; blocked unknown selector; no duplicate input/dispatch/completion |
| O09 | Restart | Exclude live owner; retain prepared; mark interrupted dispatched work; no automatic Provider execution |
| O10 | Retrieval/index | All short/CJK/scoped/rank/cap/expiry exclusions, full canonical projection equality, real index corruption/rebuild |
| O11 | Async status/events | Bounded workers, strict process/job/cursor identity, event gaps, unknown totals and expired preview refusal |
| O12 | End-to-end headless continuity | Actual synthetic save/answer/checkpoint/restart/index-rebuild equivalence without Moriium/frontend/accounts |
| O13 | Domain isolation | Unchanged Activity contract/tree/high-water/pending; independent Activity/Core failure behavior |
| O14 | Storage/power fault | Itemized Vault V18/V21 device evidence; no claim based solely on process-death or injected errors |

None of O01–O14 is signed off by this design pack. Existing narrow design probes are linked below and do not establish handlers, durable restart or physical storage behavior.

## Remaining implementation decisions

Pin the actual packaged SQLite crate/library/build options, exact Windows access/share/handle-relative strategy, production ACL/sync-root policy and full read/result semantic DTO fixtures at their first implementation slices. These are explicit adapter-specific gates, not permission to infer machine facts. No personal Vault import, live provider, database installation, task/service registration, Activity migration or production cutover follows from this plan.

Within current design scope, the storage/index/retrieval/invocation/command/job boundaries and acceptance order are specified. The machine-readable [readiness manifest](backend/implementation-slices-v1.json) binds the design artifacts and planned dependency graph. Its [integrity checker](../scripts/check-backend-readiness.py) checks documentation/hash/plan integrity only; it does not execute P01–P10 or sign off O01–O14.

The [read/result wire](CORE_READ_RESULTS_v2_DESIGN.md) additionally freezes proposed canonical inspection, sanitized outcome and background control shapes with selected synthetic examples. Full handler pairing/lineage/paging/authorization/race traces remain acceptance work.

The [all-command digest pack](COMMAND_DIGEST_VECTORS_v2_DESIGN.md) now specifies twelve-kind representative byte/default/order fixtures. P07 still requires independent Rust/numeric parity and real retained receipt/race behavior.

The [selected orchestration histories](ORCHESTRATION_TRACES_v1_DESIGN.md) now freeze 26 receipt/ledger/gap/cancel/retry/restart cases. P08 still requires real typed wire/model/file/Provider/OS-owner integration and equivalent actual process histories.

The [Identity-only storage byte corpus](STORAGE_BYTES_v1_DESIGN.md) freezes legal empty bootstrap and two edits with exact selectors/parent hashes. It is a selected P01 input; complete Rust model graph and actual store acceptance remain pending.

The [disposable lifecycle corpus](DISPOSABLE_LIFECYCLE_v1_DESIGN.md) freezes 42 selected expiry/capacity/page/event/preview decisions. P09 still requires actual workers, caches, clocks, coherent snapshots and ownership/race acceptance.

The [capability/admission matrix](BACKEND_ADMISSION_v2_DESIGN.md) specifies actual handler prerequisites, current health versus build capability, receipt-first retry ordering and refusal boundaries. It introduces no activation or new wire fields.

The [Memory/Session history corpus](CANONICAL_HISTORY_v1_DESIGN.md) now verifies seventeen selected transitions through existing pure Rust models, including edited/rejected candidate retention, supersession undo and composed checkpoint review. It is a P01 input, not actual storage or full generic transition acceptance.

The [model storage byte corpus](MODEL_STORAGE_BYTES_v1_DESIGN.md) binds that history to eighteen synthetic selector/manifest/mutation inventories with fresh Rust model serialization comparisons. Metadata DTOs, arbitrary transition admission and actual file/selector adapters remain unaccepted.

The [pure Mock continuity corpus](PURE_MOCK_CONTINUITY_v1_DESIGN.md) composes actual existing Context/Mock/Session APIs after that model history, freezes exact consumed bytes and keeps checkpoint creation explicit. It does not execute canonical orchestration, index retrieval or real process restart and cannot accept P08/P10.

Narrow existing design evidence: [index query probe](validation/A1.2-index-retrieval-design.md), [invocation byte/shape probe](validation/A2-invocation-ledger-design.md), [command digest vector](validation/Core-command-jobs-design.md). Keep these labels when handing the backend contracts to the independently progressing frontend.
