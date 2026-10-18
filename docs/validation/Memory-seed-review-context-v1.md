# Native seed review: context sources and P0 candidates

Date: 2026-10-18 (Asia/Shanghai). Runtime baseline `76c7dec`.
Memory is pinned to `2f1595bf38a32f43dd2c3f7f24f82b9fdc1a3342` in all three
Git dependencies, all eight lockfile source entries and the pin record.
The surface aggregate is
`f1d99344c596ba71d4f1c6d0abcc288a8284def4dcf5aec70b4e1ca3e997fff9`.

Candidate review previously hid recorded context dependencies and proposed
priority/title. It now shows context separately from citation evidence and
offers explicit, exact-revision, bounded source reads. Both citation rows and
read excerpts retain their reported evidence class; legacy missing information
is distinct from an empty recorded list. Context is not additional evidence,
corroboration, approval or a declaration of complete reading history. Source
content stays literal, and hide, revised rows and unmount discard late replies.

The P0 filter selects only currently loaded candidates. Counts distinguish the
total pending population, loaded rows and shown P0 rows. Loading more remains
explicit, and filtering retains drafts. Priority is the saved proposal's
annotation, not approval. No filter operation calls a write or model endpoint.
Ordinary review still requires the existing exact plan and confirmation.

Validation:

- Frontend: 98 unit tests, 62 registered Happy DOM fixtures / 809 assertions
  passed. The new context fixture contributes 13 checks, and the P0 fixture
  seven; see [aggregate evidence](Memory-seed-review-context-dom.json).
- Final TypeScript and Vite build passed. No dependency was added.
- `npm run desktop:build` passed in the optimized release profile, producing
  a standalone no-bundle executable with embedded frontend assets. No installer
  or installed application was changed.
- Pinned Core consumer and host tests: 61 host tests and six Core journeys
  passed using offline locked dependencies and two independent test threads.
  Additional rendered-field assertions then passed in the affected consumer
  journey: actual candidate context list and evidence/excerpt classes.
- Pinned Rust 1.98.1 formatting and strict all-target Clippy passed.
- Pin/surface checker passed with the committed Memory manifest and eight
  negative checks. Resolved production/build dependency boundaries passed
  with seven negative checks. No path override, branch dependency or local
  fork was used; Activity remains independent.

The test Vaults and component data are synthetic. The owner's migration and
recovery are recorded privately and in Memory's aggregate validation report.
This note does not assert personal-memory approval, real Provider sending,
cloud activation, an installed upgrade, broader storage-failure recovery,
Narrator acceptance or a completed personal frontend journey. The existing
Runtime checkout and its owner's concurrent changes remain separate.

The owner deferred native window inspection while the old Runtime remained in
the background. Actual rendered personal-Vault acceptance remains pending;
the new build is delivered separately and the old process is preserved.
