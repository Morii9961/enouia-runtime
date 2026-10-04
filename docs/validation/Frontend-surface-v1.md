# Quiet Runtime frontend v1 — local evidence

Date: 2026-10-04. Baseline: `854d52f`. Scope: the seven-page fictional desktop demo and its optional Tauri Windows shell. This report does not activate backend ADRs, persistence, live Activity control, real Provider calls, migration, deployment or A3/J1 acceptance.

## Executed checks

| Check | Observed result | Scope |
|---|---|---|
| `npm run check` | Pass | Strict TypeScript check of demo mutation view models |
| `npm test` | 4 pass | Proposal/provenance retention, linked revisions, invalid-action refusal, independent frozen fixtures |
| `npm run desktop:build -- --debug` | Pass | Vite production assets and embedded-assets Windows GNU debug executable |
| Native hidden startup | Pass | Process stayed alive for 6 seconds and created the expected main window; only that test process was stopped |
| Native `cargo fmt -- --check` | Pass | Separate desktop crate |
| Native `cargo clippy --all-targets --all-features --offline -- -D warnings` | Pass | Separate desktop crate and custom-protocol build feature |
| Domain dependency guard with self-test | 12 modules; 6 negative checks pass | Existing Core/Activity/shared production and build dependency graph remains independent of the GUI workspace |
| Browser layout | 21 observations pass | 7 pages × 1280×720, 1440×900, 1920×1080; one visible surface, no horizontal document overflow |
| Browser interactions | Pass | Enumerated below; production assets in the Codex browser |
| Browser logs | No warning/error entries in observed runs | Production React build; absence of logs alone is not functional proof |

Browser interaction checks covered seven Ctrl+1…7 destinations; literal search/empty inspector; candidate selection, blank-edit refusal and edited approval with original proposal retained; canonical revision and superseded history; unchanged recorded Context after editing; demo-only pause switch; Activity producer failure details and Context link; session switching; successful clipboard acknowledgement; and ring animations disabled by Reduced. Input-field arrows left the memory selection unchanged.

Cross-session regression: switching `Vault adapter planning → Evening, reading notes → B4 rehearsal review → Vault adapter planning → Evening, reading notes` yielded only each session's own memory writes. A duplicate state-label React key previously left a foreign candidate row behind. Lists now use record identity, not repeated `Canonical` / `Candidate` labels. The corrected sequence was observed without reload between session switches.

Memory column measurements: 236/532/440, 236/692/440, 236/1172/440. Session columns: 260/648/300, 260/808/300, 260/1288/300. These match the delivery's three tested sizes. Browser screenshots were captured for all 21 observations and final Home/Memory views in ignored local review output. This does not assert pixel identity on every font/DPI environment or absence of all intentional truncation.

## Evidence inventory

The [machine summary](frontend/surface-v1.json) contains source delivery hashes, source file hashes, sanitized layout observations, session regression rows and the hidden-startup result. It is a local validation record, not a backend or production receipt.

Windows executable: `apps/desktop/src-tauri/target/debug/enouia-desktop.exe`. SHA-256: `a220760776cc7374eea580f084c2e70e35fc86f842eaa3ed91b35b07aa080aab`. The binary is ignored, not distributed through Git. Native executable startup used embedded frontend assets with the development server stopped; only the independent browser preview server was present.

Source deliveries are kept in the user's original location; the zip and design engine runtime are not committed. The standalone HTML copies match the files of the same names inside the archive. Screen implementation is adapted from the delivered `.dc.html` source, with proprietary wrapper/runtime removed. All example record contents, IDs and hashes are fictional according to the delivery handoff.

## Remaining acceptance

- Native minimize/maximize/close/drag, real WebView keyboard/clipboard behavior and DPI need manual window acceptance. The 6-second hidden startup only proves process/window creation.
- Native release profile, installer, code signing, tray, global hotkey and overlay were not checked or shipped in this slice.
- Full frontend JavaScript type checking is not claimed: strict checking currently covers the typed demo mutation boundary. View components build as React JSX.
- Runtime live read/write handlers, canonical commit acknowledgements, durable restart continuity and actual Activity/Provider integration remain unimplemented.
- There is no production-facing network route, domain command handler, personal data import or persisted preference store in this app.

Existing backend Rust code, root Cargo dependencies and frozen design evidence were not changed. The boundary guard was refreshed; the backend behavioral test suite was not rerun for frontend-only code.
