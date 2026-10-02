# Identity-only storage bytes v1 — backend design

Date: 2026-10-02. Authority: [Vault storage](VAULT_STORAGE_v1.md), [closed storage shape](../contracts/vault/storage-v1.schema.json) and ADR-020. Status: selected exact byte vectors in an inert fixture; no Runtime store, selector publication or P01 acceptance.

## Selected history

The [fixture](../tests/fixtures/backend/storage-bytes-v1.json) contains thirteen Base64-encoded byte objects and three generation inventories. Synthetic IDs are validly shaped fixed markers, not OS entropy evidence. No root directory is created and no user Identity is read.

| Generation | Operation | Actual changed paths | Retained bytes |
|---|---|---|---|
| `gen_00000000000000000000000000000001` | `bootstrap` | Both Identity files | Initial synthetic core and rules |
| `gen_00000000000000000000000000000002` | `update_identity` | `identity/core.md` | Original rules; parent preserves original core |
| `gen_00000000000000000000000000000003` | `update_identity` | `identity/runtime_rules.md` | Modified core; both ancestors remain present |

Each generation lists exactly both Identity files and `mutation.json`, never its own manifest. Every selector hashes the exact manifest bytes. Each child hashes its parent's exact manifest bytes. Manifest entries hash and count complete file bytes; `changed_paths` compares only Identity bytes with the parent and excludes the mutation metadata. Model/raw collections remain empty. This is a legal initialization history rather than an arbitrary populated snapshot labelled bootstrap.

JSON examples use UTF-8 without BOM, compact serialization and terminal LF. LF participates in length/hash. Identity examples are exact UTF-8 text, including the selected newlines and a Chinese text edit. Base64 only transports those bytes within the test fixture; it does not introduce a persisted wrapper or a new storage format. Object aliases such as `core0` are test references and cannot become file paths in a Runtime API.

## Probe and limits

The [selected probe](../scripts/check-storage-bytes-design.py) reads only committed design inputs, decodes the inert object map and reuses the selected schema keyword evaluator. It checks exact object lengths/hashes, canonical Base64, closed shapes, canonical calendar timestamps, sorted unique inventory, complete listed-file equality, selector identity, ancestor bindings, Vault continuity, transaction uniqueness, nondecreasing time and exact changed paths for this Identity-only history. Relevant declared byte/resource caps are checked; allocating maximum-size files and testing resource exhaustion remain future work.

The negative corpus includes unknown fields, corrupted lengths/hashes, duplicate objects/paths/selectors, missing/unlisted files, self-manifest listing, traversal/case variants, parent mismatch/cycle, wrong selector Vault and invalid dates. Mutation corruptions recalculate their manifest entry and final selector hash before checking wrong changed paths, late bootstrap or wrong transaction. Header corruptions likewise rehash all dependent bytes before checking clock regression, Vault discontinuity, reused transaction and lost/wrong parent. These cases show that hash consistency alone is insufficient within this selected oracle.

Duplicate JSON keys, nonfinite numbers, missing LF, BOM and invalid UTF-8 are separately refused. This checker is neither a general JSON Schema engine nor a complete Vault validator. It deliberately accepts only this empty-model Identity history; its inventory restriction must not be copied into a general Runtime adapter as the full storage allowlist.

Before P01/O01 acceptance, extend an independently checked Rust corpus through actual Memory/source/candidate/Session transitions and invocation/request/capsule/response/receipt linkage. Include full graph semantics, supersession/review/checkpoint history, numeric serializer parity, recorded compact Capsule exception, raw references and all storage limits. Later ports must still prove actual file identity, locks, pinned reads, atomic selection, recovery and device durability. The [validation record](validation/Core-storage-bytes-design.md) keeps this narrower evidence separate.
