# Model configuration draft

Date: 2026-10-18 (Asia/Shanghai). Baseline `76c7dec`, on a feature branch based on the verified Inspector/import slices. Memory remains pinned at `56bc5eb`, with the same 47 commands.

This report records the generation/copy slice at that baseline. The later explicit native save action and its separate evidence are in [Native draft save](Provider-draft-save-v1.md).

## Product behavior

Native Settings now offers a local Model configuration draft before a Vault is opened. The owner selects OpenAI and/or Anthropic and explicitly supplies each exact model ID, context/output limits, streaming capability, verification timestamp and session quotas. No model, capability, date, token limit or price is prefilled. Explicit owner verification is required before generating a draft.

The generated JSON is a projection of the known non-secret settings fields, displayed as selectable read-only text. Copy writes only that inspected string to the clipboard after a click. Editing any field invalidates the previous output and copy acknowledgement. Clipboard failure retains the text; a held copy cannot duplicate itself or acknowledge an edited/newly mounted form. Observed host Exit disables the controls. Browser Settings retains its fictional mode.

This feature does not write Runtime's configuration file, reload settings, open Credential Manager, read a Vault or call a Provider. Saving the draft file and the subsequent explicit reload remain separate owner actions, as described in [the setup guide](../PROVIDER_SETUP_v1.md).

## Source and validation

The field contracts were checked against the exact pinned native implementation: Runtime `provider::parse`, Memory `Api::binding` (1–160 ASCII model characters) and `Timestamp::parse` (calendar-valid UTC with exactly three millisecond digits). The generator admits only positive safe JavaScript integers, preserving exact JSON values rather than rounding larger u64 input. Output must be smaller than the context window; attempts are 1–1000. Disabled providers contribute no settings. No new API or dependency is introduced.

Eight pure Node tests cover blank/default behavior, the shared native-parser fixture, projection/no mutation, disabled and unknown fields, model character/length boundaries, integer precision and malformed numeric syntax, output/quota boundaries, canonical/leap/invalid timestamps and explicit streaming/owner verification. The fixture is also consumed by a native parser test, which passed without any live transport or secret-store operation.

The actual-form DOM journey passed 13 assertions for explicit fields, validation/verification gates, exact output/copy bytes, stale output invalidation, failed and held clipboard calls, host disablement, rerender retention and unmount isolation. Happy DOM's missing fieldset-child `:disabled` inheritance is handled by inspecting the actual disabled fieldset; no browser acceptance is claimed. Strict fixture typing passed.

The combined `npm test` gate passed all 108 Node tests and 61 DOM fixtures (802 assertions), including the native/browser Settings routing checks. Production TypeScript/Vite and the Windows GNU no-bundle build passed using the owned C: scratch target directory (27.13 seconds for the native release build); no running Runtime was stopped. Targeted strict native Clippy, Rust format, script syntax, fixture typing and the pin guard (8 negative checks) passed. Native production handlers and dependencies are unchanged; the sole Rust addition is the shared-fixture parser test. Existing domain evidence remains applicable. This build was not launched, installed or signed, and all original owner files are preserved.

Executable SHA-256: `48ad3bd818913e7d3de9b83e3c19a35b3583790f7750f17d4abcf9eb12be8f9f`.
