# Combined Activity implementation and acceptance

Date: 2026-10-08. Integration parents: Codex `08dfc86ba12de61a336790ecb46e95ce31a14a8e` and Claude `7309cb92863694e34eb907317c323deef4f24fbd`. This combines Claude's remaining Runtime implementation with the native Activity integration on current main (`29401fe`), preserving the current shell and strict frontend checks. It does not activate B5 or sign off B4/J1.

Follow-up: the owner's subsequent scoped authorization allowed the formerly rejected temporary scheduler drill. [Actual scheduler acceptance](Activity-scheduler-live-2026-10-08.md) records 41 successful checks at `d2f524e`, including real paused and busy invocations and verified removal. The rejected-attempt paragraph below remains the integration-time finding.

Further follow-ups: the optional closed-UI drill now passes 57 actual-scheduler checks. [Compatibility clarification](B4-validation-compatibility-2026-10-08.md) records ADR-031 and fresh comparisons with zero unclassified differences, while preserving the two/twelve historical unresolved counts below. Neither follow-up activates B5 or signs off complete B4/J1.

## Integrated behavior

- C15's copied receiver/publisher harness now covers success-time loss, source loss, date loss and whole-batch clock rollback for all three sources. Transport completion does not clear unpublished pending bytes.
- Migration inspection flags retained timestamps that the public manifest cannot publish. Import refuses them before creating a generation; it never restamps history.
- [ADR-029](../adr/029-claude-retains-higher-days.md) keeps archived higher Claude day totals when pruned transcripts yield a lower report. GitHub and Codex corrections retain their existing policy. Cowork discovery supports deeper trees with finite depth and directory limits.
- [ADR-030](../adr/030-production-activation-path.md) provides explicit paused/unregistered production packaging, disabled-first registration and a separately gated enable operation. These are implementation paths; no production task or package was activated in this integration.
- [ADR-028](../adr/028-activity-surface.md) connects the native Activity page to the separately installed runner. The current shell lifecycle, strict TypeScript configuration and pinned Memory adapter remain unchanged. Browser previews and the Runtime Inspector remain explicitly fictional.

The merge uses Claude's branch ancestry rather than duplicating its commits. Overlapping native UI/runner-read files retain the already verified modern integration and its bounded queries, structural response validation and stale-reply ownership. Historical Claude reports retain their original identities and limitations. The two existing untracked handoff documents are preserved outside this commit.

## Reproduced gaps and fixes

The Cowork inventory budget counted intermediate directories but omitted `.claude` store leaves. A synthetic four-directory tree incorrectly succeeded with a two-directory limit. The new regression test failed before the fix; inventory now counts store leaves against the same limit and fails closed. The test uses only empty temporary directories.

