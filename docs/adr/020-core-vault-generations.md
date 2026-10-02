# ADR-020 — Core Vault generations and pinned reads

Date: 2026-10-02. Status: adopted backend design; persistence implementation and activation pending. Authority: Architecture v0.3 §5/6/14, ADR-001/002/003/006. The user's current scope is backend design only; frontend design starts after Claude Design is complete.

Later scope update on the same date: the user reports frontend work is progressing separately. Backend design continues here without changing that work; this supersedes the frontend waiting instruction above, not the persistence activation gates.

## Problem

One approval may create a canonical memory, supersede a predecessor, retain the candidate decision and append a Session checkpoint reference. Appending a turn also creates its conversation source. `MemoryLedger::from_snapshot` and `validate_sessions` require a complete bundle. Replacing each file independently would expose incomplete provenance or checkpoint linkage after interruption.

## Alternatives

| Choice | Reader boundary | Recovery work | Cost |
|---|---|---|---|
| Journal plus individual replacements | Readers need a transaction barrier throughout replacement/replay | Per-file before/after evidence, idempotent replay or rollback, and repair of partially replaced bundles | Stable file locations and less copying, more recovery states |
| Immutable complete generations plus one pointer | A reader pins one validated manifest and its complete files | Validate the selected bundle; report unpublished/orphan generations without promoting them | Copies unchanged files and retains old generations |

Select complete generations for the initial bounded local Vault. This reduces the number of reader-visible commit boundaries and keeps individual JSON records and Markdown Identity inspectable. This is a design judgment, not evidence of OS crash safety. Do not implement a second journal that independently decides which bundle is canonical.

## Decision

Use a Core-only root, one process-scoped exclusive writer lock, immutable generation directories and a closed JSON `CURRENT` pointer binding Vault ID, generation ID and exact manifest SHA-256. The manifest inventories every canonical file, its length/hash, the parent generation binding and transaction identity. A generation-local mutation record describes the operation; it is evidence, not a second commit selector.

Identity, Memory, sources, candidates and complete Session records are generation-contained. Raw imports are immutable content-addressed files outside generations and are pinned by the selected manifest. SQLite remains disposable and is associated with the complete pointer binding, never a global truth source. No shared mutable root-level copies or hard links between generations.

All changes stage a complete next bundle, validate schema/provenance and legal historical transitions, flush files, publish the immutable directory, then switch `CURRENT` on the same volume. Re-read and validate the selected bytes before reporting a canonical commit. A switch failure or interrupted acknowledgement requires observation, not an automatic retry of the mutation. An index failure after a confirmed commit cannot roll back files or hide a reviewed decision.

Keep every committed generation and unresolved staging/raw artifact in this slice. Full copying has bounded input and storage limits; exhausted capacity refuses the next mutation while preserving prior data. No automatic pruning or compaction. A later optimization needs its own retained-history, pinned-reader and interrupted-write evidence.

The normative file/transition specification is [Vault storage v1](../VAULT_STORAGE_v1.md); its required evidence is [the recovery acceptance matrix](../VAULT_RECOVERY_MATRIX_v1.md).

## Activation gates

This ADR adopts the design and specifies the future Core layout; it does not activate a writer or migrate any data. The Architecture v0.3 illustrative stable Vault paths are replaced by generation-contained paths only when the adapter gates below pass. Memory/Session model v1 and Activity paths/semantics do not change.

1. Freeze closed storage schemas and positive/negative synthetic fixtures from the field tables; validate them through existing Memory/Session model boundaries and transition checks.
2. Implement OS entropy, Core-only locking, handle-checked local paths, same-volume staging/pointer publication, pinned reading and ambiguity reporting.
3. Execute all required recovery rows on marked synthetic roots, with separate evidence for fault injection, actual process death and storage/power-loss behavior. Unsatisfied rows remain explicit and prevent claims beyond their evidence.
4. Prove disposable index rebuild, exact retained session/source/candidate history and unchanged Activity bytes. Implement Core mutation handlers only against this validated boundary.

Real data import, production use, real providers and frontend work retain their separate authorization and acceptance boundaries. Implementation does not become authorized merely because this design ADR exists.

## Windows source limits

The existing Activity writer is a local reference for staged bytes and `MoveFileExW`; its evidence does not establish Core correctness. Microsoft's [MoveFileExW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw) documents replacement and write-through flags; cross-volume copying is excluded here. [FlushFileBuffers](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers) documents flushing an opened file. [ReplaceFileW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew) documents failure states and an unsupported write-through flag. None is a blanket proof of this multi-file protocol under power loss. Select and verify the adapter's exact primitive, ACL behavior and flush ordering before activation; never infer complete-bundle durability from one API return value.
