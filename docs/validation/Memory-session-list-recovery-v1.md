# Session list read recovery

Date: 2026-10-14 (Asia/Shanghai). Baseline `2cd419f15b9c5a51420e21362d3fde2164a1d6b8`; Memory pin unchanged.

An initial nonretryable `session_list` failure had no read-only recovery action. The controlled failure reproduced this as `initial_nonretryable_list_failure_has_read_recovery` against the baseline.

Sessions now offers Refresh session list, or Read session list again after failure. The action rereads only the list, preserves the selected transcript and both drafts, and labels retained rows as the previous successful list read after failure. Unknown list contents remain distinct from a successfully observed empty list. A list failure does not invalidate an independently observed session detail. The recovery control is withheld during admitted session/Provider/suggestion writes and detail reads; synchronous pending/ownership guards also refuse a second refresh.

The actual Sessions [browser fixture](../../apps/desktop/e2e/session-list-recovery.html) passed 11/11 synthetic checks: initial failure/recovery, no creation, labeled retained rows, transcript/draft preservation, independent detail validity, refreshed/new/empty rows, read-only recovery, and held Mock-write ownership. Session identity 11/11 and Provider/session recovery 18/18 passed. TypeScript, strict new-fixture TypeScript, all 69 frontend tests, frontend/ordinary no-bundle desktop release build and pin/dependency guards (8 + 7 negatives) passed. Native production/test source is unchanged, so the earlier Core and host evidence remains applicable.

This is controlled browser IPC, including one explicit synthetic local Mock send. No real storage failure, personal Vault, real Provider, credentials, Activity activation, installer, physical Windows/Narrator or human acceptance occurred. Existing reports and manual status snapshots are preserved.
