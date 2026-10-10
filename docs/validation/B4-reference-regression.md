# B4 C15 history and success-time regression acceptance — partial

Date: 2026-10-07. Runtime baseline: `debd5e2`. The [recorded evidence](B4/reference-regression.json) has 97 named checks over ten synthetic regression candidates. It extends the single GitHub date-loss case in the [reference receiver report](B4-reference-receiver.md) to every source and to success-time variants. This is isolated development evidence for C15, **not a C15 sign-off, full B4 acceptance or authorization for B5**.

The [harness](../../scripts/accept-reference-regression.mjs) copies the same six public receiver/publisher/contract source files as the receiver report into a repository-external temporary directory. It records their revision, hashes and clean status and confirms that the originals are unchanged afterward. The copied release runner uses the marked [SSH stand-in](../../crates/enouia-activity-runner/examples/sandbox_tools.rs) in its `none` mode, which pipes the exact stdin bytes to the copied receiver CLI and then runs the copied publisher. The actual curl adapter then observes an ephemeral `127.0.0.1` static server over that publisher root. Children receive an allowlisted synthetic environment. No collector, network SSH, production endpoint, personal archive or credential is used, and no reference code enters the Runtime build, regular tests or package.

Every case starts from a fresh publisher root. A Runtime root imports an all-success sequence-51 baseline, delivers it through the stand-in and acknowledges its publication from actual public bytes; the publisher reports `operational`. A second Runtime root then imports one prepared sequence-52 candidate, which both the Runtime and reference contracts accept, and delivers it once:

| Candidate | Sources | Regression the publisher must refuse |
|---|---|---|
| `C15-success-time-loss-*` | github, codex, claude separately | A failed source whose retained `updatedAt` is older than the published success time |
| `C15-source-loss-*` | github, codex, claude separately | A previously published source replaced by `null` |
| `C15-date-loss-*` | github, codex, claude separately | A successful source missing its earliest published date |
| `C15-whole-batch-clock-rollback` | all | Higher sequence, all three successes stamped before the published times |

For all ten candidates:

- the receiver stores the exact wire bytes at sequence 52, and only one send occurs;
- the publisher keeps the prior manifest hash, receipt time and immutable Activity bytes, and the public Activity component reports `degraded`;
- Runtime exits 4 (`delivery_unresolved`) with `transportCompleted` true and `publicationObserved` false, and keeps the exact pending SHA-256;
- a following `sync` returns 3 (`not_due`), with no resend or collection, during the persisted retry wait;
- a later publisher run stays `degraded` while the candidate occupies the inbox;
- a valid sequence-53 batch with a downward GitHub correction from a separate Runtime root publishes as `operational`, and Runtime acknowledges it from actual curl observation.

SSH success therefore never stands in for publication: the candidate stays pending although transport completed. The publisher's history guard, rather than contract validation, causes each refusal: the receiver accepted every candidate, and the baseline sources were fresh successes, so only the failed intake could produce `degraded`.

Runtime's own merge never emits these candidates. Failure retention and clock refusal are covered by the [frozen comparison](B4-frozen-comparison.md). The prepared pending models a faulty or foreign producer. The sequence-53 recovery models reconciliation and does not define an operator procedure. A refused pending in a real store stays at the head of line and is retried with the same bytes at each eligibility time. Runtime has no automatic path that clears or renumbers it, and that is intended. Resolution remains an O4/O6 operator decision under the [migration runbook](../ACTIVITY_MIGRATION_v0.3.md).

Reproduce with Rust 1.98.1 and Node 24.15.0:

```powershell
$env:CARGO_NET_OFFLINE = 'true'
cargo build --release -p enouia-activity-runner --bin enouia-activity
cargo build --release -p enouia-activity-runner --example sandbox_tools
node scripts/accept-reference-regression.mjs `
  --reference-root 'C:\Dev\Moriium' `
  --binary 'C:\Dev\Runtime\target\release\enouia-activity.exe' `
  --tools 'C:\Dev\Runtime\target\release\examples\sandbox_tools.exe' `
  --curl 'C:\Windows\System32\curl.exe' `
  --report 'C:\Acceptance\new-regression-report.json'
```

All paths must be absolute, and the report file must be new. Candidate times are relative to the run so that the publisher's three-hour freshness window holds. Pending hashes therefore differ between runs, while the check names and outcomes stay the same. The temporary root is named `enouia-handback-c15-*` because the stand-in accepts only marked `enouia-handback-` roots.

Remaining C15 work: degraded and retained public data on a deployed publisher and static cache, rendering on the zh/ja/en About pages, and a documented operator reconciliation for a refused pending. Real SSH and authenticated collectors stay with C13 and the O2/O3 gates.
