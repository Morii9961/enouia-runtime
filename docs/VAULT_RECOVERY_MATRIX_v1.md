# A1.2 Vault recovery acceptance matrix

Date: 2026-10-02. Status: specified tests, **not executed evidence**. Authority: [storage contract](VAULT_STORAGE_v1.md), [ADR-020](adr/020-core-vault-generations.md). No A1/A2, Activity B4/B5 or production gate is signed off here.

## Harness and oracle

Use marked temporary synthetic Core roots and a separate synthetic Activity archive with archive/high-water/pending/delivery sentinels. Record the exact executable/source hash, Windows/filesystem version, test method, chosen failure point, observed pointer bytes/binding, all retained paths/hashes and complete model results before/after restart. Every row verifies the Activity tree byte inventory is unchanged. The Activity root is never a Core repair destination.

The model corpus must cover all five Memory kinds, explicit saves, pending/approved/edited/rejected candidates, supersession/undo, an empty Session, four original turns and two checkpoints, and mandatory Identity. Reuse the existing [Memory fixture](../tests/fixtures/memory/models-v1.json) and [Session continuity fixture](../tests/fixtures/session/continuity-v1.json) as semantic references; construct legal operation sequences rather than pretending an arbitrary snapshot is a bootstrap transaction. Storage golden bytes/hash fixtures and negative schemas are still to be created.

For each actual supported commit phase, pause a child at a deterministic barrier, kill that process from its parent, restart a fresh reader/recovery process and compare to two independent complete-bundle oracles: the exact parent or the exact intended successor. A returned complete snapshot may never contain a mix. A blocked state is acceptable only where the contract explicitly requires ambiguity/corruption refusal. Record all artifacts rather than treating an error code alone as proof that bytes survived.

Fault injection, real process death and actual storage/power interruption are distinct methods. Report each separately. No synthetic injected error is evidence of physical disk-full or power loss; no process kill proves filesystem metadata flush durability.

## Required rows

| ID | Trigger | Required result |
|---|---|---|
| V01 | Valid explicit empty bootstrap; restart | Same Vault ID, exact Identity, empty model bundle, selected manifest binding |
| V02 | Missing `CURRENT` with existing staging/generation/raw artifacts; corrupt pointer | No automatic initialization or guessed selection; preserve bytes and report blocked state |
| V03 | Save/remember with new source and supersession | Exact complete parent or successor; original content/provenance retained, no half-supersession |
| V04 | Approve/edit/reject candidate; retry reviewed candidate | Original proposal preserved; one legal decision; no duplicate insertion/review or rejected retrieval |
| V05 | Approve a checkpoint candidate | Memory/source/decision/Session event commit together; pending proposal stays outside canonical checkpoints |
| V06 | Append turn; create checkpoint; several checkpoint ranges | Original ordered turn/source contents retained; no orphan source/checkpoint or partial event |
| V07 | Undo supersession; Identity edit | Legal retained history and old Identity bytes; no deleted meanings |
| V08 | Kill during each file write/flush and manifest write/flush | Parent selected; staging retained/reported, no partial canonical read |
| V09 | Kill after generation publication but before pointer switch | Parent remains selected; published orphan reported and new writes blocked pending reconciliation |
| V10 | Kill during pointer preparation/publication and before acknowledgement | Exact validated parent/successor or explicit ambiguity block; no automatic mutation replay |
| V11 | Canonical commit succeeds; index update fails or child dies | Successor retained; degraded index; restart rebuild restores exact active IDs and decisions |
| V12 | Delete/corrupt SQLite; cancel rebuild; concurrent writer during rebuild/query | Canonical files unchanged; incomplete index never selected; returned results bind one exact generation |
| V13 | Two writers, stale-parent request, reader pinned across switch | Exclusive serialization or refusal; no branch creation; reader sees one complete immutable bundle |
| V14 | Length/hash/schema/ID mismatch, duplicate JSON keys, unlisted files, unknown version | No partial load, normalization or silent deletion; explicit blocked diagnostics |
| V15 | Missing ancestor, foreign Vault ID, cyclic lineage, multiple published branches | No newest-directory heuristic or rollback; retain evidence and block mutations |
| V16 | Traversal, absolute/ADS/device/case path; reparse/hard-link escape; parent swap race | Refusal before outside-root reads/writes; external sentinel unchanged; handle/volume evidence recorded |
| V17 | Entropy failure, ID collision, clock regression | No overwrite/restamp; exact prior state retained |
| V18 | Disk-full, failed flush, sharing violation at every publication boundary | Prior bytes preserved; determine selected state after attempted switch or block; no success inferred from staged bytes |
| V19 | Selected-file corruption; raw missing/hash collision/unreferenced partial import | No silent ancestor fallback or import promotion; preserve raw/source coverage and report affected binding |
| V20 | Session/generation/raw/history bounds and insufficient copy space | Refuse intact; no truncation, pruning, candidate loss or Activity reset |
| V21 | Real storage fault/power interruption at file/metadata/pointer boundaries | Evidence from named device/filesystem; only complete validated bundle or recoverable blocked state; explicitly label untested cases |
| V22 | Copied backend harness with Moriium checkout unavailable, no UI/account credentials | Same synthetic results; no frontend, real provider, collector, upload or private checkout dependency |

## Reporting and implementation order

First create closed schemas and byte fixtures, then pure pointer/manifest/transition validators. Next implement checked-path/lock/entropy and pinned read ports, then staging/pointer publication and recovery audit. Add index adapters only after the canonical boundary is independently verified. Run real-process restart tests before claiming restart persistence; retain V21 as an explicit durability gap until actual evidence exists.

A report records each row/method as passed, failed or not run, with direct evidence selectors. Do not sum test counts into milestone acceptance or substitute Activity's old kill reports. The current design has **zero executed Vault recovery rows**. Storage contract design is complete for this slice; the Windows primitive, executable schema fixtures, index schema and actual recovery implementation remain pending. Frontend A3/J1 waits for Claude Design completion.
