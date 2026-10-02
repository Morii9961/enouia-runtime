# Selected submission/ledger history traces v1 — backend design

Date: 2026-10-02. Authority: [invocation ledger](INVOCATION_LEDGER_v1.md), [commands v2](CORE_COMMANDS_v2_DESIGN.md), [read/results](CORE_READ_RESULTS_v2_DESIGN.md) and ADR-020/022/023. Status: symbolic selected histories, no Runtime orchestration, persistence or actual process restart.

## Fixture language and proof boundary

The [fixture](../tests/fixtures/backend/orchestration-traces-v1.json) freezes actions, expected replies and a last-validated snapshot summary after each observation. `op1`, `inv1`, `u1`, `frozen1`, token/digest labels and integer generation ordinals are **fixture aliases**, not valid IPC IDs, SHA-256 values, actual manifests or private content. Typed wire validation, human action routing and real complete-bundle bytes are assumed prerequisites for these selected histories and require independent handler acceptance.

The [symbolic oracle](../scripts/check-orchestration-traces-design.py) models one selected Session's accepted input/source, receipt ownership/status/last-change generation, invocation status/frozen input label and symbolic call count. It checks the declared legal ledger edges, source/event/result coupling, retained prefixes, terminal receipts, exact retry-key lookup order and frozen input identity. Each symbolic proposal is validated before replacing the model snapshot; a rejected proposal leaves that model intact. This is a specification assumption about future atomic commits, not a demonstration of a filesystem transaction.

`call` is a distinct symbolic event from saved `dispatching`: recording dispatch intent alone does not prove Mock executed. The oracle never instantiates Mock, loads Session/response files, opens a Vault/index/Activity tree, allocates canonical IDs or kills a process. `owner_excluded` is a declared premise, not OS evidence. A `restart` event likewise describes intended recovery decisions, not actual durability.

For `selection=unknown`, all counters/status maps refer only to the **last validated snapshot**. In particular, `answers=0` does not prove that a possibly selected completion wrote no answer. The oracle blocks subsequent mutation/dispatch/replay claims and reports `commit_unknown`; it does not pick a parent/child branch, fabricate a failed receipt or repair the selector. Recovery selection/orphan reconciliation remains separately gated.

## Selected history matrix

| Trace | Required design outcome |
|---|---|
| T01 | Saved input → prepared → dispatch intent → symbolic call → one answer/source/result → explicit checkpoint |
| T02 | Same-Session turn/checkpoint/new-submission refused during the accepted-to-prepared gap |
| T03 | Queued submission cancellation keeps input, creates control receipt, never calls Provider |
| T04 | Prepared cancellation keeps recorded artifacts/input, creates no answer/call |
| T05 | Cancellation intent wins; late result discarded; terminal cancelled receipt/ledger together |
| T06 | Answer commit wins; late cancel observes retained terminal outcome and cannot erase it |
| T07 | Compile refusal keeps the already accepted input/source |
| T08 | Provider refusal keeps input and terminal failure without an assistant event |
| T09 | Restart after dispatch intent but before call still records interrupted; no fabricated result |
| T10 | Restart after symbolic call keeps the interrupted attempt; no reconstructed answer |
| T11 | Prepared restart retains invocation; new explicit resume receipt owns it; old receipt stays interrupted |
| T12 | Accepted-input restart with no invocation requires explicit continue; input is not appended twice |
| T13 | Terminal invocation cannot resume; explicit continuation uses new invocation/capsule identity; old callback ignored |
| T14 | Lost-ack replay looks up the old completed receipt before stale expected-parent refusal and preserves its commit generation |
| T15 | Reused token/different declared digest conflicts and preserves the first accepted action |
| T16 | Stale new request allocates no input/source/receipt |
| T17 | Unrelated Memory commit advances selection without replacing frozen invocation input |
| T18 | Identity changed after preparation refuses dispatch as stale; no symbolic call |
| T19 | Unknown attempted completion blocks retry, cancel and unrelated write; counters are last-known only |
| T20 | Recovery without excluding a live owner refuses; original owner remains responsible |
| T21 | Transient job cancellation cannot claim durable Mock cancellation |
| T22 | Cancelling an old terminal submission receipt does not cancel its separately retained prepared invocation; explicit invocation control is required |
| T23 | Restart after cancellation intent interrupts the invocation/owning submission; old callback ignored |
| T24 | Identical control retry replays its committed intent receipt without a second cancellation mutation |
| T25 | Duplicate dispatch attempt is refused; no second symbolic call |
| T26 | Identity change prevents explicit prepared resume; no new live owning receipt is accepted |

## Result and ownership distinctions

An accepted/running submission owns the same-Session busy boundary before an invocation exists. Preparation records the invocation reference and running receipt together. After audited recovery the old receipt remains interrupted; prepared invocation may remain prepared with no live owning receipt until an explicit new resume action. At most one accepted/running submission receipt owns an invocation. Control receipts completing never imply a worker is already stopped.

Explicit continuation pins a newly accepted complete bundle while reusing the retained user turn/source. Explicit prepared resume retains the already recorded original input/capsule. Old terminal receipts never reopen and terminal invocation/request identities are never reused for a new attempt. Scope-changing Memory edits do not implicitly regenerate a historical capsule; Session-prefix/Identity stability is revalidated before dispatch.

Completion adds assistant event, corresponding source, response, completed invocation and owning receipt in one intended canonical boundary. Checkpoints are separate explicit actions over retained ordered events. The selected oracle uses alias/source/result coupling only; actual calendar/text/provenance/hash/range/manifest validation is not established by it.

Historical replay reports the receipt version's last-changed complete commit binding, while current observation may be newer. A retry token is not approval, and a declared digest label is not a cryptographic equality proof. The independent [digest vectors](COMMAND_DIGEST_VECTORS_v2_DESIGN.md) specify request bytes; a future Rust integration must join those bytes to actual canonical receipts and returned wire DTOs.

## Acceptance still required

The [validation record](validation/Core-orchestration-traces-design.md) reports 26 selected histories/164 observations, deliberately false completion summaries and invariant corruptions. This is not full coverage of all ledger edges, all command kinds, arbitrary concurrent interleavings, job/page/event expiry, time/resource limits or recovery fault phases.

Before P08/O03-O09 acceptance, execute equivalent histories through typed Rust admission, complete synthetic generation files, actual Mock/response validation, real simultaneous processes and restart, verified selected manifests and sanitized result DTOs. Include cancellation/complete races at selector boundaries, ownership/lease loss, every unknown-selection branch and index-degraded canonical completion. Preserve actual Activity state sentinels separately. Nothing in this fixture activates those operations or signs off full A1/A2.
