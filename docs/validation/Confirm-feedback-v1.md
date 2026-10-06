# Review confirmation feedback — local evidence

Date: 2026-10-06. Baseline: `9d64d33`. Scope: Runtime's shared review-plan dialog and focused native harness. Memory pin, host, schema and write authority are unchanged.

Waiting for confirmation previously disabled the two buttons without explaining the pending result. Controlled delivery of a real confirmation receipt also exposed an intermittent repeated-Escape close/reopen interval: the dialog remained mounted but temporarily lost its open state before the existing close handler reopened it.

The dialog now explains that confirmation was submitted and it is waiting for Memory's result. While waiting it sets `closedby="none"`, blocks Escape's default action in the key handler, and retains the close-event recovery. Idle/error state restores `closerequest`; ordinary Cancel and Escape still work. See [the browser's dialog close policy](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog). It claims neither success nor cancellation before receiving the result.

The `--confirm-only` harness holds the real Core receipt after Core has committed. This is controlled frontend delivery timing, not evidence of a slow/failed canonical write. It checks disabled actions, waiting text, repeated Escape, navigation suppression and a deterministic close-event fallback. Removing the optional attribute in the test page independently exercises the key handler; this is not an older WebView emulation. A controlled retryable delivery error keeps the same plan. Read-only CDP request observation confirms that Retry resends the same arguments and idempotency key, and the real Core returns the same commit receipt. Core then has exactly one approved memory with the plan's record ID.

| Verification | Result |
|---|---|
| Final focused native confirmation | 17/17 pass on a fresh synthetic Vault |
| Idle keyboard regression on the final executable | 9/9 pass, including Escape and return focus |
| Type checking and frontend suite | Pass; 15 tests |
| Embedded-assets Windows GNU release | Pass; no installer |
| Full native regression | Partial: 34 passed, then foreground guard refused OS hotkey input. Not a full pass. |
| Pin/domain guards | Pass; unchanged pin, 8 and 7 negative checks |
| Harness syntax and diff checks | Pass |

The waiting screenshot was inspected. Final focused reports are under temporary `enouia-runtime-confirm-complete-20261006-01a10b3a` and `enouia-runtime-plan-idle-regression-20261006-01a10b3a` folders. The full partial report is in `enouia-runtime-confirm-full-regression-20261006-01a10b3a`. An early harness assertion used the wrong list field and a later attempt tried to observe an immutable Tauri function; the final assertion observes actual request bodies without changing that transport. No security setting was weakened.

Executable SHA-256: `f6a85bc9d5c6bcb73f4d10cdf9428c70beb28ffd9dbc258ed1acda4198a49e15`.

Storage faults, process loss during a real commit, older installed WebView versions, screen-reader announcements and installed-artifact behavior remain unverified. These checks cover synthetic local data and simulated delivery/error timing, with actual Core receipts. No personal Vault, migration, restore, cloud Provider or production Activity was used.
