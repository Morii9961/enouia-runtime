# UI v2 · deferred view and initial effect fixture waits

## Scope and diagnosis

W7 verification exposed a timing failure in the W6 #18 deferred history view.
The owner hook can accept a request before `HistoryTaskView` has loaded and
committed. `history-task-owner` slept for 20 ms after closing the import report,
then required the deferred receipt text to be visible. A standalone rerun failed
at the same assertion. Temporary diagnostic output showed:

```text
{"writes":1,"text":"Submit synthetic selectionRefresh and close reportLoading panel…"}
Error: held_admission_survives_report_close_without_duplicate_write
```

The fixture now uses its existing bounded predicate wait for receipt text and
report removal. The receipt remains held throughout. The original assertion
still requires exactly one write; all later identity, replay, lifecycle and
cross-Vault checks remain unchanged. No application behavior or Memory pin changes.

The subsequent full run failed at the already tracked #5
`inspector-action-focus`. A standalone rerun returned `passed:false` with:

```text
Error: UI timeout: BODY Read memory againactivefactSaved synthetic memoryMemorysynthetic-memory Copy IDRevisionr1Approved2026-10-13 08:00EvidenceCorrectCorrected contentPropose correctionDelete impactForget…Purge…
```

DOM readiness preceded the initial passive effects; a synthetic click could
arm focus restoration before that mount was flushed. Wrapping only the initial
render in React `act()` makes mounting and its read effects finish before the
first click. The act environment flag is scoped to that mount and restored.
All seven original focus/command assertions then pass. This uses the installed
React 19.3 API and [React's act guidance](https://react.dev/reference/react/act).
No focus production hook or assertion is weakened.

## Verification

- Focused `node tests/dom-fixtures.mjs --worker history-task-owner`: 13/13.
- Focused `node tests/dom-fixtures.mjs --worker inspector-action-focus`: 7/7.
- All six per-slice checks passed: `npm run check`, `npm test` (127 Node
  passes / 3 skips and 78/78 DOM), independent `npm run test:dom` (78/78),
  `npm run build`, `node scripts/check-memory-integration.mjs` and
  `node scripts/check-activity-retirement.mjs`. Build includes a fresh type check
  after both fixture changes. No Rust tests were needed or run for this test-only slice.
- No screenshot: this is a Happy DOM fixture repair, not native UI acceptance.

Local raw failure and diagnostic logs are in `.design/w7-tray/`:
`test-first-failure.log`, `history-task-owner-rerun.log`,
`history-owner-diagnostic.log`. Check logs are in
`.design/w6-history-owner-wait/`. Other #5 fixture flakes are not claimed fixed.
