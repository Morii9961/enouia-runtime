# Explorer paging and read recovery — local evidence

Date: 2026-10-06. Baseline: `b55e85c`. Scope: Runtime's connected Memory explorer with the unchanged pinned Core.

Native reproduction found that submitting a new search retained the old rows and selected memory under the new title while the read was pending or failed. A failed read could therefore show unrelated data. A canonical commit also invalidated the paging cursor, with no direct first-page refresh action. The before-change focused run passed 5 of 10 checks and failed those specific behaviors.

Every submitted search and collection now mounts a fresh explorer. Rows, detail selection and pending reads belong to that submission. Initial results are unknown until observed; a read error does not become an empty search. Retry retains the failed read, while Refresh results starts from a new first page and clears selection. A later-page error preserves already observed rows until the owner refreshes. Core paging and cursor rules remain authoritative.

The focused harness seeds 26 approved synthetic memories through real remember/review-plan/confirm IPC. It checks the 25-row first page, a second page without duplicate rows, and an actual new canonical commit invalidating the existing cursor. Refresh then reads all 27 records with a fresh cursor. Controlled callback delivery tests pending new-query clearing, selected-detail clearing and read-error retry to a real empty search. The injected read error is synthetic; the stale cursor and pagination are real pinned-Core behavior.

| Check | Result |
|---|---|
| Frontend type checking and actual React/client rendering suite | Pass; 15 tests |
| Embedded-assets Windows GNU release | Pass; no installer |
| Focused native explorer acceptance | 11/11 pass on a fresh synthetic Vault |
| Full native regression | 62/62 pass on another fresh synthetic Vault; nine screenshots, zero autofill rows |
| Fixed-pin and domain guards | Pass; 8 and 7 negative checks respectively |
| Host/Core Rust tests, formatting and Clippy | Reuse the unchanged scope verified in `b55e85c`: 19 host and 3 pinned-Core tests pass, formatting clean and warnings denied |

The paging screenshot was inspected. Reports and screenshots remain in temporary fixture folders. Connections use the process-ownership guard; no fixed debugging port is assumed.

Release executable SHA-256: `1ee707d6455f7f97e40dd20b76d6e09462554429f7e7df1f0693f5c2e893cb56`.

No personal Vault, migration, cloud Provider, Activity control, installed artifact or production activation was used. This covers the tested page sizes and one sequence; concurrent commits throughout multiple page requests, arbitrary response timing, actual disk failures, Narrator and contrast theme remain unverified. Memory's contract, revision, source rules and data format remain unchanged.
