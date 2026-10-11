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
  - It keeps the archive and moves the reservation to `reserved_through`.
  - It clears the pending batch and retry state, and records `pendingAbandoned` in `delivery.json`.
  - The transition rule accepts pending → none only with publication evidence or this matching record.
  - Later same-sequence commits must keep the record, alongside the publication receipt and outcomes.
- **Validation and audit.** Generation validation bounds the record: positive sequence, sequence ≤ `reservedThrough` ≤ highest reserved, valid hashes and time, the fixed reason, and any later pending sequence above `reservedThrough`. The recovery audit accepts an older generation that holds the abandoned bytes at the same reservation.
- **Command.** `pending-abandon --sequence N --pending-sha256 HEX --confirm-refused true [--reserve-through M]` commits first. It then writes `reconciliations/abandon-<N>.json` and an exact copy of the bytes as `abandon-<N>-pending.json`. `diagnostics` shows the latest abandonment.
- **Overview.** The delivery state is `observed` only when the last observed publication equals the highest reserved sequence; otherwise it is `idle`. The [ADR-030](../adr/030-production-activation-path.md) enable gate requires `observed`, so it cannot pass on a publication observed before an abandoned batch. No IPC field was added.

Documentation: `docs/ACTIVITY_RUNNER.md` (procedure), the ADR register and the migration runbook's pending step.

## Results

The [test record](Activity-claude-pending-abandon/tests.json) has 6/6 passing tests:

- **Store** (4 tests):
  - Refusals: unpaused, stale generation, other bytes, another sequence, a lower reservation.
  - The exact archive is kept, audit acceptance holds, and sequence 1 cannot be reserved again.
  - `reserve_through` 7 leads to next sequence 8.
  - Same-sequence commits cannot drop the record, and pause/resume keep it alongside the earlier receipt.
  - Eight generation-validation bounds are checked.
- **Copied runner executable** (1 test): argument, confirmation, pause and hash refusals; the record and exact byte copy; diagnostics; the overview reporting `idle`; the next sync at 61 after `--reserve-through 60`; a legacy export carrying 61.
- **Runner** (1 test): after a real observed publication of 43, an abandoned 44 makes the overview report `idle`. The receipt for 43 stays visible.

The [reference drill](Activity-claude-pending-abandon/drill.json) passes **27/27**. It uses the copied receiver/publisher at Moriium `fd48f88c8b480480fd48a8efe36ef400b3be99b8`, the marked SSH stand-in and real curl observation over loopback.

- **Remote ahead (C14).** Another root publishes sequence 60. The local pending 52 is transported once, and the receiver keeps 60 and its public hash. The stuck batch blocks collection. Abandonment is refused while the store runs and for other bytes. After pausing, the confirmed abandonment with `--reserve-through 60` reports next sequence 61 and keeps the record and an exact copy. After resuming, the overview reports `idle`. The next sync on the same root sends 61, which is published and observed. Diagnostics show the abandonment and no pending batch.
- **Archive regression (C15).** A baseline 51 is published, and a date-loss 52 is refused (`degraded`). Abandoning it keeps 52 consumed. The next sync's 53 carries the same archive and is still refused. This records the limit stated in ADR-033: abandonment does not repair data.

Both runs restored the reference files unchanged, and every HTTP request stayed on the isolated status paths.

The [hashed proof](Activity-claude-pending-abandon/proof.json) binds the tests, the drill and the release runner `129aab474d55e137e48f67f2b3c4f93f901b32f6a7d0d2044d2cf904ea7b8fe4`.

Additional checks with Rust 1.98.1 GNU, UCRT64 first on PATH, offline:

- `cargo fmt --all -- --check`
- `cargo test --locked --workspace`: 242 passed.
- `cargo clippy --locked --workspace --all-targets -- -D warnings`
- `node scripts/check-activity-evidence.mjs --self-test`
- `git diff --check`

The evidence index now has **74 reports / 1,404 selectors / 82 negative checks**. C15 links 33 selectors, and C14 shares the 16 for remote-ahead and reservation. Two new negative checks refuse removing either link. All 18 rows remain partial.

The first drill attempts failed in the harness itself, not in the product. The SSH stand-in needs a `traces` directory, which the first version did not create. The runner reported `delivery_unverified` with `transportCompleted: false` until the directory was added.

Raw file hashes (LF bytes):

| File | SHA-256 |
| --- | --- |
| `tests.json` | `ac407be319a0f65fa743a0a6fbb1628ea6752881ebfbd06e7096ae3751917325` |
| `drill.json` | `b45b3c9d0925de39d29be5f65af0cd8f9050f8795effb911159f989835af4bdd` |
| `proof.json` | `665470fb16ec23418ce6264755f01657dbd3e4b3a01d70ba889342e8ef3ee1f2` |

## Limits

The harness supplies the operator's confirmation itself. Real use needs server evidence of the refusal or of the remote high-water, obtained through Moriium operations. The following remain open:

- the deployed publisher, static cache and About pages;
- real SSH;
- archive reconciliation, which abandonment does not perform.

No personal data, account, credential, scheduled task, live delivery, installation or deployment was involved.
