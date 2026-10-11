# Activity: reconciling generations left by process death

Date: 2026-10-11. Branch `claude/activity-orphan-reconcile`, based on main `a07291e4d89ec416d81cd02566d36226ce8a6bf6`. Scope: Activity store and runner, verified with synthetic temporary roots. J1/B4 remain partial and B5 is inactive.

## Gap

The writer publishes `generations/<id>` before it prepares `CURRENT.<id>.tmp` and replaces `CURRENT`. Since the [late-switch fix](Activity-claude-late-switch-2026-10-10.md), a live writer that sees its own pointer write fail retracts the directory itself. Process death cannot run that step. The [hard-kill rehearsal](B4-store-hard-kill.md) shows the result: termination after publication but before the switch leaves a published orphan, and the [recovery audit](B2.1-recovery-audit.md) blocks every later commit with `higher_reserved_sequence` or `conflicting_generation`. The block is deliberate, because local files cannot rule out a rolled-back pointer. The producer then stopped for good. The runbook asked for operator reconciliation, but no command performed it. The only way out was editing the store by hand. A Windows shutdown that terminates a scheduled run at the wrong moment is enough to cause this.

## Change

Two runner commands act on the audit's own classification. The audit policy is unchanged.

`recovery-inspect` holds the writer lock and changes nothing. It reports `CURRENT`'s id, manifest hash, reservation and pending sequence, plus the following for each blocking generation:

- its standing;
- its raw manifest hash;
- its reservation, pending sequence and pending hash;
- `preparedPointer`.

`preparedPointer` is `exact` when `CURRENT.<id>.tmp` still holds that pointer. A completed switch consumes the file, so `exact` shows that this prepared pointer never replaced `CURRENT`. `absent` makes no such claim.

`recovery-retract` requires the generation id, the exact manifest hash from inspection and `--confirm-never-selected true`. It acts only on a validated generation with a higher reservation or a same-sequence conflict. It refuses `CURRENT`, older generations, absent and corrupt generations, a mismatched hash and an occupied staging name. On success it moves the directory to `generations/.staging-<id>`, which the audit already ignores. It writes `reconciliations/retract-<id>.json` with the evidence it acted on and reports whether writing is allowed again. Nothing is deleted, and `CURRENT` and the prepared pointer stay as they were.

The confirmation is the operator's judgment, not machine evidence. The [runner documentation](../ACTIVITY_RUNNER.md#reconciling-a-generation-left-by-process-death) lists what to check first: no restore or manual pointer edit, and for a higher reservation, no receiver or public acceptance of that sequence.

Changed files:

- `crates/enouia-activity-store/src/recovery.rs`: `inventory_generations` classifies every published directory. `audit_generations` now derives from it and keeps the same blocking errors. It reads every directory before reporting a blocker, where it used to stop at the first one.
- New `crates/enouia-activity-store/src/reconcile.rs`: inspection and retraction under the writer lock.
- `crates/enouia-activity-store/src/{lib,reader,writer}.rs`: module export, a crate-visible manifest limit and a non-replacing write-through rename helper.
- `crates/enouia-activity-runner/src/cli.rs`: the two commands, argument checks before locking, and outputs without paths.
- New `crates/enouia-activity-store/tests/orphan_reconcile.rs`, two new tests in `crates/enouia-activity-runner/tests/cli.rs`, the new drill `scripts/claude-activity-orphan-reconcile.mjs`, and `docs/ACTIVITY_RUNNER.md`.

The writer, transition rules, generation validation, IPC/protocol, desktop, manifest/lock and Memory pin are unchanged.

## Results

The [test record](Activity-claude-orphan-reconcile/tests.json) holds 6/6 passing tests:

- Four store tests use hook interruptions, which run no cleanup, at both publication boundaries. Inspection changes no byte. Retraction keeps every orphan byte under the staging name and adds exactly one record. The next commit reserves sequence 1. A same-sequence receipt orphan retracts, and the acknowledgment is recorded afterwards. Every refusal leaves the root unchanged. Retracting one of two blockers stays unwritable.
- Two tests run a copied runner executable. They cover argument, confirmation, hash and lock refusals, check that the record and the output agree, refuse a repeated retraction, and show the next sync committing sequence 51. They also check that `--help` lists both commands.

In the [actual-termination drill](Activity-claude-orphan-reconcile/drill.json) (**82/82**), owned crash-writer children are forcibly killed after `generation_published` and `current_prepared`, for both a new batch and an acknowledgment receipt. In each case the real runner does the following:

- `sync` stays `storage_failed` and changes no file.
- Inspection reports one orphan with the matching manifest hash, `preparedPointer` `exact` or `absent` as expected, and no private path.
- Missing confirmation, a false confirmation and a mismatched hash are refused without changes.
- The confirmed retraction makes the root writable, retains every byte under the staging name and writes a matching record. A repeat is refused.
- The store audit passes with the original next action.
- A delivery-disabled `sync` proceeds. A new batch reserves sequence 1, and an acknowledgment orphan keeps retrying the original pending bytes.

No old-build drill was run. Before this change the runner had no recovery command, and the [hard-kill rehearsal](B4-store-hard-kill.md) records these four boundaries as blocking with no way to resume except editing the store by hand.

[Hashed proof](Activity-claude-orphan-reconcile/proof.json) binds the tests and the drill. The runner is `3c7a8b3d5454132054e4f617d69ee8aecf348a83431677e5d2be05e47c5c74ad` and the crash writer `5922082a7b660236edc6297c9341c57f9f53d7b59b6a113703d3665784ceafb7`. Both are release builds from this branch.

Additional checks with Rust 1.98.1 GNU, UCRT64 first on PATH, offline:

- `cargo fmt --all -- --check`
- `cargo test --locked --workspace`: 236 passed.
- `cargo clippy --locked --workspace --all-targets -- -D warnings`
- `node scripts/check-activity-evidence.mjs --self-test`
- `git diff --check`

The evidence index now has **73 reports / 1,355 selectors / 80 negative checks**. The C12 row links all 88 new selectors, and a new negative check refuses removing them. All 18 rows remain partial.

Raw file hashes (LF bytes):

| File | SHA-256 |
| --- | --- |
| `drill.json` | `b5574b454f2629f6c5885be701f4e86a63705e9c3224051de2b4d6c7301b33b6` |
| `tests.json` | `4623ebb4a272c95f92764d0d3784238cb8d03e2ab88d5b76c49b749cd1ee604d` |
| `proof.json` | `61f1d3ff80b1aed2f9dc68acd26c3a8a8737b2158fbbb046068657d5c894b806` |

## Limits

The harness supplies the confirmation itself. It does not show that any real orphan was never selected or delivered. The following remain manual or unverified:

- corrupt generations and interrupted first imports, which remain manual;
- disk-full, power loss and hardware failure;
- a real receiver's high-water check before retraction.

No personal data, account, credential, scheduled task, live delivery, installation or deployment was involved.
