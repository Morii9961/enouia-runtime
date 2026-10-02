# Backend capability and admission v2 — design

Date: 2026-10-02. Authority: [commands](CORE_COMMANDS_v2_DESIGN.md), [read/results](CORE_READ_RESULTS_v2_DESIGN.md), [implementation gates](BACKEND_IMPLEMENTATION_SEQUENCE_v1.md) and ADR-020/023. Status: design of future admission, not registered handlers or an activation decision.

## Capability declarations

Capabilities describe the running build's verified registered handlers; health describes current Vault/index availability. Do not fill capability arrays from schema enum values, planned slices, documentation or a pure crate's presence. The current design pack leaves all P01-P10 unimplemented and O01-O14 unaccepted. The existing v1 model facade and pure Mock tests therefore do not prove that this v2 facade exists.

| Capability | Minimum actual prerequisite |
|---|---|
| Canonical record/inventory reads | Checked pinned complete-bundle reader, semantic graph validation, expected-binding/final-observation checks and full result pairing |
| `search_memory` | Above plus accepted packaged index/projection/retrieval and typed refusal/count/rank results |
| `get_capsule`, `get_invocation`, `get_operation` | Valid retained invocation/receipt files, exact bytes/references/lineage and sanitized result pairing |
| Canonical mutation kind | Accepted operation-specific transition, receipt/digest lookup, human-action routing and actual selector commit proof |
| `index_rebuild`, `context_preview` | Accepted actual worker/owner/cache/cancel paths and exact result binding |
| `get_job`, `poll_job_events`, `cancel_job` | Accepted process/job lifecycle, coherent events and transient-versus-Mock control distinction |
| Provider `mock-v1` | Registered accepted route from exact preparation through actual Mock validation and canonical outcome; no inference from unit tests alone |
| `canonical_files_committed` | Tested canonical selector protocol and durable-result facade; not a schema constant or index success |

A kind can remain declared when temporarily unavailable; its call then returns the corresponding structured refusal. Unknown/unregistered kinds return `not_supported` without probing a Vault or allocating anything. Unsupported protocol versions return `unsupported_version`, never fall back to v1. A v1 `model_only` result cannot satisfy any v2 durable mutation. If a future mixed service lists legacy `model_only` support, it must still keep v2 mutation admission tied to its accepted canonical route; the capability list is no conversion rule.

No provider besides `mock-v1` is expressible in this v2 design. Adding real providers needs a new contract and activation gates. Capability responses contain no filesystem paths, private Identity, runtime tokens or account credentials. `maxReplyBytes` reports the actual supported limit, never exceeds the designed 24 MiB ceiling, and remains enforced after exact serialization.

## Health and canonical availability

| Canonical state | Binding | Admitted observations |
|---|---|---|
| `uninitialized` | Null | Implemented capability/health and retained process-local observations; canonical reads/writes refuse |
| `ready` | Exact currently validated complete selector | Canonical inspection; new writes still require lock, binding, authorization, semantic and resource admission |
| `read_only` | Exact validated selector | Complete canonical inspection can remain available; all new canonical writes refuse |
| `blocked` | Null if no current complete selector can be validated | Structured health; no guessed snapshot, branch choice, rollback or canonical success |

`writeAllowed=true` requires `canonical=ready` and a non-null binding, but is advisory: a later call must reacquire/check its own admission. Ready may report `writeAllowed=false` during lock or other temporary refusal. Unknown attempted selection cannot be represented as a ready last-cached binding; an attempt/last-known reference belongs to explicit investigation, not a current canonical claim. A valid selector with retained orphan ambiguity can expose read-only inspection while refusing writes.

Health issue codes are deduplicated, bounded structured categories. Do not return native exception output or private paths. Missing/stale/degraded index blocks search and Context retrieval; it does not block complete file-based enumeration or erase a canonical commit. Rebuild may run only when its own root/index owner and complete input binding are verified, even if canonical writes are disabled. It cannot repair the selector, promote an orphan or change canonical health to ready by rebuilding SQLite.

No initialization mutation exists in the twelve-kind v2 envelope. Explicit bootstrap remains a separately gated operator operation over a proven empty root. Uninitialized status never authorizes silently creating a Vault; corrupt existing state is never treated as empty.

## Mutation ordering and replay

1. Bound transport input and establish the registered version/kind and authorized local action route. Closed decoding rejects duplicate/unknown fields and invalid tokens without echoing arbitrary text or revealing private state.
2. Validate typed request fields/defaults/byte limits and derive exact semantic digest. Token equality never supplies human approval; it scopes a lookup for an already admitted action.
3. Acquire the checked writer owner and validate the current complete selector/lineage. Unresolved selection refuses new mutation/replay-success claims. Canonical receipt lookup cannot use SQLite or an in-memory cache as authority.
4. Look up the token hash in that selected inventory **before** checking whether the request's original expected parent is now stale. Equal digest returns the retained canonical operation observation; different digest refuses `request_conflict`. Neither branch schedules work or revalidates an old action against today's mutable model as if it were new.
5. For no matching receipt, compare exact current expected binding and apply human-action, Session-busy, target/history, resource and operation-specific rules. Allocate authoritative IDs/time only after admission. A new refusal adds no receipt/turn/source.
6. Commit the proposed complete bundle and its receipt together through accepted storage ports. Confirm selection before reporting a committed outcome. Unknown selection returns `commit_unknown`, retains evidence and blocks subsequent canonical mutation; it cannot be translated into `rejected` or fabricated failure.
7. Submission input acceptance and assistant completion remain separate boundaries. An accepted input is retained if later compile/worker/provider work fails; the receipt owns that gap. Never rerun admission as a fresh send solely because a disposable job/cache was lost. Terminal replay cannot dispatch again.

This ordering does not move live queue reservation, cancellation or selector races into a fixture assumption. The actual handler must prove reservation lifetime, accepted-but-unscheduled recovery, concurrent identical/conflicting requests, loss of ownership, late callback and final-binding races. Index absence can cause later compilation refusal while retaining an already accepted user input; it cannot justify dropping that input or duplicating its receipt.

Read and disposable-background admission use their own expected binding/process/token rules. Canonical reads finish against one exact selected bundle or refuse; health/job observations cannot substitute for a canonical commit. See [lifecycle design](DISPOSABLE_LIFECYCLE_v1_DESIGN.md) for cache/event boundaries and [orchestration histories](ORCHESTRATION_TRACES_v1_DESIGN.md) for the accepted-input gap.

## Verification boundary

This matrix was checked against the existing closed read/result enum/shape, twelve mutation kinds, receipt replay rules and all fourteen unaccepted gates. It adds no DTO fields, flags, endpoint registrations, default feature activation or runtime modules. Schema syntax and document consistency are the available evidence; actual authorization, capability negotiation, health observation and admission integration remain P07/P09 acceptance work. The [validation note](validation/Core-backend-admission-design.md) records this distinction.
