# Core Vault storage v1 — backend design

Date: 2026-10-02. Status: normative backend design under [ADR-020](adr/020-core-vault-generations.md); no persistence adapter, executed recovery evidence or personal migration. Closed executable storage schemas/fixtures are the first subsequent implementation task. Existing [Memory v1](MEMORY_MODELS_v1.md) and [Session v1](SESSION_MODELS_v1.md) fields/validators remain authoritative.

## 1. Authority and layout

Configure an absolute Core root on one verified local filesystem, separate from Activity, source/build/install directories and cloud-synchronized roots. A new root requires an explicit initialization operation. Existing roots with missing or corrupt state must not be initialized automatically. The lock and initialization must also work before `CURRENT` exists.

```text
core-root/
  vault.lock                         # process-scoped exclusive OS writer lock
  CURRENT                            # sole canonical generation selector, JSON
  staging/<generation-id>/          # unpublished preparation; never a reader input
  generations/<generation-id>/
    manifest.json
    mutation.json                    # one transaction's durable evidence
    identity/core.md
    identity/runtime_rules.md
    sources/<source-id>.json
    memory/<memory-id>.json
    candidates/<candidate-id>.json
    sessions/<session-id>.json        # complete append-only logical event list
  raw/<sha256>.bin                    # immutable imported bytes, if referenced
  index/memory.sqlite                # disposable; exact pointer binding in metadata
```

Each generation contains one JSON per record and a complete Session file per session. Physical whole-file replacement in the new generation must preserve each old event as an exact model prefix. There is no live JSON-lines append log or mutable alias outside the selected generation. Markdown remains human-readable; editing authoritative Identity must go through a future backend mutation that republishes the entire bundle. Exported copies cannot silently become authority.

Raw data never enters Context implicitly. Import sources must resolve their `raw_sha256` to an exact listed raw object. Identical bytes may share one raw object; an existing object with inconsistent bytes fails closed. No importer is implemented or live archive imported by this design.

## 2. Closed storage objects

All objects reject unknown fields and unsupported versions. JSON is UTF-8 without BOM, with one terminal LF. Duplicate object keys fail decoding. Hashes and lengths cover exact stored bytes including LF; hashes provide integrity/binding, not authentication against the local owner. JSON semantic validity is checked separately. Do not silently normalize imported bytes into a different claimed hash.

Persistence-only IDs are `vlt_`, `gen_`, `txn_` followed by 32 lowercase hex digits. They do not extend Memory model ID kinds. Allocate using OS cryptographic entropy; failure or a collision refuses creation without overwriting existing bytes. The Vault ID is created once at explicit bootstrap and stays unchanged along its history.

### CURRENT

| Field | Type and invariant |
|---|---|
| `schema_version` | Integer, exactly 1 |
| `vault_id` | Opaque `vlt_` ID |
| `generation_id` | Opaque `gen_` ID |
| `manifest_sha256` | 64 lowercase hex digits, hash of exact selected manifest bytes |

The pointer is bounded to 1 KiB and names no arbitrary path. Derive its generation path from a validated ID. Reads pin all four fields once; they do not reopen `CURRENT` between individual files.

### manifest.json

| Field | Type and invariant |
|---|---|
| `schema_version` | Integer, exactly 1 |
| `vault_id`, `generation_id` | Equal the selected pointer binding |
| `transaction_id` | Opaque `txn_` ID, unique in retained committed lineage |
| `created_at` | Existing canonical UTC-millisecond timestamp format |
| `parent` | Null only at bootstrap; otherwise closed `{generation_id, manifest_sha256}` binding |
| `files` | Sorted unique array of closed `{path, byte_length, sha256}` entries, relative to this generation |
| `raw_objects` | Sorted unique array of closed `{sha256, byte_length}` entries deriving `raw/<sha256>.bin` |

`files` includes `mutation.json`, both required Identity files, and every source/memory/candidate/session file. It excludes `manifest.json` itself to avoid a self-hash and excludes `CURRENT`, staging and index. Empty record directories are allowed; unlisted regular files or unexpected directory names inside a generation are invalid. All referenced raw objects must exist; unreferenced raw objects are retained and reported separately, never exposed as selected imports.

Only these relative path forms are valid: `mutation.json`, the two fixed Identity paths, and `sources/src_<hex>.json`, `memory/mem_<hex>.json`, `candidates/cand_<hex>.json`, `sessions/ses_<hex>.json`. Filename ID equals the embedded model ID. Reject absolute paths, `..`, backslashes, colons/alternate streams, device names, case variants, trailing dots/spaces and duplicate case-folded paths. No manifest entry directs an arbitrary file read.

Additive backend design under [ADR-022](adr/022-invocation-and-session.md): future validated adapters also admit `invocations/inv_<hex>.json`, `capsules/cap_<hex>.json`, `requests/req_<hex>.json` and `responses/req_<hex>.json`, with preparation/dispatch/cancellation/finalization/recovery mutation kinds. Capsule files alone contain exact compact Provider bytes **without LF**; other JSON retains the rule above. The [ledger contract](INVOCATION_LEDGER_v1.md) defines identity/input/Session binding. These additions remain inactive until their complete-bundle and adapter gates pass; they do not create a second canonical selector.

