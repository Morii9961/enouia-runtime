# ADR-037 — Retire Activity / Usage from the desktop host

Date: 2026-10-25. Status: implemented as a backend change; frontend removal and production migration are separate.

Morii explicitly asked Claude to remove both Activity and private Usage from the ongoing frontend redesign, and asked Codex to implement the Moriium and Runtime backend changes. This supersedes ADR-028 / ADR-036 for the desktop host.

The native desktop no longer compiles the Activity / Usage adapters, manages their hosts, registers their five commands or grants their permissions. Their unused direct SHA dependency is removed. Memory, its pin, Provider setup, shell lifecycle and synthetic automation are unchanged. Calls from an older frontend are denied by the absent command/capability rather than launching a collector or reading saved package/source choices.

The adapter source files and standalone Activity / Usage programs remain historical/migration material for now. No installed package, task, ledger, archive, pending batch or saved setting is stopped, changed or deleted. Root workspace crates and management scripts stay available until Moriium's replacement service and client-side tokens submission have been accepted. Removing old source and stopping old deployed writers are later migration steps, not effects of launching or updating this desktop.

Moriium's replacement backend has its own v2 public feed, provenance, upstream timestamps, single writer and an immutable v1 legacy snapshot. tokens.ci is a local-log aggregate service, not the private ledger's conflict-review or Dashboard export equivalent. Runtime does not add a tokens.ci adapter and does not route these statistics through Memory.

Frontend integration: remove calls to `activity_call`, `activity_setup`, `usage_call`, `usage_pick`, `usage_cancel` and their panels in Claude's existing work. The removed native commands are intentionally unavailable; do not introduce fallback reads or replacement stats panels. Until that frontend lands, the old pages in this backend-only branch report unavailable instead of offering working operations.

`node scripts/check-activity-retirement.mjs` checks the command and capability boundary and preservation of the Memory lifecycle. Standard desktop integration checks remain required. This change makes no claim about personal data, installed tasks, production migration or UI acceptance.
