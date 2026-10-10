# Activity store: retryable pointer failure after generation publication

Date: 2026-10-10. Branch `claude/activity-producer-followup`, based on the shared handoff commit `451d70ed245d1a46166bf7d29a941b69cca3f111` (contains both 2026-10-10 handoffs; `a289e18` is an ancestor). Scope: Activity store writer only, verified with synthetic temporary roots. B4/J1 remain partial; B5 stays inactive. This report is a worker deliverable and is not yet linked into the public evidence index or counts.

## Gap

The writer publishes `generations/<id>` before it prepares `CURRENT.<id>.tmp` and replaces `CURRENT`. The [recovery audit](B2.1-recovery-audit.md) treats any fully published, unselected generation as possibly selected in the past. A higher reserved sequence then blocks with `higher_reserved_sequence`, and a same-sequence pending difference blocks with `conflicting_generation`. That is the right call after process death, which the [hard-kill rehearsal](B4-store-hard-kill.md) covers. It also fired after ordinary in-process I/O failures, where the live writer still holds the lock and knows `CURRENT` never named the directory.

Earlier native drills ([pointer switch](Activity-pointer-switch-2026-10-09.md), [pointer creation ACL](Activity-pointer-create-acl-2026-10-09.md)) covered only pause commits. Pause orphans differ only in delivery, which the audit permits. The same failures on a new pending batch or an acknowledgment receipt were not covered.

Baseline reproduction at `451d70e` (raw output in the test report below):

- A reader holding `CURRENT` with read sharing but no delete sharing makes `MoveFileExW` refuse the replacement for a new sequence-1 batch. After the handle is released, `decide_run_start` returns `Recovery(HigherReservedSequence)`.
- An entry already occupying the temporary pointer name refuses its creation. The result is the same `HigherReservedSequence`.
- The same refusal on an acknowledgment receipt commit leaves `Recovery(ConflictingGeneration)`, so the observed publication can never be recorded.
- At the runner level, a `run_locked` sync whose commit is refused returns `storage_failed`. The next sync, with no refusal present, also returns `storage_failed`, and so would every later one, until an operator reconciles manually.

A transient Windows sharing refusal on `CURRENT` (for example a scanner or indexer briefly opening it) therefore turned into a permanent producer stop.

## Fix

`write_generation` now handles a genuine error from temporary pointer creation or from the pointer replacement in `retract_unselected`. That function re-reads `CURRENT` with the existing bounded, reparse-safe reader. It renames the new directory back to `generations/.staging-<id>` only if all of these hold:

- `CURRENT` does not name the new generation, or is absent (bootstrap).
- `CURRENT` was read without any other error.
- The staging name is free.

Nothing is deleted. The prepared temporary pointer, if any, stays in place. If the read is doubtful or the rename fails, the conservative orphan remains, as before. The original error is still returned, so callers still report `storage_failed`.

The following are unchanged:

- Hook interruptions, which stand in for process death and run no cleanup.
- Recovery and audit policy, the reader, and generation validation.
- The transition rules, the runner, and the IPC/protocol.
- The workspace manifest and lock.

The legacy import still refuses any root with existing entries.

Changed files:

- `crates/enouia-activity-store/src/writer.rs`
- `crates/enouia-activity-store/src/reader.rs`: `MAX_CURRENT_BYTES` becomes `pub(crate)`.
- New `crates/enouia-activity-store/tests/late_switch_failure.rs`
- New `crates/enouia-activity-runner/tests/late_switch.rs`

## Results

The [raw test report](Activity-claude-late-switch-tests-2026-10-10.json) records:

- **Store baseline:** 1/5 passed, exit 101. The passing test is the control that keeps hook-simulated death conservative.
- **Runner baseline:** 0/1, exit 101. The second sync was `storage_failed`.
- **Fixed store crate:** 54/54, including the 5 new tests.
- **Fixed runner test:** 1/1.

