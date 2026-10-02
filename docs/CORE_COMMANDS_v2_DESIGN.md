# Core commands v2 — proposed backend integration contract

Date: 2026-10-02. Status: design, not enabled IPC/Tauri handlers. Authority: [ADR-023](adr/023-command-receipts-and-jobs.md), [Core IPC v1](CORE_IPC_v1.md), [invocation ledger](INVOCATION_LEDGER_v1.md). Existing eight v1 requests/responses remain unchanged; frontend work is separate.

## Version and read surface

A future capability handshake reports implemented schema/policy versions, supported operations and commit modes. It must not advertise v2, persisted commits, jobs or real providers until those handlers pass activation checks. A frontend may review this design now but must not infer current support. There is no compatibility adapter that fabricates a durable result from a v1 `model_only` response.

Future backend reads are closed, typed operations: get snapshot; get Session; list/get candidate; search Memory; preview/get exact recorded capsule; get invocation; get operation receipt; get health; get job; poll job events. IDs, bounded filters and limits are arguments; raw paths, SQL, process commands, endpoints and credentials are never client arguments. Snapshot/Session/search/capsule responses include one exact Vault binding. Actual capsule inspection loads the selected recorded bytes; preview is explicitly uncommitted and cannot prove a Provider consumed it.

Search uses [retrieval v1](MEMORY_RETRIEVAL_v1.md); errors/cancellation cannot become a false `no_match`. Canonical inspection works while the disposable index is absent. Read lists use bounded limits and explicit omitted counts, and may not silently return an incomplete object as a complete snapshot. Pagination tokens bind the generation and filter; advancing the generation invalidates a token with `stale_page` rather than mixing pages. The [read/result wire design](CORE_READ_RESULTS_v2_DESIGN.md) now specifies closed shapes and selected synthetic examples; Rust semantic validators and complete handler traces remain implementation prerequisites. These are not working commands.

## Mutation envelope and authority

The [closed envelope design](../contracts/ipc/backend-command-v2.schema.json) carries `schemaVersion: 2`, `clientRequestId`, exact `expectedBinding` and one operation. The initial candidate operations are save Memory, review candidate, undo supersession, create Session, append user turn, create checkpoint, update Identity, send user turn to Mock, continue a retained user turn, resume a prepared invocation, cancel an invocation and cancel a submission. Operations reuse existing canonical/draft shapes; new IDs/times/statuses are backend allocated. String-length schema bounds supplement, not replace, backend nonblank/UTF-8-byte/model validation; Mock query input retains retrieval's 1,024-byte limit.

`clientRequestId` is an untrusted random action/retry token of 16–64 ASCII letters/digits/underscore/hyphen, not a Memory ID or permission proof. The real shell must authorize a human save/review/send/cancel interaction. Derive SHA-256 of the token for private lookup only, scoped to this Vault and command service. Require the expected binding before a new mutation; never overwrite stale data by quietly substituting latest state. A retry does not create a new human approval.

Hash the validated typed semantic request under `command_digest_v2`: compact UTF-8 serialization in declared struct field order, explicit defaults/nulls and original text/array order, excluding only `clientRequestId`. It includes operation kind, draft/content/target IDs and exact expected binding. Decoder rejects unknown fields and duplicate keys first. No whitespace/content normalization or unordered tag-array rewrite changes the operation meaning. The [field recipe and all-command byte vectors](COMMAND_DIGEST_VECTORS_v2_DESIGN.md) now freeze representative design examples for all twelve operations, defaults and prospective v2 input caps. Equivalent Rust typed bytes, arbitrary f64 parity and full canonical validation remain mandatory before handlers activate.

## Durable operation receipts

Add generation-contained `operations/op_<hex>.json`, with backend-allocated opaque `op_` identity, to the future Vault allowlist. Receipt fields are schema version, operation ID, client-key hash, request digest/policy, command kind, original expected binding, create/update times, status, nullable result references/error and `committed_generation_id`. The last field identifies the generation where that receipt version was last changed; unchanged copies retain this original ID. It contains **no hash of its own manifest**. Putting the current manifest hash inside a file hashed by that manifest would create a self-reference. A response derives the complete commit binding by validated lineage lookup after publication.

Uniqueness of client-key hash across the retained selected lineage is canonical and cannot be lost with SQLite. A receipt retry must first search the selected complete operation inventory under the writer lock, before rejecting the request's now-stale expected binding:

