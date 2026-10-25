# Native seed review: context sources and P0 candidates

Historical October 18–19 evidence. Current-main integration and its new verification are recorded in [the October 25 completion](Memory-seed-review-completion-2026-10-25.md); the old pin and counts below are not the current release baseline.

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

## Portable handoff correction (2026-10-19)

The first portable copy included only the executable. PE import inspection
confirmed its direct dependency on `WebView2Loader.dll`; that DLL existed in
the same release build but was missing from the delivery directory. Launching
the incomplete copy exited before a Runtime window appeared. This was a
handoff omission, and the successful build did not validate that copy.

Copying the same build's 160,880-byte loader fixed startup. Both delivered
files match their build-output SHA-256 digests:

| File | SHA-256 |
|---|---|
| `enouia-desktop.exe` | `30f2b5c9c8ff01b0cc13a41066f1d90735068daea6968f048567fe30ffb90b5b` |
| `WebView2Loader.dll` | `86545b66cdb0603bc26b626fb9ad610cb6e71f28d468f5ea66df23b03dda96d5` |

The corrected program remained running and held its Vault host lock. Native
read-only observations confirmed Vault open, 185 pending candidates, the first
50 loaded rows, distinct evidence/context sections and a P0-filter count of
17 in those loaded rows. Full-page traversal and selected-source text reading
were not completed in this inspection. No review confirmation was performed.
Subsequent CLI status remained healthy at sequence 408; all 185 acceptance
plans built with zero failures and no confirmation or Canonical writes.

This follow-up changes delivery documentation only. The pinned Core, source,
build and synthetic-test evidence above remain unchanged; no full-suite rerun
is implied. The private package manifest now inventories both runtime files.
