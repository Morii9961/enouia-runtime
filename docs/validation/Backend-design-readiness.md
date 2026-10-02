# Backend design readiness integrity — 2026-10-02

Scope: closed storage wire **shape**, Windows capability/ordering proposal and consolidated backend implementation/acceptance sequence. No production Rust/Cargo, frontend or existing Activity contract changes occur in this consolidation slice.

## Executed integrity check

Run `python scripts/check-backend-readiness.py --self-test` against the [readiness manifest](../backend/implementation-slices-v1.json). The initial consolidation verified twenty exact SHA-256 design artifact hashes; the read/result follow-up expands the current manifest to twenty-four. The command-digest follow-up expands it to twenty-eight artifacts. The current check verifies those hashes, P01-P10 identities and their acyclic reviewed dependencies, fourteen explicitly unaccepted O01-O14 rows and design-only source diff coverage from `d58ab4a`. Fourteen negative plans test hash/missing/traversal/duplicate/coverage failures, duplicate/unknown/cyclic/changed dependencies, unsupported implementation/acceptance/activation claims, numeric booleans and extra fields.

The source-diff allowlist is narrow: docs, README/AGENTS, the named Core design contracts/probes and their fixtures. It refuses changed production modules, Cargo metadata, frontend code and existing Activity contracts. This is source evidence, not a before/after comparison of real Activity state or high-water/pending files.

Affected-file checks also parse JSON/Python, resolve local schema references and relative Markdown targets, check code fences and staged whitespace. No complete JSON Schema engine or Rust storage semantic validator was run against the new storage schema. Existing narrow SQL/invocation/command probes retain their independently recorded evidence limits.

## Unaccepted implementation gates

All P01-P10 remain `not_implemented`; all O01-O14 remain `not_accepted`. Windows sources inform the proposed ports but do not demonstrate ancestry/reparse/alias safety, ACL correctness, lock/process lifetime, selector replacement or storage/power durability. The exact packaged SQLite dependency and complete read/result/operation semantic traces remain future implementation inputs.

No new Vault, database, runtime handler, worker, scheduler, personal import, Provider dispatch or production activation was created. The [sequence](../BACKEND_IMPLEMENTATION_SEQUENCE_v1.md) is a reviewable implementation handoff, with exact acceptance dependencies rather than a completion percentage.