| Observed receipt | Request digest | Result |
|---|---|---|
| Completed | Equal | Return retained result references and original commit binding, `replayed=true`; no mutation/dispatch |
| Accepted/running | Equal | Return current receipt/invocation/job references; no second scheduling |
| Failed/cancelled/interrupted | Equal | Return retained terminal outcome; explicit new action/token is needed to try again |
| Any existing receipt | Different | `request_conflict`; preserve the first operation |
| None | Any | Validate the expected current binding and real action; only then allocate/commit |

Old receipts stay retained. A completed replay points to the original committed generation, even if Memory has since changed; a separate fresh read shows current state. Failure of prevalidation/expected binding creates no accepted receipt and makes no canonical change. Unknown pointer selection blocks further writes; do not invent a failed receipt to imply that a possibly committed operation did nothing.

A synchronous canonical mutation and its completed receipt commit together. Result references name committed Memory/source/candidate/Session/turn IDs; resolve them in that receipt's completed generation. Submission receipts use separate user and assistant source references so accepted input provenance is not overwritten by the response source. An Identity update can return all-null model references plus its exact commit binding; the receipt does not need a client file path. Future error DTOs expose only structured categories and affected opaque IDs, never draft text, token strings, filesystem paths or raw SQL/process output.

## Send, resume and cancellation

`send_mock_turn` accepts the explicit user turn/source **and an accepted receipt** in one transaction. It returns `inputSaved=true` and that input commit binding, not a completed assistant claim. Compilation may fail later while preserving the input. Preparation adds invocation/request/capsule and the receipt's invocation reference together; final completion commits assistant/source/response, terminal invocation and completed owning receipt together.

For `continue_user_turn`, reuse a retained latest user turn without appending again. For `resume_invocation`, require an explicitly resumed prepared invocation, stable Session prefix/Identity and new operation token. Old terminal receipts are not reopened. Exactly one accepted/running receipt owns a live invocation; a previous interrupted submission may retain its reference but cannot schedule again. No automatic resumption at startup.

On restart, after excluding a live owner, accepted/running submission receipts become interrupted through an audited transaction. Prepared invocation files may remain prepared for explicit later resume; dispatching/cancellation-intent invocations become interrupted per the ledger contract. A job token alone never authorizes recovery or exactly-once dispatch.

`cancel_invocation` is a canonical control operation with its own retry receipt. Serialize against completion: a completed target returns its retained outcome; a prepared target cancels without dispatch; an active target records cancellation intent. That control receipt completing means the cancellation intent was recorded, not that a worker has already stopped. The original submission receipt reaches cancelled only after terminal cancellation is confirmed. A completed answer is never erased by a late cancel request.

`cancel_submission(operationId)` handles the accepted-input interval before an invocation exists: it commits the submission receipt as cancelled while retaining the user turn/source, and completes its control receipt without calling Mock. If the active submission already has an invocation, route its cancellation under the same lock to the ledger policy. A terminal target returns its retained outcome. This closes the queued-job cancellation gap; an interrupted receipt with a separately retained prepared invocation still requires explicit invocation resume/cancel, not reopening the old receipt.

Checkpoint creation remains explicit and requires an existing ordered range plus human-supplied draft. Same-Session user/checkpoint mutations reject `session_busy` during an accepted/running submission **or** a non-terminal invocation, including the input-to-preparation gap; explicit resume/cancel control operations are the exceptions. Unrelated Session/Memory operations are independent. Provider results cannot bypass candidate review or directly create a Memory.

## Result and activation limits

Proposed replies distinguish rejected, input accepted, canonical completed, replayed completed, job accepted and observational commit unknown. Every durable claim includes backend-derived exact commit binding; job accepted says nothing about canonical completion. Index degradation is separate health metadata, not a rollback. The shape schemas cover mutation/receipt/job fields and the proposed [read/result wire](CORE_READ_RESULTS_v2_DESIGN.md); they are not a callable frontend API.

Add receipt operation variants and path validators, freeze typed request digest/receipt fixtures, implement canonical lookup/CAS/authorization, then test simultaneous identical/conflicting retries, lost acknowledgements, old-generation replay, index loss and Session/result atomics before advertising v2. No runtime migration, handler activation or frontend file change is part of this design.
