# Review-plan keyboard acceptance — local evidence

Date: 2026-10-06. Application baseline: `50a99bc`. This slice adds only a focused native harness mode and documentation; application assets, host code and Memory pin are unchanged.

The owned WebView2 test starts on a fresh synthetic Vault, saves one synthetic candidate through real pinned-Core IPC and opens its review plan through the native frontend. It checks initial focus on the plan heading, the dialog's labelled/description references, reverse Tab containment from the heading, forward Tab wrapping from Confirm to the diff, and the existing Ctrl+4 navigation guard. Escape closes the plan and restores focus to the initiating Accept button. Real Core reads then report zero approved memories and one pending candidate, establishing that cancellation did not accept it. The screenshot was inspected.

Final focused run: **9/9 pass**, including refusal of a foreign debug listener and clean host exit. All keys use the owned page's CDP session; no OS input is sent. The executable is the already verified embedded-assets release with SHA-256 `c86271e853ac5c61602dc4cda096d899b39468be8e0445e29f88822baeb20cc4`. Frontend, build, pin/domain and Rust evidence is reused from the unchanged application slices. Harness syntax and diff checks pass.

Two development attempts exposed harness mistakes (missing Memory navigation, then an incorrect list argument). These were corrected using the existing frontend schema, without application changes. Only the final run is counted as acceptance. Its report and screenshot are retained under the temporary `enouia-runtime-plan-keyboard-verified-20261006-01a10b3a` fixture folder.

This covers cancellation while confirmation is idle. Confirm-in-flight keyboard timing, repeated Escape, inaccessible/expired plans, screen-reader announcements, real Windows contrast themes and installed artifacts remain unverified. The DOM label checks are not Narrator evidence. W05 remains partial, and no personal Vault, migration or actual restore was used.
