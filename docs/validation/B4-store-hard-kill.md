# B4 actual process termination at store commit boundaries — partial

Date: 2026-10-01. Runtime baseline: `cce342f`. The [recorded rehearsal](B4/store-hard-kill.json) contains 23 forced Windows child-process terminations and 161 named checks. It adds actual process-death evidence to the earlier [writer](B2.1-Windows-writer.md) and [recovery audit](B2.1-recovery-audit.md) hook-return tests. It is partial C12 evidence, not power-loss durability or completion of B4.

The [development-only example](../../crates/enouia-activity-store/examples/crash_writer.rs) uses the actual production importer, lock, writer, acknowledgment commit, pinned reader, recovery audit, and run-start decision. It refuses roots outside an explicitly marked, repository-external temporary test directory. Inputs are a fixed-clock synthetic empty seed and the committed Activity oracle. The helper signals a selected production commit hook, flushes its JSON signal, and parks without returning a hook error. The [harness](../../scripts/rehearse-store-hard-kill.mjs) verifies the signal's identity against its owned child PID, confirms another process cannot take the OS lock, forcibly terminates that child, waits for its exit, and invokes new reader/decision processes. No graceful stack unwinding or writer cleanup produces these remnants.

| Mutation | Kill boundaries | Observed restart behavior |
|---|---|---|
| New pending batch | After activity/sequence/pending/delivery/manifest file flushes, generation rename, prepared CURRENT file, and CURRENT switch (8 cases) | Staging-only remnants leave selected sequence 0/history unchanged and permit a complete sequence-1 commit. Fully published sequence-1 orphans before switch block writing with `higher_reserved_sequence`. After switch, the complete sequence-1 pending is selected and retried exactly. |
| Pause while pending | The same eight boundaries | Pending/archive/sequence remain exact everywhere. Before switch the old unpaused decision retries; after switch the persisted pause prevents collection/send. Same-content delivery-only orphans are permitted by the existing audit policy. |
| Pending-clear receipt | Four file flushes (no pending file), generation rename, CURRENT preparation, and switch (7 cases) | Before switch, selected pending remains exact. A fully published no-pending generation at the same sequence blocks as `conflicting_generation`. After switch, the complete receipt-bearing generation has no pending, and a subsequent complete batch reserves sequence 2. |

Every selected generation passes its manifest/content validation. Every prior generation file remains byte-identical. The four blocking orphan cases make no mutations when a restarted writer attempts to advance. Retry/pause decisions likewise do not create a competing collection. For staging-only new-batch cases and the switched acknowledgment case, the next writer actually commits the expected new sequence/pending, rather than merely returning a predicted number. The OS lock releases after every forced termination; no manual deletion/reclamation of a live lock is used.

Acknowledgment cases construct explicitly synthetic matching publication evidence to reach the store's receipt commit path. This does not establish a genuine public observation; [receiver/HTTP](B4-reference-receiver.md) and [subprocess retry](B4-subprocess-handback.md) reports own that separate evidence. Published orphans are preserved, and the rehearsal does not automatically reconcile, delete, or select a fallback generation.

The report records fixed clock, Node/helper/source/fixture hashes, each boundary and before/after/advanced state, archive/pending/delivery hashes, audit and decision results, and prior-generation file-set hashes. It contains no absolute work paths, raw process errors, personal data or credentials. Processes are only newly created, owned fixture children. Temporary roots are removed after containment checks.

Reproduce with Rust 1.98.1/Node 24.15.0 on Windows:

```powershell
cargo build --release -p enouia-activity-store --example crash_writer
node scripts/rehearse-store-hard-kill.mjs `
  'C:\Dev\Runtime\target\release\examples\crash_writer.exe' `
  'C:\Acceptance\new-hard-kill-report.json'
```

Paths must be absolute, the report parent must exist, and its file must be new. The regular build/installed runner neither contains this helper nor exposes a kill/pause-at-hook option. The example refuses execution on unsupported platforms. On this host, child-process execution requires approved host permissions.

Checks: Node syntax, all 23/161 rehearsal cases/checks, offline Rust fmt/full workspace tests (160), all-target clippy with warnings denied, release helper build, evidence privacy/provenance/link checks, and `git diff --check`. Production storage logic/dependencies are unchanged. Process death while Windows/storage remain running does not simulate power loss, disk full, storage-controller failure, arbitrary mid-write bytes, real collector termination, or receiver/publisher server death. Those and operational/consumer/full migration gates remain outstanding.
