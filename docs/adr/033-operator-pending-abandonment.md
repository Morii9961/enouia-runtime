# ADR-033 — Operator abandonment of a refused pending batch

Date: 2026-10-11. Status: adopted and implemented; using it on a real store is an operator decision under the migration runbook. Authority: the operator-reconciliation clause of [ADR-015](README.md#adr-015--existing-restricted-ssh-with-observed-publication-adopted), the C14/C15 gaps in [B4 coverage](../validation/B4-coverage.md) and the owner's instruction to finish the remaining Runtime Activity work. B4 row sign-off and B5 activation remain separate.

## Context

[ADR-014](README.md#adr-014--single-writer-generation-transaction-and-one-pending-batch-adopted) keeps one pending batch and blocks every new collection until that batch is resolved. ADR-015 resolves a pending batch in two ways: observed publication of its exact data, or an operator reconciling server evidence. Only the first was implemented. Several situations keep a batch pending forever:

- The publisher refuses it. The [C15 regression run](../validation/B4-reference-regression.md) shows the receiver storing the batch, the publisher reporting `degraded`, and Runtime retrying the same bytes at every eligibility time.
- The receiver's high-water is already at or above the batch's sequence, for example after a rollback to the old producer and back. The receiver exits 0 without storing the batch, so publication is never observed (C14).

In both cases the producer stops collecting, and a hand edit of the store is the only way out. Renumbering the pending batch, or sending different bytes under its sequence, would break ADR-014. Clearing it without a record would hide that the sequence was used.

## Decision

1. A new runner command, `pending-abandon`, ends one pending batch without publication:

   ```text
   pending-abandon --config PATH --sequence N --pending-sha256 HEX --confirm-refused true [--reserve-through M]
   ```

   It acts only when all of the following hold:
   - The writer lock is held.
   - The recovery audit passes.
   - The store is paused.
   - The current pending batch has exactly sequence `N` and SHA-256 `HEX`.
   - The confirmation is given.
2. The new generation keeps the archive and the batch's sequence. Without `--reserve-through`, the highest reserved sequence stays where it is: normally `N`, or higher if a migration import reconciled a higher high-water. The next collection uses the sequence after it. With `--reserve-through M`, where `M ≥ N`, the reservation moves to `M`, so the next collection uses `M + 1` and stays above a known remote high-water. Sequence `N` is never reused or renumbered.
3. The new generation has no pending batch. Its `delivery.json` drops the retry state and records `pendingAbandoned` with:
   - `sequence`, `exactPendingSha256` and `activitySha256`;
   - `reservedThrough`;
   - `abandonedAtMs`;
   - `reason: "operator_confirmed_refused"`.

   Pause and earlier publication receipts are kept.
4. The store accepts this transition only through the abandonment entry point:
   - Pending → none with matching `pendingAbandoned` evidence and an unchanged archive.
   - The reservation may only stay or move forward, up to the safe-integer limit.
   - Later pause and retry commits must keep `pendingAbandoned` unchanged.
   - Generation validation checks the record's shape and bounds.
   - The recovery audit accepts an older generation that holds the abandoned bytes at the same reservation.
5. After the commit, the command writes two files under `reconciliations/`:
   - `abandon-<N>.json`, which records the evidence and both generation ids;
   - `abandon-<N>-pending.json`, a copy of the exact pending bytes, so that the evidence survives any later generation pruning.

   If either write fails after the commit, the result is `abandoned_record_failed` (code 6), and stdout carries the record.
6. The overview reports delivery state `observed` only when no recorded abandonment is newer than the last observed publication. Otherwise it reports `idle`. The [ADR-030](030-production-activation-path.md) enable gate therefore cannot pass on a publication observed before the abandoned batch. Receipts without an abandonment are reported as before, including a migrated batch published below a higher reconciled high-water.

## Consequences

- Abandonment does not repair data. If the refusal came from the archive itself, for example a seed missing dates that are already public, the next batch is refused as well. Reconciling the archive stays an O4/O6 operator task.
- Before abandoning, the operator confirms from server evidence, through Moriium operations and never by broadening the producer key, either that the publisher refused this batch or that the receiver's high-water is at or above it. If any later sequence might already be stored remotely, the operator passes `--reserve-through` with that high-water.
- `diagnostics` shows the latest abandonment. IPC v1 keeps its fields, and only the existing `observed`/`idle` choice changes.
- The legacy export after an abandonment carries no pending batch and the raised high-water, so a rollback to the old producer also continues above the abandoned sequence.
- Tests cover the store transition, its refusals, audit acceptance, generation validation, the CLI and the overview state. None of this authorizes running the command on Morii's real store.
