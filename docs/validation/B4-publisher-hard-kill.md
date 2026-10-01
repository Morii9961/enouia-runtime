# B4 actual reference-publisher termination and recovery — partial C16

Date: 2026-10-01. Runtime baseline: `c65a818`. The [recorded rehearsal](B4/publisher-hard-kill.json) has 29 checks and two actual publisher-process terminations, for new sequences 51 and 52. This strengthens the earlier [hook-return manifest interruption](B4-reference-receiver.md) evidence with real process death, an abandoned publisher lock, explicit sandbox reconciliation, and actual Runtime/curl recovery observation. It is not deployed-service or full B4 acceptance.

The [optional harness](../../scripts/rehearse-publisher-hard-kill.mjs) copies six explicitly named public receiver/publisher/contract files into a repository-external temporary directory. Their reference revision, hashes and dirty state are recorded, and original files remain unchanged. The actual copied receiver CLI takes synthetic batches through stdin. A generated worker invokes the actual publisher with both site probes and Runtime heartbeat disabled. The publisher's `beforeManifest` hook emits the owned child's identity and parks; the parent forcibly terminates that child instead of returning a hook error. Only a private synthetic profile/environment is passed to children.

Starting from a complete sequence-50 publication, each candidate corrects one GitHub day and advances its successful timestamp while retaining every historical date. The killed publisher has already written the complete new immutable Activity data and private state/sequence, but has not switched `public/current.json`. Assertions establish that the old manifest and prior immutable data remain byte-exact, while the complete new state/hash/data exist. The abandoned lock contains the PID of that already terminated owned child.

A new publisher process refuses the abandoned lock, preserving the previous public manifest and the lock itself. There is no automatic lock reclamation or silent recovery. In a separate imported Runtime root, the actual release runner uses real curl against an ephemeral static loopback server. It observes the old manifest and retains the exact candidate pending bytes without a new collection. SSH is an explicitly nonexistent fixture executable, so the probe cannot send to any remote.

After confirming child exit, exact lock ownership/content and containment in this sandbox, the harness explicitly removes that one synthetic lock file. This represents a reviewed operator action in a quiescent test environment, not a production recovery feature. The actual publisher then recovers from its completed state and switches the public manifest to the correct new hash/outcomes, releases its lock, and preserves old immutable data. The actual Runtime re-observes matching public content, acknowledges pending without SSH/new collection, and exits 2 because the synthetic batch has two failed retained sources. The complete process repeats for sequence 52.

Reports contain binary/harness/reference/fixture hashes, old/new public hashes, exact pending hashes, named checks, sanitized Runtime summaries and explicit limits. Work paths, process PIDs, raw subprocess errors, profile data and credentials are absent. The listener and temporary roots are removed after containment checks. Regular Runtime builds/tests/packages never import or require the reference checkout.

Reproduce with Node 24.15.0 and a built release runner:

```powershell
node scripts/rehearse-publisher-hard-kill.mjs `
  'C:\Dev\Moriium' `
  'C:\Dev\Runtime\target\release\enouia-activity.exe' `
  'C:\Windows\System32\curl.exe' `
  'C:\Acceptance\new-publisher-kill-report.json'
```

All paths must be absolute, the report parent must exist, and its file must be new. This host requires approved execution to spawn the isolated child processes. No dependencies or services are installed.

Checks: Node syntax, both actual publisher kills and all 29 checks, evidence privacy/provenance/link checks, and `git diff --check`. Production Rust/dependencies are unchanged; the preceding 160-test/fmt/all-target-clippy/release evidence remains applicable. This Windows filesystem/process rehearsal does not prove Linux service behavior, Nginx deployment, restricted SSH, hardware/power-loss/disk-full durability, real concurrent operator recovery, three-language consumers, or full migration acceptance. The [migration runbook](../ACTIVITY_MIGRATION_v0.3.md) and operational gates remain authoritative.