With the fix, each refused commit fails once:

- The selected `CURRENT`, the reserved high-water and every prior file keep their exact bytes.
- The only additions are the retracted `.staging-<id>` directory and the prepared temporary pointer.
- The next commit reserves the same sequence with identical pending bytes, or records the same receipt.
- The next runner sync reserves sequence 43.

The [actual-process hard-kill rerun](Activity-claude-late-switch-hard-kill-2026-10-10.json) used a fresh `crash_writer` build with the fixed writer. It passes **23/161**, with the same four blocking orphans as the original rehearsal. Forced termination therefore still leaves the fail-closed state.

Additional checks run in this worktree, Rust 1.98.1 GNU with UCRT64 first on PATH, offline:

- `cargo fmt --all -- --check`
- `cargo test --workspace`: 229 passed.
- `cargo clippy --workspace --all-targets -- -D warnings`
- `git diff --check`

Raw report hashes (LF bytes):

| File | SHA-256 |
| --- | --- |
| `Activity-claude-late-switch-tests-2026-10-10.json` | `ac4a639b1aba9c7fb87b9dd174681dbaf8dd1bb32012269b7a3c94fcc2ef01ca` |
| `Activity-claude-late-switch-hard-kill-2026-10-10.json` | `77a037a9fb95c64ce3854b11b1ad21cb2f6b971f2e62de050c2ca3de749c3fde` |

Product file hashes (LF bytes):

| File | Baseline | Fixed |
| --- | --- | --- |
| `writer.rs` | `d5403174143395295f328c79c0742eb9afc1782897e17793f9caac31c42047f2` | `864e158f43b7a1266ec9db4c2bae17e850a1d6926afe27e5f0d1fad6fa3bc480` |
| `reader.rs` | `c7d72d5ce3550af5188b3a4ce2cecbed36e37d38e174d3e5fce7434b4c226e30` | `199284cc38a664867cb835dbac61115982decfab2be4a64a982dcdb2a3e0ae27` |

The hard-kill helper hash is `1e3f1d3e7e49142749423bb2966c4a523c3865e25757bfae26546938e84852c9`. This worktree's release runner `enouia-activity.exe` is `2096d8b94ac61363c6703f0916637222c71509e7850a327e6e44d406ad821b76`. It replaces the previously recorded `cb665419…` runner as a product binary, but has not been packaged, installed or exercised through the desktop.

## Reproduce

```powershell
cargo test --offline -p enouia-activity-store --test late_switch_failure
cargo test --offline -p enouia-activity-runner --test late_switch
git checkout 451d70ed245d1a46166bf7d29a941b69cca3f111 -- crates/enouia-activity-store/src  # baseline failures
git checkout HEAD -- crates/enouia-activity-store/src
cargo build --release --offline -p enouia-activity-store --example crash_writer
node scripts/rehearse-store-hard-kill.mjs <absolute crash_writer.exe> <absolute new report path>
```

## Remaining gates and handoff

- **Integration (Codex):** cherry-pick or merge this commit, link these two reports into the evidence index, and adjust counts. Because the runner binary changed, run a fresh installed-package and actual-operation regression with the rebuilt runner. Older runner evidence does not carry over.
- **Not covered:**
  - Delivery-only orphans left by process death are still permitted. Process-death orphans for new batches and receipts still need explicit operator reconciliation.
  - Leftover `CURRENT.<id>.tmp` files accumulate across repeated failures. They are never read, and none is deleted.
  - Rename refusal for the retraction itself, for example a handle open inside the new directory, falls back to the old blocking orphan. It was reasoned through but not driven by a test.
- **Still unverified:** disk-full, mid-write power loss, sustained stress, a real scanner or indexer as the sharing holder, and all production, real-account, scheduler and remote-receipt gates.

No personal archive or Vault, credentials, real account, scheduled task, desktop window, public upload, server or Moriium source was touched. Every root was a new synthetic temporary directory.
