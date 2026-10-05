# Resolved Core/Activity dependency boundaries

Date: 2026-10-01. Scope: the current twelve-module offline workspace, including production/build dependencies. This is a dependency guard, not proof that arbitrary Rust code performs no I/O.

Generate resolved metadata with `cargo metadata --offline --format-version 1 > target/domain-metadata.json`, then run `node scripts/check-domain-boundaries.mjs target/domain-metadata.json --self-test`. PowerShell UTF-8 BOM output is supported. Metadata stays in ignored build output because it includes absolute local paths; the checker prints only sanitized names/counts.

The check classifies five Activity modules, five Core modules and two shared modules. It recursively rejects production/build paths from Activity to Core or Core to Activity, and prevents shared common/platform ports from importing either domain. It pins the current direct dependencies of pure model/interface libraries, including Provider's absence of a UI-contract dependency. A new module or pure-library dependency needs an explicit boundary update.

Six negative checks inject forbidden Activity/Core edges, a shared-domain edge, Provider-to-UI coupling, a native dependency in the Memory model and unresolved metadata. All are rejected. Development-only dependencies are excluded from production graph claims; this does not authorize importing private runtime state through a fixture.

No metadata fetch/download, collector, scheduler, credentials, deployment or file mutation is performed by the checker. It consumes already generated resolved Cargo metadata. Offline workspace tests remain the separate behavioral evidence.

## Memory packages (2026-10-04, ADR-025)

The checker now classifies Enouia Memory's packages by source, not by name, because Runtime's frozen `enouia-memory` crate shares the prefix. A Memory package must come from `git+https://github.com/Morii9961/enouia-memory.git` at one full 40-hex revision. Any `enouia-memory-*` package from another source fails, as do a branch source and two revisions in one graph.

- **Domain workspace** (root `Cargo.toml`): no Memory package may appear at all, and Activity and shared crates must not reach one. The twelve-module classification above is unchanged. This mode runs ten negative checks: the six above plus a branch source, an unpinned Memory package, and injected Activity→Memory and shared→Memory edges.
- **Desktop workspace** (`apps/desktop/src-tauri`): exactly one member, `enouia-desktop`, embeds the pinned Memory packages. No Runtime domain crate (Activity, frozen Core or shared) may appear in its graph, and no Memory package may reach an `enouia-*` package outside Memory. This mode runs seven negative checks: unresolved metadata, a branch source, an unpinned package, an Activity crate in the graph, a Memory→Runtime edge, a second revision and an extra member.

```powershell
cargo metadata --offline --format-version 1 > target/domain-metadata.json
node scripts/check-domain-boundaries.mjs target/domain-metadata.json --self-test
cd apps/desktop/src-tauri
cargo metadata --offline --locked --format-version 1 > target/desktop-metadata.json
node ../../../scripts/check-domain-boundaries.mjs target/desktop-metadata.json --self-test
```

`node scripts/check-memory-integration.mjs` separately checks that the pin record, the desktop manifest and its lockfile agree. Results for this change are in [Memory integration v1](Memory-integration-v1.md).
