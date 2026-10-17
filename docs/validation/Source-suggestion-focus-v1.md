# Source suggestion return focus

Date: 2026-10-17 (Asia/Shanghai). Baseline `3f6ce4a30f70a7d16e23222c249a6701bdf36609`; Memory pin remains `8186aed861af08cf7a2c5d8c912a24eae51b4d66`.

Closing the real Source/ExtractionPanel removed the focused Close, Don't send or Leave this request button without returning to the suggestion entry. The new actual-component journey reproduced five failed focus assertions among 15 on the unchanged baseline: provider off, setup error, declined preparation, unconfirmed send and completed run. Source preservation, no replay/write and moved-focus checks already passed.

Source now records explicit close intent and focuses the remounted Suggest memories entry only while focus remains on the original trigger or document. Moving focus elsewhere wins. Source identity/availability changes and a new source read discard pending return intent. No ExtractionPanel state, request arguments, send/retry ownership, source paging or queue rules changed.

Fresh checks pass: 98 frontend tests; 253 DOM assertions across 15 fixtures, including the new 15/15 journey and existing source/pause/resume checks; TypeScript and strict fixture typing; desktop no-bundle release build (24.69 seconds); pin guard with eight negative checks; domain guard with seven negative checks; diff checks. Native sources, dependencies and pin are unchanged; prior native test/Clippy/format evidence is reused from [the preceding slice](Memory-source-focus-v1.md).

All source/provider/preparation/send/operation replies are synthetic, with no real Provider HTTP, credentials or personal Vault. DOM-model focus checks do not establish browser timing, Windows/Narrator or Morii acceptance. No installer, startup change, Activity activation or manual status snapshot was performed. Owner files remain untouched.
