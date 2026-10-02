# Capsule invocation ledger v1 — backend design

Date: 2026-10-02. Status: closed design schema and byte-fixture specification; no persisted ledger, Runtime handler or provider dispatch. Authority: [ADR-022](adr/022-invocation-and-session.md), [Vault v1](VAULT_STORAGE_v1.md), [Provider v1](PROVIDER_MOCK_v1.md). This task continues backend design while frontend work proceeds separately.

## Canonical files and exact bytes

Add generation-contained `invocations/<inv_id>.json`, `capsules/<cap_id>.json`, `requests/<req_id>.json` and `responses/<req_id>.json` to the future Vault allowlist. Invocation IDs are `inv_` plus 32 lowercase hex digits allocated by backend OS entropy. All these files are included in the generation's manifest. Existing Memory/Session/Provider/Capsule schema v1 is unchanged.

`capsules` is a deliberate byte-format exception: store the exact **compact UTF-8 capsule bytes without a terminal LF** returned by the prepared Provider request. The consumed SHA-256 and byte count are over those exact bytes, not a pretty-printed copy or the manifest/whole request. Other JSON files retain one terminal LF. Reloading a request must reproduce exactly the selected capsule bytes through `ProviderRequest::prepare` against its retained input bundle. Parsing arbitrary DTOs alone cannot create a prepared request.

A request file is the closed existing ProviderRequest DTO and embeds the same capsule model. A response file is the validated existing ProviderResponse DTO; its stored-byte hash/length are separate from the consumed capsule hash/length. No endpoint, credentials, additional hidden messages or source registry is given to Mock. Capsule Identity/content is private local data, not an exported diagnostic payload.

The [invocation schema](../contracts/invocation/record-v1.schema.json) defines shape. Semantic rules below supplement it: calendar dates, time ordering, identity/hash linkage, legal transitions, exact canonical bytes, complete Session/source resolution and unique request/capsule/invocation identities across retained history require backend validation.

## Record and transition boundary

Each record binds one `invocation_id`, Provider `request_id`, capsule ID/hash/byte count, Session ID, triggering user turn ID, exact `input_binding`, provider `mock-v1`, preparation/update times and status. `dispatch_at`, `cancel_requested_at`, `terminal_at`, structured `error_code` and `result` are explicit nullable fields. A completed result binds exact response file bytes and backend-owned assistant turn/source IDs. No response/result exists for a non-completed attempt.

`input_binding` names the retained canonical generation after the triggering user turn committed and before the capsule was compiled. A preparation commit advances the Vault generation; it does not change what historical inputs the capsule consumed. The input generation must remain reachable in the selected lineage. The input Session ends in that exact user turn, and every capsule memory/turn/Identity byte is revalidated against that input. Do not claim it reflects later Memory edits.

| From | Legal successor | Conditions |
|---|---|---|
| `prepared` | `dispatching` | Exact recorded request/capsule reload validated; active same-Session lease; current turn prefix unchanged |
| `prepared` | `cancelled`, `failed`, `stale` | No Provider execution; structured cause retained |
| `dispatching` | `completed` | Response validates; no cancellation won; assistant/source and result commit together |
| `dispatching` | `cancel_requested` | Cancellation intent commits under the canonical writer lock |
| `dispatching` | `failed`, `stale`, `interrupted` | No assistant result committed; classified failure retained |
| `cancel_requested` | `cancelled`, `interrupted` | Discard transient late result; no assistant/checkpoint is manufactured |
| Any terminal status | None | A later attempt requires a new invocation/request identity and explicit action |

Terminal statuses are completed, failed, cancelled, interrupted and stale. Times cannot regress; `prepared_at <= dispatch_at/cancel_requested_at <= terminal_at` where present, and `updated_at` equals the last committed transition time. Completed requires dispatch time, terminal time, a result and no cancellation time/error. Other terminal states require terminal time/error and no result. `cancel_requested` requires dispatch and cancellation times; `interrupted` requires dispatch time. Shape-valid objects can still violate these semantic rules.