[ADR-023](adr/023-command-receipts-and-jobs.md) further specifies generation-contained `operations/op_<hex>.json` and same-commit command receipt transitions. [Command v2 design](CORE_COMMANDS_v2_DESIGN.md) binds retries to canonical files rather than SQLite. Receipt copies retain the generation ID where their version last changed; they must not embed their own manifest hash. Read/result/job observations derive exact bindings after publication. These are additional inactive adapter gates, not an IPC/writer activation.

### mutation.json

| Field | Type and invariant |
|---|---|
| `schema_version` | Integer, exactly 1 |
| `vault_id`, `generation_id`, `transaction_id` | Match this manifest |
| `parent` | Exactly the manifest's parent binding |
| `created_at` | Exactly the manifest's creation time |
| `operation` | `bootstrap`, `save_memory`, `propose_candidate`, `review_candidate`, `undo_supersession`, `create_session`, `append_user_turn`, `create_checkpoint`, or `update_identity` |
| `changed_paths` | Sorted unique allowed relative paths, excluding `mutation.json`, equal the actual added/changed model/Identity files versus the parent |

There are no client paths, credentials, Activity state, raw process output or duplicated memory contents in mutation metadata. `bootstrap` has no parent, only the two Identity paths as changed files, and empty model/raw collections. Subsequent operations require an existing validated parent, nondecreasing operation time and legal operation-specific transitions. Reserved import/provider/orchestration operations need later contracts before admission; a generic `replace_bundle` is deliberately absent.

### Initial bounds and retention

Initial adapter bounds: manifest at most 4 MiB; mutation at most 1 MiB; individual JSON/Identity file at most 16 MiB; at most 10,000 manifest files; total selected generation at most 256 MiB including manifest; at most 1,024 referenced raw objects, each at most 64 MiB and total at most 256 MiB. These are resource limits, not model semantics or retention cutoffs. A growing Session that exceeds the cap is refused intact, never truncated. A larger supported layout requires an explicit version/limit review and corresponding evidence.

Retention keeps complete ancestors, including old Identity, source meanings, reviewed proposals and Session contents. Preflight available storage before full copying, then still handle write/flush failures. Do not promise allocation from a preflight estimate. No hard links, silent record removal, automatic orphan deletion or index-triggered generation cleanup. Initial bounded scans must refuse an oversized history rather than drop ancestors; adapter implementation must set and test its scan limits before activation.

## 3. Semantic transition boundary

Reconstruct a complete Memory snapshot from listed files, construct it through `MemoryLedger::from_snapshot`, and run `validate_sessions` against every complete Session. A pending checkpoint proposal is allowed to remain a candidate; it is not a canonical checkpoint or a Session event. Approved canonical checkpoints require the corresponding event in the same selected bundle.

Bundle validation alone is insufficient: compare the complete parent and next bundles using the operation's legal transition. Existing sources are unchanged; original memory content/provenance/creation time are retained through supersession and undo; original candidate proposals remain exact while one pending decision becomes approved/rejected; old Session events remain an unchanged prefix. Record IDs cannot disappear. Approved/rejected decisions cannot return to pending or be reviewed again. Identity changes are allowed only by `update_identity` and preserve old bytes in the parent.

| Operation | Files committed together |
|---|---|
| Explicit save/remember | New Memory and its backend-owned matching manual/remember source; affected superseded predecessor, if any |
| Propose candidate | Candidate with original proposal and resolvable source; canonical active memories unchanged |
| Approve/edit candidate | Retained proposal plus review decision, approved Memory and any superseded predecessor; checkpoint approval also appends its Session event |
| Reject candidate | Retained proposal plus rejection reason/time; no canonical insertion or Session checkpoint event |
| Undo supersession | Restored predecessor plus archived successor, retaining source/content/link |
| Create session | Backend-owned empty Session |
| Append user turn | Full Session with one new user event plus exactly matching conversation source |
| Create checkpoint | Canonical checkpoint and resolvable source plus the corresponding Session event |
| Update Identity | Both Identity files carried forward, only explicitly edited file bytes differ |

Use existing pure operations where available; freeze additional transition validators and checkpoint-review composition as part of implementation. Clients never supply authoritative IDs/times, bypass human review, or claim that files committed. A cancelled operation before selection cannot create a successful turn/checkpoint; after a confirmed selection, cancellation cannot undo the committed facts.

## 4. Writer protocol

