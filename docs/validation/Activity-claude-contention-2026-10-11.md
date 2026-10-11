# Activity: five minutes of sustained contention

Date: 2026-10-11. Branch `claude/activity-contention-stress`, stacked on `553d2fafb03197b5d3d9cc62bdfb3add4535fdee` ([PR #33](https://github.com/Morii9961/enouia-runtime/pull/33)). Scope: a development drill with no product change. J1/B4 remain partial and B5 is inactive.

## Gap

C17 lists "sustained rebuild stress and concurrent Activity collection/delivery" as open. Earlier evidence covers single interleavings: busy admission, a run during an open picker, and lock-free reads around one switch. None of it keeps writers, readers and operator commands competing for minutes.

## Drill

[`scripts/claude-activity-contention-stress.mjs`](../../scripts/claude-activity-contention-stress.mjs) copies the six public receiver/publisher/contract files from Moriium `fd48f88c8b480480fd48a8efe36ef400b3be99b8`. It delivers through the marked SSH stand-in and observes with real curl over loopback. One synthetic root imports and publishes a baseline at sequence 51 with `retrySeconds: 1`. Then, for 300 seconds, copies of the release runner `c762ccaa…` run concurrently:

- three writers looping `sync`;
- three readers looping lock-free `overview` and `preview`;
- one operator toggling `set-paused` every four seconds and retrying while the lock is busy;
- one `recovery-inspect` loop.

After the deadline the harness drains the last pending batch and checks the store, the captured wire bytes, the publisher state and the public data.

## Result

The [drill report](Activity-claude-contention/drill.json) passes **26/26**.

| Observation | Count |
| --- | --- |
| Sequences sent | 103 (51–153, contiguous) |
| Observed publications by writers | 102 |
| Writer lock contention (`busy`) | 2,520 |
| Paused writer runs | 354 |
| Lock-free overview / preview reads | 2,505 / 1,431 |
| Pause toggles that won the lock / busy retries | 19 / 489 |
| Recovery inspections (writable / busy) | 52 / 326 |
| Generation directories at the end | 227 |

The invariants held throughout:

- Every invocation printed one JSON result, with no stderr and no private path.
- No state outside the expected set appeared.
- No reader saw the reservation decrease or a pending sequence above it.
- Every inspection found the root writable.
- Each sequence went out with exactly one byte sequence, and the sent sequences are contiguous up to the final reservation.
- The publisher holds that reservation.
- Published history keeps every baseline date.
- The final root has no orphan and exports the same reservation with no pending batch.
- The reference files were unchanged.

One finding concerns operations rather than correctness. The writer lock is try-once and has no queue, so a manual pause can be starved by back-to-back runs: 489 busy answers for 19 successful toggles. The real schedule runs hourly, and the desktop already reports `busy`, so no product change is made. Repeated manual actions during a run will see `busy` until the run ends.

A 30-second trial with the first harness version stopped on its own check: pause toggles that tried only once never won the lock. The harness now retries the toggle until it wins, and the trial then passed 26/26. That trial was preparation and is not committed evidence.

The [hashed proof](Activity-claude-contention/proof.json) binds the report and its observations. The C17 row links its 26 selectors, and a new negative check refuses removing them. Index: **75 reports / 1,431 selectors / 83 negative checks**. All rows remain partial.

| File | SHA-256 |
| --- | --- |
| `drill.json` | `24d84bca535938100628129631a2a0bda39773e44223cac71ce54769bd81432c` |
| `proof.json` | `bc62726268965360a5ad8574a13f036c37e91c425a53b2d09e9a96c2d04bf53b` |

## Limits

The drill used one synthetic root, the SSH stand-in and absent collectors, so every batch carries three failed sources with retained history. The following did not run during contention:

- a Memory index rebuild;
- process kills;
- disk-full or power loss;
- real SSH, a scheduler or a deployed publisher.

C17's rebuild-stress half remains open. No personal data, account, credential, task, live delivery or deployment was involved.