Prepared artifacts alone never prove dispatch. A committed `dispatching` state records an attempt boundary, not proof that the process reached Mock or that an answer exists. Mark dispatching **before** calling the Provider. Re-read the committed state and validate a process-owned lease; if the selection/commit is ambiguous, do not dispatch.

## Orchestration commits

1. Commit an explicit user turn/source via the canonical boundary. The caller may instead explicitly continue an already retained latest user turn; it never creates a duplicate to retry an invocation.
2. Pin/validate that generation, retrieve/rank/compile the actual capsule and prepare the Mock request. Under canonical compare-and-swap, publish prepared ledger/request/exact capsule together. Record no prepared entry on failed compilation; keep the already committed user turn.
3. Obtain one process-owned invocation lease per Session; other turn/checkpoint changes for that Session refuse as busy while this invocation is non-terminal. Unrelated Sessions/Memory may progress independently. Ledger transitions use the latest complete parent while preserving the immutable input/request/capsule.
4. Recheck the triggering Session prefix and pinned Identity against the latest bundle before dispatch. A changed prefix/Identity refuses as stale. Other later Memory edits do not replace the frozen input or authorize a hidden recompile. Commit dispatching, release the canonical lock, and invoke Mock from only the validated prepared bytes on a backend worker.
5. Validate returned request/capsule identity, consumed bytes/hash, ProjectState provenance, text and no-tool capabilities. Reacquire the canonical lock and arbitrate against current invocation/Session state. Completion appends one exact assistant text turn, creates its matching conversation source, stores the response and updates the ledger to completed in **one** complete-generation transaction.
6. Re-read selected files before reporting a completed turn. An index failure cannot undo the assistant/source/result. A lost acknowledgement is reconciled through the retained invocation/result IDs; do not call Mock or append again.

The assistant source time equals the appended Session turn time at completion, not the request time. All old events/source meanings remain intact. Provider failures/tools have no invented Session role. Checkpoints remain a separate explicit `core_create_checkpoint` operation after completion, using existing ordered user/assistant ranges and an actual human-supplied draft. No automatic model summary, checkpoint, inferred candidate approval or tool dispatch is added by this design.

## Cancellation, restart and uncertainty

Cancellation of a prepared invocation commits cancelled without calling Mock. During dispatch, cancellation first commits intent and then signals the process-owned token. The lock serializes completion versus cancellation: if completed was selected first, return that result; if cancel_requested was selected first, a later reply is discarded and cancelled commits without an assistant turn. A callback cannot resurrect a terminal attempt. Cancellation is not deletion of the already committed user turn.

On process restart, non-terminal dispatching/cancel_requested entries become interrupted through an explicit audited recovery transaction once no live owner exists. Prepared entries are retained as prepared and require an explicit resume/cancel action; startup never invokes a Provider. A stale lease/time alone is not proof that another process is dead. A new process cannot reclaim work until OS lock/ownership evidence excludes a live owner.

The initial Mock has no external side effects, but deterministic output is not an exactly-once storage guarantee. A crash after dispatch may leave execution outcome unknown; retain the interrupted attempt and allow only an explicit new attempt. Never invent a response from a hash or regenerate one and label it recovered historical output.

When any pointer switch was attempted but selection cannot be determined, the operation is observationally `commit_unknown`, not a new canonical invocation status. Block further mutations/dispatch and retain artifacts until Vault recovery resolves the selector. Do not retry completion or create a fresh user turn while the first could have committed.

## Bounds and verification

Reuse Vault per-file/generation/history bounds and Mock's 32,768-unit input limit. Additionally bound a request/response to 1 MiB each and a non-terminal invocation count to 64 per Vault, with one per Session. Bounds refuse intact without deleting old audit/capsule data. No retention pruning or remote provider is introduced.

The [byte fixture checker](../scripts/check-invocation-design.py) verifies frozen capsule/response binding and selected schema/transition invariants only. It is not a JSON Schema conformance engine, Runtime state machine, canonical Session validator or filesystem test. Required adapter evidence includes prepare-before-dispatch, same-Session exclusion, completion/cancellation races, callback after terminal state, every crash phase, retained historical capsule reload, exact lost-ack result lookup, index degradation and unchanged Activity bytes.