1. Resolve and verify the root, acquire the exclusive Core lock, audit state/artifacts and pin a valid parent. Reject a stale caller generation. Only explicit bootstrap may start from an empty root.
2. Allocate IDs/time, build the complete next bundle and validate model, historical transition and resource limits in memory. There is no automatic clock repair or branch merge.
3. Create new same-volume staging directories/files using exclusive creation. Publish any new raw bytes by content hash only after checked writing/flushing; reuse an existing raw object only after exact validation. Partial raw temporary files remain unreferenced evidence.
4. Write independent copies of every canonical file and mutation record. Validate serialized bytes, compute lengths/hashes, flush each file, write/flush the final manifest, then re-read and validate the complete staging bundle through checked handles.
5. Publish the immutable generation directory without replacing an existing directory. Prepare/flush a unique pointer temporary file in the root. No reader may follow staging or select the published directory by its name/time alone.
6. Recheck the expected parent under the still-held lock, then perform one same-volume `CURRENT` publication. The adapter must prove its exact replacement primitive's reader, failure, ACL and flush behavior; prohibit cross-volume copy fallback, reboot-delayed moves and delete-then-rename replacement.
7. Re-read `CURRENT` through a checked handle and validate its complete selected bundle. If it equals the next binding, the canonical mutation committed. If it equals the parent binding, this mutation is not selected; retain/report the published orphan and block subsequent writes pending reconciliation. Any other binding is a conflict. If a switch was attempted and selection cannot be determined, return a blocked/unknown result and retain all bytes. Never report `model_only` as evidence that a potentially committed mutation failed.
8. Update/rebuild the disposable index for that exact binding. Return `canonical_files_committed` only after step 7 confirms the bundle. Index failure degrades search/index health while canonical reads remain available; it cannot erase the commit or replay the mutation.

Pointer publication is the intended reader-visible commit point. The actual Windows implementation must establish that property on its named supported filesystem; this design does not assert it from API documentation. The pointer temporarily written after publishing a generation is not a commit receipt. A lost response does not authorize a duplicate save/turn/review. Existing IPC has no retry key: re-read canonical state and reconcile the transaction; a future idempotency request contract is separate work.

## 5. Readers, recovery and index

A reader pins `CURRENT`, validates manifest hash/identity, checks all listed bytes and complete semantic linkage, and exposes only that bundle. Writers never mutate the pinned generation. An unavailable/malformed file blocks this read; do not construct a partial snapshot or combine files from other generations. Canonical read and typed diagnostics may remain available while new writes are blocked by orphan ambiguity.

On startup, acquire the Core lock for recovery audit. Valid `CURRENT` is the sole selector. Retained ancestors must match their hash-linked manifests and Vault identity without cycles; a non-ancestor published generation is an orphan/branch, even if apparently newer or valid. Report it and block mutations until an explicit reconciliation preserves the evidence. Staging and unreferenced raw artifacts are reported, retained and never replayed/promoted; if conclusively pre-publication and non-ambiguous, they need not block healthy canonical reads or the next write. Their classification is part of the matrix.

Missing/corrupt `CURRENT`, a damaged selected generation, missing ancestors or contradictory bindings block normal writes and automatic initialization. Do not choose the lexically largest ID, latest timestamp or last valid directory, and do not silently roll back to an ancestor. Recovery selection/export requires a later explicit operator contract recording both old/observed bindings and retained artifacts. Before that contract exists, the safe result is preserved bytes and a blocked state.

Index metadata binds `schema_version`, `vault_id`, `generation_id` and `manifest_sha256`; [index v1](MEMORY_INDEX_v1.md) and [retrieval v1](MEMORY_RETRIEVAL_v1.md) now specify the disposable projection and query design. An absent, corrupt or stale index is rebuilt solely from a validated selected bundle, into a separate candidate database, with cancellation and validation before replacement. A query must return a binding that still matches the pinned bundle; if it does not, retry against the new bundle or report degraded retrieval. Never answer using stale/partial results. Candidate and inactive-memory exclusion remain canonical validation/filtering duties.

Read-only model enumeration remains possible without SQLite. Rebuilding or replacing the index cannot mutate `CURRENT`, generations, raw bytes or Activity data. No mutation receipt depends on SQLite transaction success. No Context/Provider orchestration is added in this slice.

## 6. Filesystem and durability evidence

Production adapter activation starts with one specifically tested local filesystem; the initial acceptance target is local NTFS on Windows. Other filesystems are unsupported until separately checked. Verify final root/parent handles and volume identity, user-restricted ACLs, regular file identity and all managed components; reject reparse points and externally linked files. Hold or revalidate parent handles across the operation so validation cannot be separated from use by a junction swap. A lexical path-prefix check alone is insufficient. Exact API access/share flags and hard-link detection belong in the adapter contract/tests before activation.

Microsoft documents [file flushing](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers), [move/replacement flags](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw) and [replacement failure behavior](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew). These sources inform the design; flush order, filesystem metadata persistence and actual old/new visibility still require adapter evidence. Process-death tests do not establish power-loss safety. Disk-full, failed flushes and sharing violations must preserve prior selected bytes or produce a retained, diagnosable blocked state after an attempted switch.

Use [the acceptance matrix](VAULT_RECOVERY_MATRIX_v1.md) before claiming durable behavior. Backend design freezes this contract; persistence adapters, closed-schema fixtures and handlers remain subsequent work. Index/retrieval design is now specified separately, with no persisted adapter. Frontend work is progressing separately under the user's latest update.
