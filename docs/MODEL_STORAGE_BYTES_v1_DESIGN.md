# Memory/Session storage byte corpus v1 — backend design

Date: 2026-10-03. Authority: [Vault storage](VAULT_STORAGE_v1.md), [closed storage shape](../contracts/vault/storage-v1.schema.json), [pure canonical history](CANONICAL_HISTORY_v1_DESIGN.md) and ADR-020. Status: exact synthetic storage object maps and selected Rust model-byte comparison; no live Vault or persistence adapter.

## Corpus construction

The [fixture](../tests/fixtures/backend/model-storage-v1.json) contains eighteen generation object maps: a legal empty bootstrap with both synthetic Identity files, followed by the seventeen selected Memory/Session actions. Eighty-nine exact byte objects are Base64-encoded inside the inert fixture. Fixed marker IDs have the required shape but do not demonstrate random allocation or production collision handling.

Every generation contains its complete model inventory and mutation metadata. Each selector hashes exact manifest bytes; each child names the immediately preceding selected manifest/hash. Files are sorted/unique and include both Identity files and mutation, excluding the manifest itself. `changed_paths` equals the actual added/changed model/Identity bytes compared with the prior complete generation, excluding mutation. No record disappears and the bootstrap has no models or raw objects.

| Selected action | Mutation | New/changed complete file set |
|---|---|---|
| Empty Session | `create_session` | New Session |
| Four saves | `save_memory` | Matching source and canonical Memory |
| User turn | `append_user_turn` | New conversation source and full append-only Session |
| Explicit checkpoint | `create_checkpoint` | New matching source, canonical checkpoint and full Session |
| Proposal | `propose_candidate` | New candidate with original proposal; no canonical insertion/event |
| Project edit approval | `review_candidate` | Reviewed candidate, edited canonical successor and superseded predecessor |
| Undo | `undo_supersession` | Archived successor and restored predecessor; original meanings retained |
| Reject | `review_candidate` | Retained candidate with terminal decision only |
| Checkpoint approval | `review_candidate` | Reviewed candidate, canonical checkpoint and full Session/event |

Unchanged records are carried forward with exact bytes. Reusing an object alias within the *test fixture* avoids repeated Base64 content; it does not authorize hard links or shared mutable canonical files. A future store must still write independent immutable copies and validate actual filesystem identity.

## Exact Rust model byte comparison

The existing isolated [Rust probe](../scripts/design/canonical-history-v1.rs) now optionally emits a complete map of compact UTF-8 model JSON with one LF, using existing typed model serializers. Source/Memory/candidate/Session paths derive from their validated embedded IDs. The output is an inert JSON map in ignored `target/design-probes/`, not a directory layout or selector publication.

[The storage checker](../scripts/check-model-storage-design.py) reruns that pure-model history offline and compares every selected model file's frozen bytes with the fresh Rust output: **210** comparisons across eighteen complete model inventories. It checks all exact object lengths/hashes, closed selector/manifest/mutation shapes, sorted inventories, selected operation/time/parent/Vault/transaction linkage, byte-derived changed paths, selector hashes, declared relevant resource bounds and accounted fixture objects. Both synthetic Identity files are exact fixed bytes throughout this history.

Metadata fixture serialization was authored in Python. Fresh Rust serialization checks canonical model files, not Rust selector/manifest/mutation DTO serialization. This is selected serializer/model evidence; it does not establish arbitrary numeric parity, a general-purpose complete-bundle loader or generic historical mutation validator. The approved ProjectState's representative confidence is 0.5; no all-f64 compatibility claim follows.

## Refusals and remaining acceptance

Seventeen corrupted corpora refuse wrong bytes, history length/order/selector, unknown fields, rehashed wrong mutation kind/changed paths/transaction/bootstrap, unsorted/self/traversal inventory, oversized declared file, fabricated raw import, parent contradiction and rehashed historical turn rewriting. The final rewrite updates the Session entry and selector hashes, so its rejection cannot rely only on those stale hashes. These are selected fixture decisions against a known Rust model oracle, not exhaustive decoding/transition coverage for arbitrary imported bundles.

The [validation note](validation/Core-model-storage-bytes-design.md) records the exact scope. Invocation/capsule/request/response/receipt graphs and raw imports are absent; later additive ADR gates remain inactive. No staging, real generation, CURRENT, index, backend handler, Windows lock/root/file access, process restart, personal data or Activity tree is used. P01-P10 and O01-O14 remain unimplemented/unaccepted, including actual Rust storage DTOs, full operation predicates, packaged adapters and device durability.
