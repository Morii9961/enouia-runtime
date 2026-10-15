# Visible Session and branch identities

Date: 2026-10-15 (Asia/Shanghai). Baseline `6c8029ba87870cccf07bb346884c6d4bd5dffd8d`; Memory pin remains `8186aed861af08cf7a2c5d8c912a24eae51b4d66`.

Session rows previously showed only dates and event counts, so branches with identical metadata looked the same. Rows now show the Session and branch IDs above that metadata. The selected header also identifies its branch, with exact IDs in titles when the existing formatter shortens them. It remains tied to the last successful detail observation while another selection waits. Styles stay scoped to native Memory Sessions; browser demo surfaces are unchanged.

Fresh verification passed: 90 frontend tests, TypeScript/strict affected fixture checking, frontend and no-bundle desktop build, and Memory pin/dependency guards (8 + 7 negatives). Native/Core production sources, dependencies and pin are unchanged; the 61 host + five Core consumer tests and formatting/Clippy freshly run earlier on this date remain applicable.

The expanded ID-filter Chrome fixture passed 18/18, including visible sibling identities, selection timing, exact full-ID titles, draft retention and row/header overflow checks at 920/1420-pixel content widths using long synthetic identifiers. Seven related fixtures passed 91 checks (109 total). [Browser summary](Memory-session-visible-identities-browser.json) records selected actual DOM results. The content-width probes cover the changed row/header, not full-app physical resize, monitor/DPI, keyboard or Narrator acceptance.

No new command, pin/domain change, personal Vault, Provider HTTP, credential, Activity activation or installer operation occurred. Owner files and manual status snapshots remain untouched.
