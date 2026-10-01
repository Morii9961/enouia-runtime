# B4 subprocess retry and legacy handback — partial

Date: 2026-10-01. Runtime baseline: `f1b9989`. The [recorded evidence](B4/subprocess-handback.json) contains 34 named checks against the actual release runner, actual copied legacy sync/refresh/collector, actual reference receiver/publisher, and actual loopback curl observation. This is isolated C13/C18 evidence, not complete B4 acceptance or a production cutover.

The [optional harness](../../scripts/rehearse-activity-handback.mjs) copies twelve explicitly selected public reference files into a temporary directory outside both repositories. It records their hashes, revision and dirty state, and confirms the originals are unchanged. Child processes receive an allowlisted synthetic profile/environment without personal tokens, source stores, CLI configuration, or credentials. No reference code is part of the Runtime build, regular tests, or installed package.

The [development-only tool example](../../crates/enouia-activity-runner/examples/sandbox_tools.rs) supplies marked gh, Codex app-server and SSH stand-ins. It refuses roots without the exact test marker, captures bounded exact stdin batches, and checks canonical containment before invoking copied receiver/publisher programs. The fake ccusage returns two fixed reports from synthetic normal/Cowork stores. These stand-ins exercise real Runtime process adapters and store discovery, but cannot establish authentication, genuine tool capability, transcript interpretation, or network SSH behavior. The fake ccusage explicitly normalizes Windows extended store paths; compatibility with the real pinned package remains unverified.

| Scenario | Verified behavior |
|---|---|
| Seed/import | Exact legacy pending 42 survives import with a previously reserved high-water 50. Initial pause prevents every collector/transport invocation. |
| C13 before receipt | Nonzero synthetic SSH exit retains the exact pending bytes and sequence; automatic sync respects the persisted wait and performs neither send nor collection. |
| C13 after receipt | The actual receiver and publisher accept/publish 42, then the stand-in returns nonzero. Actual curl observes matching content, clears pending, and reports publication observed with transport incomplete. Exit 2 reflects the original batch's three source failures. Both wire retries are byte-identical. |
| Fresh collection | Actual gh/Codex adapters and normal plus Cowork discovery collect fixed reports; Runtime reserves 51 rather than reusing skipped reservations. Downward GitHub/Claude corrections and all older dates survive. The simulated pre-receipt failure keeps 51 pending. |
| C18 handback | Runtime is paused and exports the latest archive/sequence/exact pending. A distinct old work root receives that latest trio. The actual copied old sync replays 51, runs the actual old collector with stand-ins, and advances receiver/publisher to 52; another manual old run advances to 53. |
| Writer separation/history | Every daily value, unit and zone matches the latest Runtime export; successful timestamps advance. Old work clears its own pending. Runtime/export trees remain byte-frozen, and a paused Runtime sync makes no competing send. |

The recorded wire sequences are `42, 42, 51, 51, 52, 53`. Legacy replay validates and reserializes JSON, so its sequence-51 wire hash differs from the original pending hash while batch semantics remain equal. The exported pending itself stays byte-exact. No older backup or sequence reset is used during handback.

The first diagnostic attempts exposed two fixture-tool Windows path issues: Node's main-module resolver rejects a canonical extended drive path, and the generated fake ccusage originally attempted to resolve an extended path before normalizing it. A minimal Node reproduction confirmed the first failure. The helper now converts only already-contained script paths for Node; the fake ccusage normalizes before resolution. These fixes affect development tools only, and do not prove real ccusage compatibility.

Reproduce with Rust 1.98.1/Node 24.15.0 after building the release runner:

```powershell
cargo build --release -p enouia-activity-runner --example sandbox_tools
node scripts/rehearse-activity-handback.mjs `
  'C:\Dev\Moriium' `
  'C:\Dev\Runtime\target\release\enouia-activity.exe' `
  'C:\Dev\Runtime\target\release\examples\sandbox_tools.exe' `
  'C:\Windows\System32\curl.exe' `
  'C:\Acceptance\new-handback-report.json'
```

All arguments are absolute, the report parent must exist, and the report file must be new. Reports contain only synthetic public snapshots, hashes, versions, named checks and explicit limits; no absolute work paths or raw process output. Temporary roots and the loopback listener are removed after containment checks. On this host subprocess execution needs approved host permissions; no dependency installation is necessary.

Checks: Node syntax, complete 34-check subprocess rehearsal, offline Rust formatting, full workspace tests (160), all-target clippy with warnings denied, release fixture-tool build, report privacy/provenance/link checks, and `git diff --check`. Production Rust behavior and dependencies are unchanged. Real disconnects/SSH, hard kills/disk-full/power-loss, actual scheduled cutover/rollback, authenticated source inventory, three-language consumer checks, and the two unresolved frozen-comparison differences remain open under the [runbook](../ACTIVITY_MIGRATION_v0.3.md).
