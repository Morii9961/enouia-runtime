# Candidate inbox paging and fresh observation

Date: 2026-10-13 (Asia/Shanghai). Baseline `6e14fd7`; exact Memory pin unchanged.

Inbox previously read only the first 50 pending candidates and discarded `nextCursor`. The new fixture failed `first_page_offers_remaining_candidates` against that baseline.

Inbox now reports the observed total and shown count, appends a bounded page through the Core cursor, and offers Refresh candidates to restart at page one. Failed reads retain labelled previous rows and unsent candidate/Statement/Topic key drafts, but withhold review and remember writes until successful observation. An explicit refresh is available even after a nonretryable initial read failure. The disappearing last-page button returns keyboard focus to the inbox title while respecting focus moved elsewhere.

Validation:

- Synthetic browser fixture 12/12 ([record](Memory-candidate-paging-browser.json)): 50 + 1 pages, held reads, canonical-stale cursor, failed and successful first-page refresh, draft retention, unique rows, last-page focus, explicit initial-error recovery and read-only command trace. A focus assertion initially checked before the passive focus effect; the fixture now waits for its actual focus result.
- New fixed-Core consumer test reads 2 + 1 actual pending candidates with distinct IDs, observes a null last cursor, creates another synthetic candidate, confirms the old cursor is canonically stale, refreshes to a new cursor/total, and confirms none became an approved memory. All 5 consumer tests, formatting and strict Clippy passed. The unchanged native-host 61 tests reuse this turn's preceding successful run.
- Frontend tests 69/69, TypeScript/strict fixture checks, frontend and ordinary no-bundle desktop build passed. Pin/dependency checks passed with 8 + 7 negatives.

Browser error timing is controlled; the Core test uses an owned temporary Vault. No real storage-fault recovery, Provider/credentials, personal Vault, human acceptance, installer, Activity activation or Memory domain/protocol/pin change is claimed.
