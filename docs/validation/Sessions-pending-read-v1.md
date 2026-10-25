# Sessions smoke: pending branch read (2026-10-18)

The native `--sessions-only` smoke mode stopped at 5/6 with `run timeout: newer session B detail delivered`. It failed the same way on main `07584cb`, on the Memory pin branch `ea63ca4`, and on `372d6d1` before the pin moved to Memory `56bc5eb`. The Memory pin was therefore not the cause.

## Cause

The mode was written on 2026-10-06 (`e03894b`). It holds session A's detail reply, selects session B while A is pending, and waits for B to become editable. At that time the branch rows were disabled only during a Sessions write.

`ef5d2cd` (2026-10-12) changed the rows to the surface's combined `busy` state so Provider work stays attached to its branch. That state also covers the detail read, so the rows became disabled while any branch read runs. The smoke's click on B landed on a disabled button, which does not dispatch, and B was never read.

Later work adopted the disabled rows on purpose. `1ed3eca` asserts `pending_branch_read_disables_filter_and_rows` in the `session-id-filter` journey, and [Session selection focus](Session-selection-focus-v1.md) (`e31b19a`) returns focus after a read because the disabled row loses it. Re-enabling the rows during a read made both journeys fail, so the product behavior stays as it is and the smoke mode was out of date.

## Change

Only `apps/desktop/e2e/memory-smoke.mjs` changes. While A's reply is held, the mode now checks that every branch row is disabled and that clicking B keeps B selected. After the reply is released it waits for A, checks that A's unsent drafts return, then selects B again and checks B's drafts. The checks for the held answer receipt, the saved transcript, the provisional checkpoint and the return to A are unchanged. `older_detail_cannot_replace_selection` and `older_detail_cannot_replace_drafts` are gone, because a second selection can no longer start during a read. The `--sessions-only` description in [Memory integration v1](../MEMORY_INTEGRATION_v1.md) now says this.

## Checks

The product source equals main `b8254d8`.

| Check | Result |
|---|---|
| `npm run check`, `npm test` | Passed: 98 Node tests, 58/58 DOM fixtures. |
| `npm run desktop:build` | `enouia-desktop.exe`, SHA-256 `2cff35d81d600cec302d10fb9171abdbc4cad8a51b780cd2327995e84db933b1`. |
| [`--sessions-only`](Sessions-pending-read/memory-sessions-only.json), two runs on fresh synthetic Vaults | 21/21 both times. |
| [Previous mode on `372d6d1`](Sessions-pending-read/memory-sessions-only-before.json) | 5/6, the timeout above. |

In one standalone run, the unrelated `operation-cancel` DOM fixture failed `restarted_observation_reaches_terminal` once in three tries. It passed inside the full `npm test` run, and this change does not touch it.

| File | SHA-256 (LF bytes) |
|---|---|
| `memory-sessions-only.json` | `4471a35656f17af842253c243c0a001c6d9dc9ffd1e369b7a8e44aaeaadaa911` |
| `memory-sessions-only-before.json` | `a702148cf12259665b2545782c07ccf607bd0162b45f6536391a7fda06ab8f3b` |

All data is synthetic. No personal Vault, credential, real Provider request, installer or deployment was involved.
