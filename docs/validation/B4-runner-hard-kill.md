# B4 release-runner termination during ready synthetic tools — partial

Date: 2026-10-01. Runtime baseline: `6b9eef5`. The [recorded rehearsal](B4/runner-hard-kill.json) contains three actual release-runner terminations, 24 checks and nine observed process lifetimes. It complements [store commit-boundary](B4-store-hard-kill.md) and [publisher termination](B4-publisher-hard-kill.md) evidence with real orchestrator death during collection/transport. It is partial B4 evidence.

The [optional harness](../../scripts/rehearse-runner-hard-kill.mjs) copies the actual release runner and [marked development tool example](../../crates/enouia-activity-runner/examples/sandbox_tools.rs) into a temporary directory outside the repository. Child profiles/environments, source reports, archives, pending bytes, HTTP endpoint and SSH alias are synthetic. The helper's additional linger modes start a bounded synthetic descendant and emit an ownership marker. Its observer opens **synchronization-only Windows process handles** to Runtime, the tool and descendant while all three are alive, then waits for those same handles after Runtime is forcibly terminated. It does not infer process death from a PID lookup that could refer to a reused PID, and cannot terminate arbitrary processes.

| Interruption | Committed state after death | Actual restarted operation |
|---|---|---|
| GitHub subprocess ready | Complete original archive, high-water 50, no pending; tree unchanged | New complete collection reserves 51, never consuming a sequence for the killed invocation |
| Codex app-server/descendant ready | GitHub's already collected result was transient; original committed archive/high-water remain exact | New complete collection reserves 51; Claude remains an explicitly failed retained source |
| Restricted-transport stand-in ready after reading pending | Exact imported pending 42 and high-water 50 remain; no failure record was committed by the killed invocation | Manual retry sends the same bytes/42, creates a normal unresolved retry record, and performs no new collection |

For each case a second CLI process confirms the live Runtime owns the single-writer lock. Runtime is then forcibly terminated, its tool and descendant handles signal within the 1.5-second per-handle observer bound, and a new diagnostics process acquires the lock. The entire committed state tree remains byte-exact before the restarted operation. The two transport captures (killed attempt and subsequent retry) are identical to the original imported bytes. The selected release binary hash is unchanged from the prior B3/B4 runner.

Only the fixture example adds linger/observer modes; the production runner/process libraries are unchanged. The example uses the already pinned `windows-sys@0.61.2` as a Windows-only development dependency for process synchronization. No package version, runtime dependency, authentication flow, scheduler, actual SSH or public publication is added. Source fixture processes have bounded fallback lifetimes; only the newly created owned Runtime child is explicitly killed by the harness.

These tests wait for tool/descendant readiness. They **do not cover** the interval between `Command::spawn` and `AssignProcessToJobObject` in the existing Windows adapter, or every possible process-start scheduling interleaving. [Microsoft's job-association documentation](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject) describes inheritance after association. This report establishes observed cleanup for ready, associated tool trees and does not promote that observation into a claim of atomic job assignment at creation. Startup-boundary hardening/acceptance remains a separate follow-up.

The report contains sanitized outcomes, state hashes, binary/tool/harness/fixture hashes and named checks; no raw subprocess output, work paths, PIDs, personal account information or credentials. Temporary roots and the loopback HTTP-404 listener are removed after containment checks. The Runtime does not depend on Moriium to perform this rehearsal.

Reproduce on Windows with Rust 1.98.1/Node 24.15.0:

```powershell
cargo build --release -p enouia-activity-runner --bins --example sandbox_tools
node scripts/rehearse-runner-hard-kill.mjs `
  'C:\Dev\Runtime\target\release\enouia-activity.exe' `
  'C:\Dev\Runtime\target\release\examples\sandbox_tools.exe' `
  'C:\Windows\System32\curl.exe' `
  'C:\Acceptance\new-runner-kill-report.json'
```

All paths are absolute; the report parent must exist and its file must be new. This host requires approved child-process execution. Checks: Node syntax, all 3/24 runner-death cases/checks, the previous 34-check handback regression with the expanded helper, offline Rust fmt/full workspace tests (160), all-target clippy with warnings denied, release binary/example build, report privacy/provenance/link checks, and `git diff --check`. Real authenticated collectors, startup-assignment interleavings, disk-full/power-loss, scheduled/deployed behavior, three-language consumers and full migration acceptance remain pending.
