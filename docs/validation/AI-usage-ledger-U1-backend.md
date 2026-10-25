# Usage manual desktop continuation — runner boundary

2026-10-22. After R0–R3, Morii explicitly requested continuing development and selected “同时加入桌面手动操作页面”. This authorizes a local manual desktop flow and its supporting runner interface. Personal source reads, production scheduling, watching, transmission, pricing and Memory changes remain outside scope.

The independent runner now accepts `enouia-usage desktop` with one closed, version-1 JSON request on stdin (64 KiB/depth-32 cap). Its native host supplies selected paths; paths are absent from process arguments and replies. Methods cover new ledger, overview, explicit scan, replay, candidates, inspection, reviewed resolution and exclusive-file export. All use the existing ledger transaction and source safety rules; there is no network or scheduler method. Exact count totals have a dedicated unknown-preserving overview.

Conflict review uses signed bounded cursors, 64 candidates/page and an evidence-bound review token. The stamp includes source, semantic revision, immutable evidence count and exact keyed identity/version. Evidence count matters: a new contradictory variant may leave the accepted export projection unchanged, so semantic revision alone cannot detect a stale review. Page continuation and confirmation fail with `stale_read` after either evidence or projection changes. Tokens from another root fail their keyed seal. The CLI `candidates` command now returns a page and accepts its optional cursor; the former 2,000-item list is no longer the only user entry point.

Checks actually run:

- `cargo test --offline --locked -p enouia-usage`: **27 pass**, three deliberately ignored entry points remain (process-crash child, explicit scale test, explicit cross-repository conformance). The crash parent invokes the child as before.
- New fixtures enumerate 140 distinct conflicting variants over multiple pages without duplicates, then introduce evidence that does not change the export revision and verify both page and confirmation refusal.
- A real independent CLI subprocess receives synthetic roots on stdin, initializes/scans/reads its private ledger, returns an exact count-only overview, rejects unknown request fields, and returns neither path nor transcript sentinels.
- `cargo fmt -p enouia-usage` and strict all-target Usage Clippy pass. No dependency, Activity/Memory crate or protocol pin changed.

These are synthetic backend checks. The authorized desktop UI, native picker grants, package verification, lifecycle, rendered journeys and packaged artifacts are a subsequent verified slice; this note does not claim those completed.
