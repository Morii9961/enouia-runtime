# A1.2 Vault layout proposal

Date: 2026-10-01. Status: draft for the next implementation step, not a frozen persistence contract or implemented durability claim. The pure A1 schemas remain authoritative; Architecture v0.3 requires staged/validated/flushed canonical writes followed by disposable index updates.

Historical proposal retained. On 2026-10-02, [ADR-020](adr/020-core-vault-generations.md) selected complete immutable Core generations with a pinned pointer. [Vault storage v1](VAULT_STORAGE_v1.md) replaces the candidate layout/transaction choice below as the current backend design; [the acceptance matrix](VAULT_RECOVERY_MATRIX_v1.md) specifies pending implementation evidence. No persistence adapter or durability claim is established by that selection.

## Proposed ownership

Use an explicitly configured Core-only root. Keep Identity Markdown, immutable raw imports, canonical records, transaction/recovery evidence and the disposable index distinct. No Activity path, producer name, sequence, pending bytes, scheduler or collector config belongs under this root.

```text
core-root/
  identity/core.md
  identity/runtime_rules.md
  raw/                       # immutable source imports, importer/hash inventory
  canonical/                 # one JSON per memory/source/candidate; sessions separate
  transactions/              # durable prepared/committed mutation evidence
  index/memory.sqlite        # disposable metadata/FTS only
```

Record filenames should derive only from validated opaque IDs, never title/content/client paths. Root/parent containment, Windows reparse handling and replacement semantics need explicit tests before accepting writes. OS cryptographic entropy allocation must fail closed; collision must preserve the existing record.

## Cross-file transaction question

An approval can insert a new memory, preserve/update a previous memory's supersession status, record a candidate decision and append a Session checkpoint reference. Separate atomic replacements are insufficient to establish a complete bundle. Freeze a recovery protocol before implementing this operation.

Evaluate two bounded options against the same crash matrix: journaled multi-file replacement with replay/rollback, or immutable canonical generations selected by an atomic manifest. The latter naturally pins a complete reader snapshot but duplicates files and needs explicit retention/storage-growth policy. The former keeps familiar file locations but requires careful ownership, replay idempotence and durable journal ordering. No option is selected by this draft.

Required crash points include preparing new files, flushing data, publishing transaction evidence, each canonical replacement/snapshot switch, committing the canonical boundary and updating the index. Every accepted read/restart must expose a complete validated old/new bundle or a recoverable blocked state. It must not silently drop orphan source/candidate/checkpoint records or rewrite source meaning to repair consistency.

## Acceptance before moving on

Use marked synthetic roots. Verify exact active IDs, original conversation contents, source resolution, candidate isolation and multiple checkpoint ranges after actual process restart. Delete/corrupt SQLite and rebuild from canonical files; fail index updates after canonical commit without losing memory. Exercise disk-full, sharing violations, traversal/reparse escape and interrupted transactions while retaining old bytes. Compare a separate Activity archive tree/high-water/pending before/after every Memory repair.

Freeze file manifests/versioning and the chosen transaction protocol with test fixtures; only then implement Vault/index adapters and actual Core IPC handlers. A future real-data import requires its own explicit source/coverage and activation evidence. This draft authorizes no deletion, migration, production collector, service or deployment.
