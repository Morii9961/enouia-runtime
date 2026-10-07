# Memory list keyboard focus — local evidence

Date: 2026-10-07. Baseline: `327d619`. Scope: Runtime's explorer keyboard behavior and a focused native mode. List/inspection APIs, Core and pin are unchanged.

Up/Down previously changed the selected ID while leaving keyboard focus on the preceding button. Space then reactivated that old button. After Tab focused a different row, arrows also calculated from the old selection. The handler now uses the focused row as its starting point and moves selection and focus together; it remains bounded to loaded rows and scoped outside search/toolbar controls.

The baseline native run passed **9/13**, reproducing focus, Space, Tab-relative movement and last-boundary failures. The final run passes **13/13** with three approved synthetic memories through real pinned-Core IPC. It checks forward/reverse arrows, Space, Tab, both boundaries, unaffected search/toolbar arrows and an inspector matching the arrow-selected memory. All keys remain in the owned WebView2 CDP page. Debug ownership refusal and clean host exit pass; the screenshot was inspected.

Type checking, **17 frontend tests**, release build, harness syntax, diff and pin/domain guards pass (8/7 negative cases). No Rust, manifest or pin changes were made; the prior `aec907e` Rust formatting/Clippy and 19 host plus 3 field-test evidence remains applicable. The GNU release embeds the assets and produces no installer.

Executable SHA-256: `e3e461efe3cb677a57c1f5b264819d44e12621726b476027b3f80a5330d21b7c`.

Artifacts remain in temporary `enouia-runtime-explorer-keyboard-final-20261007-01a10b3a`, with the baseline in `enouia-runtime-explorer-keyboard-before-20261007-01a10b3a`. This is local keyboard/UI evidence, not Narrator, real Windows contrast-theme, installed artifact or full native acceptance. No personal Vault or production Activity was used.