The production enable gate treated a null `paused` flag as resumed. A modeled malformed overview enabled the task double before the fix. Enable now requires the correct overview version/kind, production mode, explicit Boolean delivery-enabled and resumed flags, absent pending work in both fields, an observed lowercase SHA-256 and an exact valid UTC observation timestamp. It refuses imported receipts without a locally observed publication time. Root task paths consistently use `\`, matching ownership/query/uninstall. PowerShell versions exposing `DateKind` parse wire dates as strings to preserve exact timestamp validation.

The packaging harness adds 15 malformed/refused reply cases and checks that each leaves the task double disabled. A valid modeled observed publication enables only the owned task double, repeated enable is refused, and Activity files remain byte-identical. The probe override is restored afterward. No modeled response is presented as actual production evidence.

## Current evidence

| Check | Result |
|---|---|
| Root workspace tests, locked | **223 passed**, including the new Cowork budget regression |
| Root fmt and clippy, all targets, locked, warnings denied | Pass |
| Release runner and examples | Built successfully |
| [Installation/activation checks](Activity-unified/package-checks.json) | **87 passed**, scheduler doubles; real executable and isolated files |
| [Native Activity drill](Activity-unified/native-smoke.json) | **29/29 passed** with the final installed runner and real desktop adapter |
| [Keyboard page workflow](Activity-unified/keyboard-smoke.json) | **11/11 passed**; native directory selection is assisted as described below |
| [C15 copied receiver/publisher](Activity-unified/reference-regression.json) | **97 checks**, ten regression candidates, passed; actual curl over loopback |
| [Fixed-input comparison](Activity-unified/frozen-comparison.json) | 30 cases: 23 equal, 3 known policy differences, 2 clock refusals, **2 unresolved GitHub differences** |
| [Unit/zone/timestamp literals](Activity-unified/literal-comparison.json) | 49 cases, 37 checks; **12 unresolved timestamp differences** |
| Historical Activity evidence-index self-test | 10 reports, 18 rows, 127 selectors, 8 negative checks; 0 signed-off rows; B4/B5 false |
| Fresh domain dependency metadata/checker | 12 modules, no Memory dependencies, 10 negative checks |
| Memory integration checker/self-test | Exact pin consistent, 7 locked packages, 8 negative checks |
| Changed JavaScript harness syntax and Git whitespace checks | Pass |

Build SHA-256:

- Final runner: `cb665419f42ff088425012f9e43cebf22a21d2647f0a1a19b97df7ca236c8b7a`.
- Unchanged desktop release: `de6f86e5e247e7601c3c93eed0494a9091a10b924b0d1d67531f79e074aaa765`.
- Pinned Memory revision: `ff692ccb6fbc1c387254d5ffbef41b105eeb2a84`.

The earlier [desktop integration report](Activity-desktop-integration-2026-10-08.md) supplies still-applicable frontend 36 tests, desktop host/Core 31+3 tests, strict frontend build, desktop fmt/clippy, unsigned NSIS build/ownership checks and native Memory/shell 101/101 evidence. Desktop production source, manifests, pin and binary did not change in this merge; only the Activity acceptance harness gained a focused mode. These checks were reused, not claimed as freshly rerun.

Reference comparisons copy explicitly selected public Moriium files at `fd48f88c8b480480fd48a8efe36ef400b3be99b8`. Relevant files were clean and unchanged afterward. No reference code enters Runtime's regular build or package.

## Native workflow observations

The 29-check drill confirms native package selection, path redaction, three-source totals/calendars, public preview/hash, filtered day reads, invalid-request refusal, unknown scheduler status and non-fabricated next trigger. Controlled stale/error callbacks cannot restore old values. A real synthetic Memory candidate remains available after malformed Activity replies. Pause/resume are durable runner state. A collector-less run retains prior history and commits sequence 88 pending; termination during retry and restart retain its exact hash. The isolated package choice can be cleared.

The keyboard mode uses WebView-scoped Ctrl+5, Tab and Enter events to reach the Activity gate, skip link, selection button, recorded-day tables, public preview, pause/resume, run, retry, refresh and change-package controls. It neither assigns page focus nor clicks page controls through DOM calls. The Windows folder picker is filled by the existing PID-bound UI Automation helper, so this is a keyboard **page** workflow, not a complete keyboard-only Windows dialog or Narrator acceptance. Observed-publication and keyboard-pending screenshots were inspected; paths and synthetic values stay in temporary test outputs.

The first focused attempt ended without a preserved final report. A subsequent attempt reached 2/3 before the folder helper found no dialog: the harness omitted Enter's character text and therefore did not activate the button. The final run follows the [Chromium key-event protocol](https://chromedevtools.github.io/devtools-protocol/tot/Input/#method-dispatchKeyEvent) and [Playwright's Chromium input pattern](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/chromium/crInput.ts), supplying Enter text and using raw key events for non-text keys. It passes 11/11. This was an acceptance-script correction; no product keyboard handler changed.

## Open acceptance and operational gates

The two GitHub differences are duplicate-date normalization and unsafe aggregate acceptance in legacy. Runtime follows the normative unique-date/safe-integer contract, fails that source and retains history. The twelve literal differences are four shapes across three sources: no timezone, RFC 1123, hour 24 and an impossible February date. Runtime refuses these seeds; the old parser accepts/rolls them. The proposed compatibility resolution remains retaining strict validation plus explicitly reviewed migration reconciliation. The architecture's closed deliberate-difference list has not been changed or waived here. See [B4 frozen investigation](B4-frozen-comparison.md) and [literal investigation](B4-literal-comparison.md).

The attempted `test-activity-package.ps1 -LiveScheduler` was rejected by automatic approval review **before execution** because registering/modifying/removing a real task crossed the scheduler-operation boundary. No workaround was attempted and no real task was created. The reviewable pending action is that script's uniquely named `Enouia-Activity-Test-<GUID>` task only: synthetic store, delivery disabled, current-user identity, initially disabled, explicit enable/invoke, ownership-checked removal and guarded cleanup under Runtime `target`. It never targets an installed or production scheduler. It still would not prove actual hourly/logon timing, battery/sleep behavior or production publication.

Read-only actual-hostname HTTPS probes to `https://morii9961.top/zh/` and `https://morii9961.top/status-data/current.json` return curl **exit 35, HTTP 000**, with TLS failure and no HTTP response. The older preflight's receiver-absence/404 finding cannot be freshly observed through this failure; its inferred hosting cause is not established by these probes. Reachability/observed publication (O6), Moriium-owned receiver/restricted account deployment (O2), reviewed real seed/cutover/reconciliation and production task activation remain open. Historical private-account inventory was not repeated, no personal archive/Vault was opened, no credentials were copied, no public upload was performed, and neither Moriium nor the server was changed.

Full B4/J1 acceptance, deployed About/cache behavior, power-loss/storage-fault acceptance, complete accessibility, signing and B5 cutover remain outside the completed implementation and synthetic checks above.
