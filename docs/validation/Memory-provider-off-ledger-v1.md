# Local Provider ledger recovery with setup off

Date: 2026-10-12 (Asia/Shanghai). Baseline `df5f3e4`; Memory pin unchanged.

ExternalPanel previously returned its setup-off notice before rendering invocation records or the confirmation view. That hid local recovery even though the pinned Core's `external_interrupt_plan` explicitly works without a native transport. The new browser regression first failed `off_setup_keeps_saved_ledger` with setup absent and a supplied saved unknown invocation.

Invocation history, held operation feedback and plan confirmation are now shared between ready/off/read-error views. Saved unknown calls can be closed through an inspected local plan while native setup remains absent. External prepare/send/key controls stay unavailable. Closing locally does not undo remote processing. The existing keyed confirmation retry retains its original plan/hash/key; no send is introduced.

Validation:

- `e2e/provider-off-ledger.html`: 10/10; [record](Memory-provider-off-ledger-browser.json). Synthetic off setup, saved record IDs, exact inspected plan, a lost confirmation receipt, same-key/payload retry, one simulated canonical commit, no optimistic local-close label, and no egress commands.
- Native held-transport regression extended through a real pinned-Core lock/unlock: its synthetic send leaves `outcome_unknown`; after removing native setup, local plan+confirmation changes the ledger to `cancelled` and `provider_status.configured` remains false. No HTTP or OS credential access.
- Full native tests 61 + 3; formatting and strict Clippy passed. Frontend tests 69/69, TypeScript/strict fixture checking, frontend/ordinary release desktop builds and pin/boundary checks (8 + 7 negatives) passed.
- Existing browser session flow 18/18 and Provider operation/extraction flow 12/12 rerun on the common-view refactor.

Browser receipt loss is simulated delivery behavior, not storage corruption or power-loss proof. Native data is in an owned temporary synthetic Vault. No real Provider, personal Vault, credential prompt, installed Activity, installer or deployment was used.
