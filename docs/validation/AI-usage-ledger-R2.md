# AI Usage Ledger R2 — private storage and bounded scans

2026-10-21. All inputs were fictional and created in new owned temporary directories outside the repository. No personal source root was selected.

## Delivered boundary

`enouia-usage` now provides explicit `Ledger::init/open/scan/health/replay/resolve/candidates` APIs. It has no Activity, Memory, desktop, scheduler, watcher, provider or network entry point. The one-shot CLI and allowlist export follow in R3. New registry dependencies are pinned cached rusqlite 0.40.2 (bundled SQLite) and windows-sys 0.61.2; resolution/build ran offline, with no installation or ccusage change. Windows API signatures and rusqlite transaction/rollback behavior were checked against those cached versions' source.

The selected data root contains `identity.json` (random key and per-source UUID aliases), `usage.sqlite3` with SQLite-owned WAL/SHM files, and `writer.lock`. This simplifies ADR-035's proposed nested identity directory. Root selections are supplied explicitly to each call and are not persisted or discovered automatically. File catalog entries contain keyed path digests only. Bodies, raw IDs and source paths never enter the database. Public model labels require explicit approval.

New roots receive a protected inheritable current-user/SYSTEM DACL. Reopen checks permissions and the identity-file hash bound into the database; corruption fails closed without replacement. Component handles deny replacement, reparse points/hard links/UNC/ADS/relative traversal are refused, and source file handles deny concurrent writes. A currently written source can therefore be reported unreadable; history survives. Data roots inside a repository, known synchronized-folder names or the executable directory are refused. Custom synchronization locations cannot be inferred: the owner must choose an unsynchronized root.

Independent share-denied writer admission precedes SQLite WAL/FULL transactions. Immutable normalized variants, reviewed decisions, group projections, revision history and committed coverage survive reopen. Exact copies count once across selected stores. Codex cumulative edges must form one unambiguous chain; prefixes extend the chain rather than adding another baseline. Divergence preserves the preceding accepted projection with conflict quality. Claude metering variants require reviewed selection; no maximum rule applies. Replay rebuilds from retained normalized evidence, cannot recover deleted transcripts, and does not pretend a new source scan occurred. Missing files never delete confirmed facts.

Default ceilings: 16 selected roots, 32 directory levels, 50,000 inventory entries, 1 GiB total input, 128 MiB/file, 1 MiB/line before allocation, depth-32 JSON, 1,000,000 completed lines and 120 seconds. Explicit callers can increase only the deadline, up to 600 seconds. Cancellation/deadline checks cover scanning and projection. Budget/cancel failure rolls back candidate facts and records failed-attempt health separately; it does not advance last successful scan or semantic revision. Partial completed scans retain bounded accepted facts with explicit coverage. An unfinished tail is deferred, not parsed as a complete line. A malformed/reset Codex chain stops at that boundary; no guessed bridge follows it. Compressed JSONL is explicitly unsupported.

## Checks actually run

- `cargo test --offline --locked -p enouia-usage`: 20 passing tests, two intentionally ignored entries (scale trial and subprocess entry). The crash parent explicitly invokes the ignored child twice.
- Focused cases include no-op revision, persistent old facts after disappearance, replay, conflicting variants and reviewed replacement, archive-prefix graph reconciliation, branching quarantine, malformed/tail/cancel/timeout/line caps, hard-link/junction refusal, pinned-handle replacement denial, single writer, corrupt database preservation and repository-root refusal.
- Real subprocess termination before and after commit verifies reopen at the old/new complete revision. The uncommitted child forces SQLite dirty-page spill with a small test-only cache; process exit bypasses Rust destructors. A trigger-induced commit failure also rolls back projections/revisions. These are process-crash tests, **not physical power-loss or hardware durability acceptance**.
- Strict usage Clippy and the resolved dependency boundary guard pass; no desktop files or Memory pin changed. Formatting and diff whitespace checks completed.

Restricted execution initially denied the fixture's private ACL/hard-link operations. The same tests passed in the approved normal-user environment; product logic was not weakened to accommodate that restriction. Cargo's incremental hard-link fallback is environmental and copies cache files.

## Measured scale trials

Release builds, offline, on Windows 11 Home x64 10.0.26200, Intel Core i9-13900HX, about 31.7 GiB visible RAM, Rust 1.98.1 GNU. Each trial uses streamed synthetic Claude records, 10,000 lines/file, an 8 MiB SQLite page cache, disk-backed temporary tables, and a 600-second explicit limit. Windows `GetProcessMemoryInfo` measures lifetime peak working set, including fixture generation. This is a local regression bound, not a production throughput guarantee.

| Completed lines | Unique identities | Input bytes | Scan + transaction | Peak working set | Peak pagefile usage |
| --- | --- | --- | --- | --- | --- |
| 100,000 | 100,000 | 30,388,890 | 11,350 ms | 22,056,960 bytes | 14,098,432 bytes |
| 1,000,000 | 100,000 | 303,888,900 | 29,493 ms | 22,110,208 bytes | 14,082,048 bytes |

The million-line trial deliberately includes 900,000 copied observations across stores/files. It validates bounded streaming plus deduplication, **not one million distinct persistent identities**. Both runs stayed below the explicit 256 MiB regression ceiling and retained exactly 100,000 accepted facts. Reproduce with `USAGE_SCALE_EVENTS=100000` or `1000000` and `cargo test --release --offline --locked -p enouia-usage --test ledger synthetic_scale -- --ignored --exact --nocapture`. Only those explicitly requested ignored tests generate scale data.

R3 still owes a closed aggregate export, consumer conformance and user-facing offline commands. No real-provider or personal-data acceptance, installation, scheduling, transmission or deployment has occurred.
