# Native save for a model settings draft

Date: 2026-10-18 (Asia/Shanghai). Starting baseline `25cf2ec`, branch `codex/provider-draft-save`. This extends the [configuration draft](Provider-config-draft-v1.md) and [ADR-032](../adr/032-memory-native-provider-setup.md); Memory stays pinned at `56bc5eb` and its workspace IPC still has 47 commands.

## Behavior and boundaries

After generating and inspecting the non-secret JSON in Settings, **Save settings draft…** opens an owner-operated native file dialog. The host suggests its configuration directory only if that directory exists. The owner can create it or save a draft elsewhere, but only `%APPDATA%\com.enouia.runtime\memory-providers.json` is adopted at startup or explicit Reload settings. Saving is separate from reloading, credential entry, grants and requests.

The new Runtime command accepts only `draft`, never a page-provided path. Rust verifies the main window, setup admission, closing state, the 64 KiB bound and the existing closed settings parser before opening the dialog. Unknown/key fields are refused. Cancellation writes nothing. The chosen file name must exactly equal `memory-providers.json`; acknowledgements contain only cancellation or the fixed name, never a directory. Overlay capabilities do not grant this command. No dependency, general filesystem/dialog plugin, Memory contract or Activity command changes.

The native writer creates a unique sibling with `create_new`, writes the exact inspected bytes, syncs and replaces the destination. Ordinary partial-write or replacement failures preserve the previous destination and remove only this attempt's stage. This does not establish power-loss durability, crash-stage cleanup or concurrent-editor conflict detection. The save is serialized with reload and key changes and checks closing again after the dialog. Saving never applies a Provider or accesses the secret store.

The form locks its fields/generation/copy while a save is pending and prevents duplicate submissions. Cancel/error retains the draft; an unconfirmed reply asks the owner to check the selected file before another save and never retries automatically. Completion respects moved focus and cannot publish into a newly mounted form. Copying after a save describes the copy action without incorrectly denying the prior save.

## Development evidence

- Frontend client tests check exact command/argument shapes and reject malformed/inherited or path-bearing acknowledgements. The actual-form save journey covers cancellation, exact JSON, successful/ambiguous replies, no automatic retry, held-save ownership, focus, unmount and absence of reload/key/model calls. Native dialog IO in this journey is injected.
- Six new native tests check main/overlay scope, parser/size/busy/closing admission before any chooser, cancellation/name/exact bytes/no application, closing after the chooser, partial-write preservation and Windows sharing-denial preservation/cleanup/retry. Their chooser is injected; no real settings file, key or personal Vault is used.
- Full desktop native suite: 68 unit tests and 6 pinned-Core integration tests passed. Strict all-targets Clippy and Rust formatting passed. The final native edits after those tests change documentation comments/capability description only; command permissions and behavior are unchanged.
- The Memory pin guard passed with 8 negative cases. Resolved desktop dependency boundaries passed with 7 negative cases, 8 Memory packages and the same pin. Runner syntax and diff checks passed.

The final frontend gate passed 110 Node tests and all 63 DOM fixtures (834 assertions), including the save/copy sequence added during review. Production TypeScript/Vite, strict typing of both draft fixtures (with Vite's CSS declarations), Rust format and the final Windows GNU no-bundle build passed. The final native release build took 25.68 seconds in the owned C: target directory, leaving the already running Runtime untouched. Executable SHA-256: `37cebf3972c81251ccf50544a6ce43d04f5e2be33f5d7cb166861e201df003dc`.

These checks do not establish native save-dialog interaction, actual configuration overwrite acceptance, Credential Manager, HTTPS, personal-data workflows, installation or Morii acceptance. The executable was not launched or installed. Those remain in the unified desktop v1 acceptance.
