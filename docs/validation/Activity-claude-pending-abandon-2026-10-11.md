# Activity: abandoning a refused pending batch (ADR-033)

Date: 2026-10-11. Branch `claude/activity-pending-abandon`, stacked on the orphan reconciliation commit `5cc1be3611660af923a0caffe0bf428b8294f142` ([PR #31](https://github.com/Morii9961/enouia-runtime/pull/31)). Scope: the Activity store, runner and IPC overview, verified with synthetic roots and copied public Moriium receiver/publisher files. J1/B4 remain partial and B5 is inactive.

## Gap

A pending batch blocks collection until its exact data is observed published. The [C15 regression run](B4-reference-regression.md) left two cases open:

- **A refused batch.** The publisher refuses it as a history regression and reports `degraded`. Runtime retries the same bytes forever.
- **A remote high-water at or above the batch.** The receiver ignores the batch while exiting 0 (C14), so publication is never observed.

ADR-015 already allowed an operator to reconcile from server evidence, but nothing implemented it. Editing the store by hand was the only way out.

## Change

[ADR-033](../adr/033-operator-pending-abandonment.md) records the decision.

- **Writer.** `commit_pending_abandoned` requires a paused store, the current pending batch's exact sequence and SHA-256, and a reservation no lower than the current one.
  - It keeps the archive. It keeps the current reservation, or moves it to `reserved_through` when given. A migration import may have set the reservation above the pending sequence, and the default keeps it.
  - It clears the pending batch and retry state, and records `pendingAbandoned` in `delivery.json`.
  - The transition rule accepts pending → none only with publication evidence or this matching record.
  - Later same-sequence commits must keep the record, alongside the publication receipt and outcomes.
- **Validation and audit.** Generation validation bounds the record: positive sequence, sequence ≤ `reservedThrough` ≤ highest reserved, valid hashes and time, the fixed reason, and any later pending sequence above `reservedThrough`. The recovery audit accepts an older generation that holds the abandoned bytes at the same reservation.
- **Command.** `pending-abandon --sequence N --pending-sha256 HEX --confirm-refused true [--reserve-through M]` commits first. It then writes `reconciliations/abandon-<N>.json` and an exact copy of the bytes as `abandon-<N>-pending.json`. `diagnostics` shows the latest abandonment.
- **Overview.** A receipt older than a recorded abandonment no longer reports `observed`; the state becomes `idle`. The [ADR-030](../adr/030-production-activation-path.md) enable gate requires `observed`, so it cannot pass on a publication observed before an abandoned batch. Receipts without an abandonment keep their state, so a migrated batch published below a higher reconciled high-water still reads `observed`. No IPC field was added.

Documentation: `docs/ACTIVITY_RUNNER.md` (procedure), the ADR register and the migration runbook's pending step.

## Results

The [test record](Activity-claude-pending-abandon/tests.json) has 7/7 passing tests:

- **Store** (4 tests):
  - Refusals: unpaused, stale generation, other bytes, another sequence, a lower reservation.
  - The exact archive is kept, audit acceptance holds, and sequence 1 cannot be reserved again.
  - `reserve_through` 7 leads to next sequence 8.
  - Same-sequence commits cannot drop the record, and pause/resume keep it alongside the earlier receipt.
  - Eight generation-validation bounds are checked.
- **Copied runner executable** (2 tests):
  - Argument, confirmation, pause and hash refusals; the record and exact byte copy; diagnostics; the overview reporting `idle`; the next sync at 61 after `--reserve-through 60`; a legacy export carrying 61.
  - An imported pending 42 under a reconciled high-water 50, abandoned without `--reserve-through`, keeps 50 and leads to 51.
- **Runner** (1 test): after a real observed publication of 43, an abandoned 44 makes the overview report `idle`. The receipt for 43 stays visible.

The [reference drill](Activity-claude-pending-abandon/drill.json) passes **27/27**. It uses the copied receiver/publisher at Moriium `fd48f88c8b480480fd48a8efe36ef400b3be99b8`, the marked SSH stand-in and real curl observation over loopback.

- **Remote ahead (C14).** Another root publishes sequence 60. The local pending 52 is transported once, and the receiver keeps 60 and its public hash. The stuck batch blocks collection. Abandonment is refused while the store runs and for other bytes. After pausing, the confirmed abandonment with `--reserve-through 60` reports next sequence 61 and keeps the record and an exact copy. After resuming, the overview reports `idle`. The next sync on the same root sends 61, which is published and observed. Diagnostics show the abandonment and no pending batch.
- **Archive regression (C15).** A baseline 51 is published, and a date-loss 52 is refused (`degraded`). Abandoning it keeps 52 consumed. The next sync's 53 carries the same archive and is still refused. This records the limit stated in ADR-033: abandonment does not repair data.

Both runs restored the reference files unchanged, and every HTTP request stayed on the isolated status paths.

The [hashed proof](Activity-claude-pending-abandon/proof.json) binds the tests, the drill and the release runner `c762ccaa39f29fca9137909e0b6a5874df98fc27655486711d5b65353dd4c735`.

A self-review before merging found two flaws in the first version, and both were fixed before this evidence was recorded:

- The default reservation was the pending sequence, so a migrated store with a higher high-water reported `pending_mismatch`.
- The `observed` rule required the receipt to equal the highest reserved sequence, which would have turned a migrated publication below a higher high-water into `idle` and blocked B5 Stage 4.

Additional checks with Rust 1.98.1 GNU, UCRT64 first on PATH, offline:

- `cargo fmt --all -- --check`
- `cargo test --locked --workspace`: 243 passed.
- `cargo clippy --locked --workspace --all-targets -- -D warnings`
- `node scripts/check-activity-evidence.mjs --self-test`
- `git diff --check`

The evidence index now has **74 reports / 1,405 selectors / 82 negative checks**. C15 links 34 selectors, and C14 shares the 16 for remote-ahead and reservation. Two new negative checks refuse removing either link. All 18 rows remain partial.

The first drill attempts failed in the harness itself, not in the product. The SSH stand-in needs a `traces` directory, which the first version did not create. The runner reported `delivery_unverified` with `transportCompleted: false` until the directory was added.

Raw file hashes (LF bytes):

| File | SHA-256 |
| --- | --- |
| `tests.json` | `9dd18e01ed626f88611205b62b9bedc7b7e5712d4b60a2b81880ba90bd84d2b3` |
| `drill.json` | `5ff665e36450b1ca08d4260506c81f779d1533a586d7c335d81cdf23ed8be24f` |
| `proof.json` | `49228c3f433bd2a7f51a9346b73c1774e3704bdd32734e3b18ab9cf6a0f35b65` |

## Limits

The harness supplies the operator's confirmation itself. Real use needs server evidence of the refusal or of the remote high-water, obtained through Moriium operations. The following remain open:

- the deployed publisher, static cache and About pages;
- real SSH;
- archive reconciliation, which abandonment does not perform.

No personal data, account, credential, scheduled task, live delivery, installation or deployment was involved.
