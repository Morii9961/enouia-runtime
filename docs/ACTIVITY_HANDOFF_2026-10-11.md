# Activity handoff — 2026-10-11

This is the latest state of Runtime's Activity work. It supersedes the "current state" notes in the [2026-10-10 Codex handoff](ACTIVITY_CODEX_NEXT_SESSION_2026-10-10.md) and the [Claude handoff](ACTIVITY_CODEX_TO_CLAUDE_2026-10-10.md). Re-check branches and PRs live before acting.

## Merged today

- [PR #30](https://github.com/Morii9961/enouia-runtime/pull/30) moved the Memory MV-7 pin to `8186aed861af08cf7a2c5d8c912a24eae51b4d66`.
- [PR #29](https://github.com/Morii9961/enouia-runtime/pull/29) brought in Codex's Activity desktop hardening. The owner chose "take over and merge", so Claude merged main into the branch, reran every desktop check and native smoke on the merged build ([record](validation/Activity-claude-pr29-merge-2026-10-11.md)), and merged it. main is `a07291e4d89ec416d81cd02566d36226ce8a6bf6`.

## Open stack, waiting for the owner to merge

Each PR is based on the one before it. Merge them in this order, retargeting each to `main` after its parent merges. Auto mode does not let Claude merge its own PRs.

| PR | Branch | Content |
| --- | --- | --- |
| [#31](https://github.com/Morii9961/enouia-runtime/pull/31) | `claude/activity-orphan-reconcile` | `recovery-inspect` / `recovery-retract` for process-death orphans; C12 +88 selectors |
| [#32](https://github.com/Morii9961/enouia-runtime/pull/32) | `claude/activity-pending-abandon` | ADR-033 `pending-abandon` (optional `--reserve-through`); overview drops `observed` for a receipt older than an abandonment; C14/C15 |
| [#33](https://github.com/Morii9961/enouia-runtime/pull/33) | `claude/activity-runbook-recovery` | Migration runbook uses both commands (docs only) |
| [#34](https://github.com/Morii9961/enouia-runtime/pull/34) | `claude/activity-contention-stress` | 300-second contention drill, 26/26; C17 |
| [#35](https://github.com/Morii9961/enouia-runtime/pull/35) | `claude/activity-kill-chaos` | 300-second random-kill drill, 26/26; C12; this handoff |

After the stack, the evidence index stands at **76 reports / 1,457 selectors / 84 negative checks**. All 18 rows are partial, B4 is not signed off and B5 is inactive. The workspace runs 243 tests. Producer IPC v1 fields, the desktop and the Memory pin are unchanged by the stack.

## Findings to pass on

- **Moriium receiver lock.** A kill inside the few milliseconds during which `status-receive.mjs` holds `receive.lock` leaves the lock abandoned. Every later receive then fails until someone removes the lock by hand. The kill drill hit this once in 142 kills. Runtime kept the exact pending bytes and retried as designed. Whether sshd ends the remote receiver when a production client disconnects is not established. This belongs to Moriium, which Runtime must not change. Morii may want an operations note or stale-lock detection there.
- **Try-once writer lock.** Back-to-back runs can starve manual actions such as a pause: 489 busy answers for 19 toggles under continuous contention. The real schedule is hourly and the desktop reports `busy`, so nothing was changed.
- **Windows rename and open readers.** The copied publisher's `current.json` rename fails with `EPERM` while a Windows reader holds the file open. This is a host artifact; the Linux deployment is unaffected.

## Next candidates

Runtime work that needs no new authorization is nearly exhausted. Possible bounded items:

- Desktop surfacing of recovery and abandonment guidance. This touches the desktop and the IPC contract, which are Codex's area, so coordinate first.
- A bounded lock wait for operator commands, such as `set-paused --wait-seconds`, if starvation matters in practice.
- Writing the abandonment record before the commit, so a kill between the two cannot lose the convenience copy. The store's `pendingAbandoned` and the older generation already keep the evidence.

Everything else open on the B4 rows needs the owner's authorization:

- real accounts and seeds (O1/O4);
- real SSH, the deployed publisher and the About pages;
- disk-full and power loss;
- production cutover (B5).

Desktop rebuild stress during Activity contention needs native UIA/CDP drills scheduled when the desktop is free.
