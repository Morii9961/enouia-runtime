# B4 development reference receiver acceptance — partial

Date: 2026-10-01. Runtime baseline: `742fd52`. This is a development-only receiver/publisher compatibility slice, **not completion of B4 or authorization for B5**. The [recorded evidence](B4/reference-receiver.json) identifies the binary, synthetic fixture, exact pending hash, clock, Node version, reference revision, six reference-file hashes, clean status of those files, and 31 named checks.

The [harness](../../scripts/accept-reference-receiver.mjs) requires explicitly selected absolute reference checkout, built Runtime binary, curl, and optional write-once report paths. It copies only six public receiver/publisher/contract source files to a repository-external temporary directory, records their bytes, and checks the original files are unchanged afterward. Dynamic reference imports are confined to this optional development tool. Runtime production code, packaging, build, and regular offline tests have no Moriium dependency. No reference code is vendored into Runtime.

The actual release executable is copied to an independent directory and invoked with its own working directory and synthetic data/config. Offline import/resume/sync/export generates a real immutable sequence-51 pending batch from a sequence-50 seed. All three unconfigured-source failures retain every original date, value, source literal, and successful timestamp. Removing only the derived `succeededAt` fields creates the legacy-shaped envelope at the same frozen attempt time; the reference normalizer reconstructs the exact Runtime outcomes. This is an all-failed envelope comparison, not a live old collector invocation.

Two independent receiver/publisher roots take the legacy-shaped envelope and Runtime batch. The Runtime bytes are delivered to the actual copied Node receiver CLI through stdin; the legacy envelope uses its exported receive function. The actual publisher writes identical canonical Activity bytes/hashes and source metadata in both roots. The static public files are served only on an ephemeral `127.0.0.1` HTTP listener. Configured site probes and runtime heartbeat collection are disabled. No production service or SSH alias is invoked.

The copied Runtime runner uses its actual curl adapter to read that local server. Stale HTTP 200, altered immutable bytes, mismatched source outcomes, and redirects all retain the exact pending hash. Correct publication acknowledges the old pending without another collection or transport call; the successful exit category is `2` because the frozen batch contains source failures. These are real executable/process/HTTP observations against copied reference code, not fabricated fetcher-port responses.

| Matrix scope | New evidence | Remaining boundary |
|---|---|---|
| C04, partial | Actual all-failed runner batch and same-input legacy envelope preserve exact history/outcomes | Each separate failure and full report normalization comparison remain |
| C14, partial | Receiver CLI exits zero for equal/lower sequences without replacing inbox; a newer differing public version does not clear the older pending | Real restricted SSH and indistinguishable publication/O6 reconciliation remain |
| C15, partial | Receiver accepts a candidate missing a historical date; publisher keeps prior immutable data; Runtime retains candidate pending | Other time/history regression variants remain |
| C16, partial | Stale/hash/outcome/redirect refusal; interrupted manifest switch preserves previous bytes; actual publisher retry recovers and Runtime acknowledges | Server/process kill, actual deployment/storage faults remain |
| C17, partial | Copied runner runs outside repositories, no UI/Memory/author dependency, local static HTTP observation | Authenticated tools, access-denied repo isolation, and UI acceptance remain |
| C18, partial | Export after observed publication carries latest history/high-water | Full old-writer handback, cutover/rollback, and next old collection remain |
| Receiver byte limit | Actual stdin CLI rejects more than 4 MiB without replacing inbox | Real network/SSH boundary remains |

The interruption test uses the reference publisher's `beforeManifest` hook, rather than killing a server. Manifest recovery is demonstrated through the real publisher function and filesystem. All fault candidates and state roots are synthetic. Test imports for refused publication deliberately model a prepared pending candidate; the normal Runtime merge is not changed to remove history. Temporary roots and listener are removed after checked containment validation. The optional report contains no absolute work paths, raw process output, personal source data, or credentials.

Reproduce after building the release binary, with Node 24.15.0 (the recorded host supports the reference TypeScript sources):

```powershell
node scripts/accept-reference-receiver.mjs `
  --reference-root 'C:\Dev\Moriium' `
  --binary 'C:\Dev\Runtime\target\release\enouia-activity.exe' `
  --curl 'C:\Windows\System32\curl.exe' `
  --report 'C:\Acceptance\new-reference-report.json'
```

The report parent must exist and the report file must be new. Checks: Node syntax validation and the complete isolated harness passed, yielding 31 named checks plus strict byte/JSON equality assertions. The unchanged Rust source/dependencies reuse the B3.2 fmt/full-workspace-test/clippy/release evidence (160 tests). A minimal reproduction showed that this restricted host blocks even `node --version` as a spawned child with `EPERM`; the isolated run succeeded with approved host execution. This is an execution-permission limitation, not a receiver failure.

C01–C18 signed-off coverage, live tool/inventory reconciliation, actual SSH, independent endpoint deployment, three-language consumer acceptance, and full cutover/rollback remain open. The [migration runbook](../ACTIVITY_MIGRATION_v0.3.md) and operational O1–O4/O6 gates continue to govern those steps.
