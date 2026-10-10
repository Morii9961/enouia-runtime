# ADR-030 — Gated production activation path for the Activity package

Date: 2026-10-07. Status: adopted and implemented. Authority: the owner's 2026-10-07 approval of B5 steps 1–4; [migration runbook](../ACTIVITY_MIGRATION_v0.3.md) Stages 4–5.

## Context

B3.2 packaging deliberately refused every production delivery path: installs had to be delivery-disabled, and both registration entry points rejected production mode. That kept B5 unreachable by accident, but it also left the runbook's Stage 4 (one manual production cycle) and Stage 5 (enable exactly one task after observed publication) without a supported tool.

## Decision

1. `install-activity.ps1 -Production` accepts only a configuration with mode `production`, delivery enabled, an `https://` public origin and a restricted SSH alias. The store must still be paused, and nothing is registered. Without `-Production`, the old rule (delivery disabled) is unchanged, and `-RegisterSandbox` cannot be combined with it.
2. The installed `management/register-activity-production.ps1` takes the install root and the exact task name (`-ConfirmTaskName`, case-sensitive):
   - Without `-Enable` it registers the package's task **disabled**, after checking the binary and config hashes and that the config is production with delivery enabled. An existing task is never replaced.
   - With `-Enable` it enables only that package's own disabled task, and only if a valid production overview shows Boolean sync-resumed and delivery-enabled flags, no pending batch or delivery sequence, and an **observed** publication with a valid public hash and exact UTC observation timestamp. A manual production cycle that published is therefore a precondition, as the runbook requires. A missing/null pause flag or imported receipt without a locally observed publication time cannot satisfy the gate.
3. Neither step changes Activity data, and uninstall keeps its existing ownership checks.

## Consequences

- Stage 4 is: install with `-Production`, import the reviewed seed, resume, run `sync` by hand, and confirm the publication and About pages.
- Stage 5 is: `register-activity-production.ps1` without and then with `-Enable`, followed by observing one scheduled run.
- [Current package tests](../validation/Activity-unified-2026-10-08.md) cover disabled-first registration, activation refusals and the positive enable control flow with a modeled publication reply and scheduler doubles. They do not establish a real observed production publication or actual task enablement; those still require B5 acceptance.
