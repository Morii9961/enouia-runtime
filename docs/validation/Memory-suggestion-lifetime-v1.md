# Bound local suggestion batches to their mounted flow

Date: 2026-10-12 (Asia/Shanghai). Baseline `ea2c884`; Memory pin unchanged.

The shared application loop could submit another cursor step after its source/Session component had unmounted. The held-step fixture first failed `unmounted_source_starts_no_following_step`: a second local write was issued after removing the source panel.

The source and saved-Session callers now provide their mounted lifetime to the bounded helper. It checks that lifetime before each application step and the final read, and withholds publication if a read finishes after unmount. An already admitted step can finish; this is not an undo or a claim of cancelling a backend operation. The remaining saved cursor is observed through the existing Session recovery entry after return. Closing the native window to the tray keeps the page mounted and is unaffected.

Validation:

- `e2e/suggestion-lifetime.html`: 7/7; [record](Memory-suggestion-lifetime-browser.json). Unmount source with a held step, observe exactly that admitted step, remount a saved reader at cursor 1, unmount the saved write with its step held, no later result read/parent refresh, remount at completion, no additional model send/approval.
- Saved application 13/13 and source recovery 14/14 passed after the helper change.
- Frontend 69 tests, TypeScript, strict affected-fixture checks and frontend/ordinary release desktop builds passed. Native/backend and pin/boundary evidence is reused from [local saved application](Memory-saved-suggestion-apply-v1.md), because those sources and dependencies are unchanged.

The unmount, request delivery and saved cursor are synthetic. This demonstrates page-lifetime submission behavior, not real Windows shutdown, real Vault-switch races, rollback, physical input, remote cancellation or power-loss recovery. No personal data, Provider HTTP, credentials, installer, Activity or Memory domain change was used.
