# Command digest v2 frozen byte vectors — backend design

Date: 2026-10-02. Authority: [ADR-023](adr/023-command-receipts-and-jobs.md) and [commands v2](CORE_COMMANDS_v2_DESIGN.md). Status: Python design vectors for every proposed command kind; no Runtime codec, handler or retry store is activated.

## Typed field recipe

The [machine-readable recipe](../contracts/ipc/command-digest-v2.json) freezes top/binding/operation/draft/review/range/validity field order. Top semantic fields are `schemaVersion`, `expectedBinding`, `operation`; only `clientRequestId` is excluded. The latter still selects a Vault-scoped private retry-key lookup and is not permission proof. Persisted receipt fields and exact expected binding remain unchanged.

Shared MemoryDraft field order follows the existing pure Rust struct. A missing optional value becomes explicit null; tags/decisions/openLoops become empty arrays. Approval without an edited draft becomes `edited:null`; a validity interval with no end becomes `ends_at:null`. Explicit defaults and omission therefore represent the same typed action. Unknown fields/duplicate keys fail before normalization. Missing required v2 arguments do not receive invented defaults, project IDs, token budgets or human approval.

Object key order and whitespace outside strings do not affect the semantic bytes. Original text, line endings, trailing spaces, Unicode values and array order do. Do not sort tags/decisions/open loops, trim human text, fold case or apply Unicode normalization to the command input. The existing ASCII search folding policy is a separate derived retrieval behavior.

Emit compact UTF-8 JSON in that recipe, without BOM or LF. SHA-256 covers those exact bytes. Shared nested TurnRange/ValidityInterval fields retain their existing snake_case names; wrapper operations/drafts keep their declared camelCase fields. The fixture records the full semantic UTF-8 string, byte length and digest rather than only a claimed hash.

## Initial prospective v2 input bounds

Bound both received wire bytes **before JSON decoding** and normalized semantic bytes to 1 MiB each. Additional v2 text budgets: Session title at most 256 schema characters/1,024 UTF-8 bytes; draft content/state/last-state, ordinary turn/Identity/checkpoint text and rejection reason at most 65,536 UTF-8 bytes; send-Mock query at most 1,024 UTF-8 bytes. Draft tags/decisions/open loops have at most 256 elements, each at most 4,096 UTF-8 bytes. Existing operation-specific schema limits still apply; the stricter applicable bound wins.

Refuse excessive/blank/invalid text intact before allocating canonical IDs or a receipt. Never trim/truncate to fit. UTF-8 decoding rejects malformed sequences/lone surrogate values. Actual human routing, candidate original kind/provenance, Session range resolution, supersession graph and retained input/Identity/lease checks still belong to future Rust canonical validation.

These are bounds for the proposed v2 interface, not a change to existing v1 model/IPC acceptance or an authoritative-file retention cutoff. They are supplementary to Vault per-file/generation limits and response bounds. A broader v2 request budget needs deliberate contract/version review and corresponding handler evidence.

## Numbers and activation gate

Shared confidence is `Option<f64>` in the existing Rust model: finite numbers in [0,1]. A JSON integer one and decimal one become the same typed value; the example serializer emits `1.0`. The design retains signed-zero typed intent rather than inferring that `-0.0` and `0.0` had identical serialized bytes. Null is distinct from zero.

The frozen examples cover null, 0.5, integer one decoded to 1.0 and negative zero. They do **not** prove arbitrary binary64 formatting parity between Python and the pinned Rust serializer, nor settle every exponent/subnormal/roundtrip case. Before enabling `command_digest_v2`, freeze equivalent Rust typed bytes for every vector and the full numeric edge corpus; resolve any discrepancy explicitly without silently rewriting old expected digests. The policy is not active today, so no real receipt is claimed compatible.

## Coverage and evidence

The [22 frozen vectors](../tests/fixtures/backend/command-digests-v2.json) span all twelve kinds: save, review, undo, create Session, append user turn, checkpoint, Identity update, send Mock, continue retained input, resume, cancel invocation and cancel submission. Additional cases cover the three ordinary Memory kinds, ProjectState, reviewed SessionCheckpoint, unchanged/edited approval, rejection, Unicode/control text, tag order, validity/default/null fields and representative confidence.

Run [the design checker](../scripts/check-command-digests-design.py). It checks each frozen byte string/length/hash; recursive object reordering; token exclusion; explicit defaults; pretty-wire decoding; expected-binding distinction; text/array/numeric intent; recipe field coverage; selected invalid inputs; and the previous create-Session digest `eecf5e231d493f57b482df62f33f6b4a010dc6541befe21d2508dd0381389a4b` unchanged.

The vectors were frozen with the local Python design serializer and reviewed against the existing DTO declarations. They are requirements for an independent Rust implementation, not independent proof that Python and Rust already agree. [Validation](validation/Core-command-digests-design.md) distinguishes these checks from runtime authorization/idempotency/storage proof. None signs off P07/O02.
