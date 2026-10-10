# Store late-switch retraction: integration and native acceptance

Date: 2026-10-10. Integrated into `codex/activity-desktop-integration` by Claude after Codex ran out of quota; the owner explicitly assigned integration, the evidence index, PR #28 and native acceptance to Claude for this round. Common baseline `451d70ed245d1a46166bf7d29a941b69cca3f111`. B4/J1 remain partial; B5 inactive.

## What was integrated

The worker branch `claude/activity-producer-followup` was merged without rewriting it, so its commits keep their SHAs:

- `63d17b56d21d4fd26efdbc71a1f861b179b82efd`: the store fix, plus [worker report](Activity-claude-late-switch-2026-10-10.md) and raw reports.
- `1c9cf9fd702ce769168d7bf1bbf90210539d14e4`: the refused-retraction fallback test.

The merge commit is `10a44c3f9e2bc5b4918c5ba0f7f47cff19dcb7a8`. It had no conflicts with the desktop read-sharing follow-up, and no file changed on both sides.

The fix: when the live writer genuinely fails to prepare or replace `CURRENT` after publishing a new generation, it re-reads `CURRENT`. Only then does it rename the never-selected directory back to `.staging-<id>`. A transient sharing refusal on `CURRENT` previously left a published orphan. Recovery then blocked every later new batch (`higher_reserved_sequence`) or receipt (`conflicting_generation`) until an operator reconciled it. Process death and hook interruption still keep the conservative orphan.

## Native acceptance on the desktop

A new `--run-switch-lock` mode in `apps/desktop/e2e/activity-smoke.mjs` uses a fresh synthetic package and Vault. A finite owned helper holds the synthetic `CURRENT` without delete sharing while the actual installed runner performs **Run now**. After release, a second actual run follows.

| Record | Runner | Result |
| --- | --- | --- |
| [Harness revision record](Activity-claude-late-switch/harness-revision-before.json) | old `cb665419…` | **33/38**; one remnant check passed vacuously on the old name, so the check was tightened |
| [Comparable baseline](Activity-claude-late-switch/run-switch-before.json) | old `cb665419…` | **32/38**; the refused run leaves published `g-run-…`, and the next run after release still fails `storage_failed` |
| [Fixed native result](Activity-claude-late-switch/run-switch-native.json) | integrated `ea6b732b…` | **46/46** |

Before and after both report `storage_failed` for the refused run and keep `CURRENT`, high-water 87, public history and Memory reads exact.

In the fixed result:

- The failed run's directory exists only as `.staging-g-run-…`, with sequence-88 pending bytes. Its prepared pointer file is retained.
- The next run is not storage-blocked. It reserves sequence 88 exactly once and keeps it pending, because the stand-in SSH refuses delivery.
- The rest of the existing flow (pause, retry, kill and restart) passes, and the canonical Vault stays exact.

The two existing pause drills now expect the integrated runner's staging-named remnants. The check renamed in each is listed below; their earlier 50/50 and 52/52 records stay valid for the old runner.

| Record | Result | Renamed check |
| --- | --- | --- |
| [Pointer replacement refusal](Activity-claude-late-switch/switch-lock-native.json) | **50/50** | `L.failed_switch_retracts_two_complete_generations_to_staging` |
| [Pointer-creation ACL denial](Activity-claude-late-switch/pointer-create-native.json) | **52/52** | `PC.failed_preparation_retracts_two_complete_generations_to_staging` |

The ACL drill restored the full SDDL. Every original file, `CURRENT`, archive/sequence/pending and the canonical Vault stay exact. Pause and resume succeed after release.

Two further actual-process records use the integrated runner:

- The [actual-action and Core-isolation regression](Activity-claude-late-switch/actions.json) (`--index-isolation`) passes **35/35**.
- The [release-runner hard-kill rehearsal](Activity-claude-late-switch/runner-hard-kill.json) passes **3 cases / 24 checks** with 9 watched processes.

The worker's actual store hard-kill rerun (**23/161**) is linked from the proof unchanged.

## Index and checks

The [hashed proof](Activity-claude-late-switch/proof.json) binds all raw records, the [fresh test record](Activity-claude-late-switch/tests.json) (7 tests), the worker reports, and the identities of the binaries, harness and preparer. Its 50 selectors are linked as follows:

- **C12:** seven Rust tests plus the 11 `RS.` checks.
- **C17:** 15 `L.` and 17 `PC.` checks.

The checker requires those links, re-hashes every raw record, confirms the old-runner baseline recorded the blocked recovery, and adds one negative check. Evidence integrity is now **59 reports / 952 selectors / 61 negative checks**. All 18 rows remain partial, and B4/B5 are false.

Fresh checks on the merged tree, offline:

- Root workspace: fmt, **230 tests** and clippy with warnings denied.
- Desktop: fmt, **35 host + 3 pinned-Core tests** and clippy with warnings denied.
- Frontend: strict TypeScript and **58 frontend tests**.
- Embedded desktop and unsigned NSIS build, and **26/26 installer ownership checks**.
- Domain-boundary guard (**7 negatives**) and Memory integration guard (**8 negatives**).
- Harness syntax and `git diff --check`.

Binary identities used by every new native record:

| Binary | SHA-256 |
| --- | --- |
| Desktop | `ff22aef58fce8709600499646e41f0dd00b79195be00510aca5aaa76e5835977` |
| Unsigned installer | `3344efebfcffcbcc9e4b206ad3a56be2b543d0bf8f4f6dae906008d0bd6e112d` |
| Runner | `ea6b732bc3f4e4c932fca59bc1856351204aad0bfc80cd8da588a21e76d08dbf` |

The desktop source is unchanged since `a289e18`. Its hash differs from the earlier `bfc52c51…` because it was built in a different worktree path, so all current desktop evidence above was recollected on this build.

Clean release builds of identical runner source produced different bytes (`2096d8b9…`, `514f95ec…` and `ea6b732b…`). The proof therefore names the exact frozen runner copy that every package used. The installer was built, not installed, signed or published.

## Remaining

- Process-death orphans for new batches and receipts still require operator reconciliation.
- `CURRENT.<id>.tmp` remnants accumulate across repeated refusals.
- Not exercised: a real scanner or indexer as the holder, disk-full, mid-write power loss, sustained stress, actual logon/power, and real accounts, scheduling, receipts or publication.

No personal Vault/archive, credentials, account, existing or production task, public upload, server, Memory pin or Moriium source was touched. The Moriium checkout was only read, as the copied reference receiver/publisher input of the existing fixture preparer. Temp fixtures are retained.
