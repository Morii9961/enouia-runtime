# Candidate and session list reads — local evidence

Date: 2026-10-06. Baseline: `1b65369`. Scope: the native Inbox and Sessions frontend read states. The pinned Memory Core, commands and host are unchanged.

An initial read failure previously displayed "No sessions yet" or "Nothing waiting for review" alongside its error, and the unobserved candidate count was zero. Native reproduction held an actual list result and injected a retryable read error. It reproduced the false empty/count claims; the first attempt's later recovery wait also used body text for a textarea value and was corrected in the harness.

Inbox now keeps an unknown count until a successful page arrives, explains the initial read, and reports unavailable candidates after an error. Sessions keeps an unobserved list separate from an observed empty one and explains its read. Neither surface reports an empty list from a read failure. Existing observed rows and unsent drafts are retained through read retries.

| Verification | Result |
|---|---|
| Type checking and frontend suite | Pass; 16 tests, including first-render unknown Inbox/Sessions assertions |
| Embedded-assets Windows GNU release | Pass; no installer |
| Focused native list acceptance | 13/13 pass on a fresh synthetic Vault |
| Pin/domain guards | Pass; 8 and 7 negative checks |
| Harness syntax and diff checks | Pass |

The native run checks pending and failed reads, then retrieves real Core results: an observed empty session list, a newly created session, one pending candidate after retry and an observed empty inbox after its real review confirmation. Unsent Statement/Topic key values survive the retry. The final screenshot was inspected. The error injection proves frontend recovery, not an actual storage error. Reports/screenshots remain in the temporary `enouia-runtime-lists-before-20261006-01a10b3a` and `enouia-runtime-lists-final-20261006-01a10b3a` fixture folders; only the final 13/13 run is counted as acceptance.

Executable SHA-256: `a32df49da3d01273e0850376bf233a95748a49bc4cad4d0c05683766f1c6386b`.

Unchanged Core/host and unrelated flows reuse earlier scoped evidence. This is not a new complete native regression pass. Real storage faults, broader concurrent draft/branch timing, Narrator and installed artifacts remain unverified. No personal Vault, migration, restore, cloud Provider or production Activity was used.
