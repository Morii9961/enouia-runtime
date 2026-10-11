# ADR-034 — Audit unselected generations from their manifest and sequence

Date: 2026-10-11. Status: **proposed; adopted when the owner merges it.** This narrows the [B2.1 recovery audit](../validation/B2.1-recovery-audit.md) policy. Authority: the owner's instruction to finish the remaining Runtime Activity work, and [ADR-018](README.md#adr-018--archive-retention-and-backup-lifecycle-partial-defaults-adopted)'s rule that keeps every generation until a pruning decision.

## Context

Every write takes the writer lock and audits every retained generation before it commits. That covers run start, collection commits, retry state, acknowledgment, pause and the operator commands. Until now the audit read and fully validated each unselected generation, including its whole archive. ADR-014 and ADR-018 keep every generation and defer pruning. An hourly schedule therefore adds about 8,760 generations a year, and every audit grows with all of them.

Measured with the release runner on a synthetic one-year archive (365 days per source, about 40 KB), one audit cost about 1.3 ms per retained generation. A sync runs three or four audits, so after a year each run would spend roughly 40 seconds auditing. That cost grows without bound as generations and the archive accumulate, toward the run's 900-second budget. The [measurement](../validation/Activity-claude-audit-scale-2026-10-11.md) records the numbers.

## Decision

1. The write-path audit judges each unselected generation from two small files. It parses its manifest strictly: schema, generation id and every hash. It reads `sequence.json`, checks it against the manifest hash and parses it in canonical form.
   - A higher reservation blocks as `higher_reserved_sequence`.
   - A lower reservation is older.
   - At an equal reservation, a different recorded archive hash blocks as `conflicting_generation`. Valid archives are canonical bytes, so the hash comparison matches the old semantic comparison. An equal archive hash with equal pending hashes is older.
   - At an equal reservation with an equal archive but different pending bytes, the generation is read and validated in full, and the existing recorded-clear rules (publication receipt or ADR-033 abandonment) decide.
2. A missing, oversized, reparse-point, unparsable or mismatching manifest or `sequence.json` still blocks writing as a corrupt generation. Unknown entries in `generations/` still fail the whole audit. `CURRENT`'s generation is still validated in full on every read.
3. **Policy change:** damage confined to an older generation's `activity.json`, `pending.json` or `delivery.json` no longer blocks writing. Those files do not decide whether the next sequence is safe. `recovery-inspect` still validates every generation in full. It lists such generations as `damagedOlderGenerations` and loads blocking generations in full for their evidence.
4. `recovery-retract` still requires the named generation to validate in full. A higher orphan whose archive is damaged therefore blocks writing and is not retractable, as before.

## Consequences

- At the same retention, each audit reads two small files per generation instead of the whole generation. Audit cost stays linear but is about eight times lower in the measurement, and it no longer grows with archive size. Pruning or compaction under ADR-018 remains the way to bound it.
- An operator who wants to know whether old generations are intact runs `recovery-inspect`. Writes no longer stop for damage that cannot affect sequence safety, and nothing repairs or deletes such a generation.
- Error classification changes in two narrow cases, and both still block: a tampered older manifest hash now reports `InvalidManifest` before any file comparison, and a higher orphan with a damaged archive reports `HigherReservedSequence` instead of `CorruptGeneration`.
- Rejecting this ADR keeps today's behavior, so the stack it builds on stays independent.
