# Resolved Core/Activity dependency boundaries

Date: 2026-10-01. Scope: the current twelve-module offline workspace, including production/build dependencies. This is a dependency guard, not proof that arbitrary Rust code performs no I/O.

Generate resolved metadata with `cargo metadata --offline --format-version 1 > target/domain-metadata.json`, then run `node scripts/check-domain-boundaries.mjs target/domain-metadata.json --self-test`. PowerShell UTF-8 BOM output is supported. Metadata stays in ignored build output because it includes absolute local paths; the checker prints only sanitized names/counts.

The check classifies five Activity modules, five Core modules and two shared modules. It recursively rejects production/build paths from Activity to Core or Core to Activity, and prevents shared common/platform ports from importing either domain. It pins the current direct dependencies of pure model/interface libraries, including Provider's absence of a UI-contract dependency. A new module or pure-library dependency needs an explicit boundary update.

Six negative checks inject forbidden Activity/Core edges, a shared-domain edge, Provider-to-UI coupling, a native dependency in the Memory model and unresolved metadata. All are rejected. Development-only dependencies are excluded from production graph claims; this does not authorize importing private runtime state through a fixture.

No metadata fetch/download, collector, scheduler, credentials, deployment or file mutation is performed by the checker. It consumes already generated resolved Cargo metadata. Offline workspace tests remain the separate behavioral evidence.
