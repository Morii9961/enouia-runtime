# Activity: random process kills during delivery

Date: 2026-10-11. Branch `claude/activity-kill-chaos`, stacked on `4e032d40b20db872515419b66f60aa7fa93787bd` ([PR #34](https://github.com/Morii9961/enouia-runtime/pull/34)). Scope: a development drill with no product change. J1/B4 remain partial and B5 is inactive.

## Gap

Earlier process-death evidence kills an owned writer at fixed store boundaries ([store hard kill](B4-store-hard-kill.md), [orphan reconciliation](Activity-claude-orphan-reconcile-2026-10-11.md)). It does not kill complete runs at arbitrary moments: during collection, commit, SSH transport, receipt or public observation, while other invocations compete.

## Drill

[`scripts/claude-activity-kill-chaos.mjs`](../../scripts/claude-activity-kill-chaos.mjs) uses copied receiver/publisher files from Moriium `fd48f88c8b480480fd48a8efe36ef400b3be99b8`, the marked SSH stand-in and real curl observation over loopback. It follows the production split recorded in Moriium's operations notes:

- The SSH session runs only the receiver, as the `restrict,command=` key does.
- The real publisher runs on its own sequential server timer, which is never killed.
- A server operator removes a receiver or publisher lock only after the PID recorded in it no longer exists. This models the manual step in Moriium's `status-store.mjs`.

For 300 seconds, two writers loop the release runner `c762ccaa…` `sync`. Each run is killed with 60% probability: half of the kills land 20–300 ms in, near collection and commit, and half land 300–2,500 ms in, during delivery. Killing the runner ends its job, including the SSH stand-in and any in-flight receiver. Two lock-free readers loop `overview`. A recovery operator acts whenever a run reports `storage_failed`. It inspects, proves from the captured wire bytes that each blocking batch was never sent, and retracts it.

## Result

The [drill report](Activity-claude-kill-chaos/drill.json) passes **26/26**.

| Observation | Count |
| --- | --- |
| Runs killed mid-flight | 142 |
| Sequences sent | 101 (51–151, contiguous, one byte sequence each) |
| Observed publications by surviving runs | 100 |
| Surviving runs left `delivery_unresolved`, later observed | 47 |
| Writer lock contention (`busy`) | 1,796 |
| Store orphans / retractions | 0 / 0 |
| Server publisher runs / Windows rename failures | 281 / 98 |
| Abandoned receiver locks removed by the server operator | 1 |
| Abandoned publisher locks | 0 |

The invariants held:

- Every surviving invocation printed one JSON result, with no stderr and no private path.
- No reader saw the reservation go back or a pending sequence above it.
- Each sent sequence carries exactly one byte sequence, and the sequences are contiguous to the final reservation.
- The last pending batch drained to an observed publication, and the publisher holds the reservation.
- Published history keeps every date.
- The final root has no orphan and exports cleanly.

### Findings

**An abandoned receiver lock.** One kill landed inside the few milliseconds during which `status-receive.mjs` holds `receive.lock`. Every later receive failed until the lock was removed. Runtime behaved as designed throughout: it reported `delivery_unresolved`, kept the exact pending bytes, retried at each eligibility time and never claimed publication. It recovered once the server operator cleared the lock. In this sandbox the job kill reaches the receiver directly. Whether sshd ends the remote receiver when a production client disconnects mid-session is not established here. Moriium's fail-closed lock still needs the manual removal its comment describes. This is the receiver-side counterpart of C16's open "abandoned-lock reconciliation" and belongs to Moriium.

**Rename failures on Windows.** The 98 publisher failures are all the same Windows error, `EPERM` renaming `current.json.<tmp>` over `current.json`, while the loopback server had the file open for curl. The publisher released its lock each time and succeeded on a later tick. Linux, where Moriium is deployed, allows that rename, so this is an artifact of the Windows host.

**No orphan from random kills.** None of the 142 random kills landed in the microsecond window between publishing a generation and replacing `CURRENT`, so the operator never had to retract. The deterministic drill remains the evidence for that path.

An earlier attempt ran the publisher inside the SSH session, as the stand-in does by default. There, a kill abandoned `publisher.lock`, and draining failed with inbox 91 against publisher 90. That reproduced the same fail-closed lock on the publisher side, but production does not run the publisher in the session, so the harness was corrected and that attempt is not committed evidence. A 60-second and two 120-second trials preceded the final run.

The [hashed proof](Activity-claude-kill-chaos/proof.json) binds the report. C12 links its 26 selectors, and a new negative check refuses removing them. Index: **76 reports / 1,457 selectors / 84 negative checks**. All rows remain partial.

| File | SHA-256 |
| --- | --- |
| `drill.json` | `f8a528e927beddba606a4ce99586ecf6ed02048b31eabaf6f1e1be3f6de4af94` |
| `proof.json` | `31e070e12bb86d033037d8a6ff2d0c94f4e06ce8334845605d96899dc3459cbd` |

## Limits

The drill used one synthetic root, absent collectors and the SSH stand-in, not real SSH or sshd. The server operator's lock removal is a harness model of Moriium's manual step. The drill did not cover disk-full, power loss or a deployed publisher. No personal data, account, credential, task, live delivery or deployment was involved.
