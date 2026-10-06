# Saved capsule question — local evidence

Date: 2026-10-06. Baseline: `fc9f889`. Scope: displaying the selected capsule's stored `query`, extending the Runtime rendered-field guard and focused Context acceptance. Core, pin and adapter behavior are unchanged.

The preview input remains editable while a compile/read is pending. Its draft can therefore differ from the selected saved capsule. Context now shows "Saved question" from the actual inspected Core record, independently of the editable input. It renders as a plain React text node using the established content style. A draft edit neither changes that record nor attributes its decisions to the new draft.

The before-change native run passed 16/19 checks and failed the three saved-question assertions. The final run passed **19/19**: it edits the input while the real initial preview receipt is held, checks that the retrieved capsule still shows the original question, checks a local Mock dispatch's saved question, and previews literal markup which stays inert text. Existing capsule/request recovery and replacement-preview checks also pass. Before/after screenshots were inspected.

Type checking and **17 frontend tests** pass. Rust formatting, **19 host plus 3 pinned-Core field tests**, and Clippy with warnings denied pass. The updated field guard verifies the saved query equals the actual session question or preview query. Pin/domain guards pass with 8 and 7 negative checks; harness syntax and diff checks pass. The embedded-assets GNU release builds; no installer is produced.

Executable SHA-256: `ef55d0a4f0c22a7afede678ca85ba3965a72f29084589faadc5f04e144ec3209`.

Final native artifacts are retained in temporary `enouia-runtime-query-caption-final-20261006-01a10b3a`, with the baseline in `enouia-runtime-query-caption-before-20261006-01a10b3a`. This is synthetic local Vault and Mock evidence with controlled delivery timing. It is not a new full native regression pass, real storage-fault, live Provider, Narrator or installed-artifact proof. No personal Vault, migration, restore or production Activity was used.
