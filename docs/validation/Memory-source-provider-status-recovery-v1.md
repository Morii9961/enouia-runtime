# Source suggestion Provider status recovery

Date: 2026-10-14 (Asia/Shanghai). Baseline `f8f7e86356ae83f39de2850e54fe32cbb1c43df6`; exact Memory pin unchanged.

A nonretryable initial Provider-status failure in the source suggestion panel offered only Close. The new controlled fixture failed `nonretryable_provider_read_has_explicit_recovery` against the baseline.

The source panel now explicitly rereads `provider_status` after failure or while setup/extraction permission is unavailable. This reads Core status only. It neither reloads native configuration nor changes grants, prepares a request or sends to a model. Reading/failure withholds the previous setup; successful replacement preserves the selected model while it remains configured. A matching extraction grant is still required before explicit preparation. The reread control is limited to the initial setup stage, before a prepared call or saved job exists.

The actual [source panel fixture](../../apps/desktop/e2e/extraction-status-recovery.html) passed 9/9 synthetic checks covering nonretryable recovery, held reads, off/configured/granted states, failed replacement, retained model choice and an entirely read-only trace of six status calls. Affected browser checks passed: source suggestions 14/14, source resume 10/10, model choice 11/11, queue recovery 14/14, Provider operations 12/12 and unmount lifetime 7/7. TypeScript, strict new-fixture checking, all 69 frontend tests, the frontend/ordinary no-bundle desktop release build and pin/dependency guards (8 + 7 negatives) passed. Native sources, dependencies and consumer tests are unchanged, retaining the prior 61-host/5-consumer evidence.

All status states and delivery timing are controlled. No real Provider, credentials, personal Vault, Activity activation, installer, Memory domain/protocol/pin change, physical Windows/Narrator or human acceptance is claimed. Existing historical reports and owner status snapshots are preserved.
