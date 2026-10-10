# Combined Activity implementation and acceptance

Date: 2026-10-08. Integration parents: Codex `08dfc86ba12de61a336790ecb46e95ce31a14a8e` and Claude `7309cb92863694e34eb907317c323deef4f24fbd`. This combines Claude's remaining Runtime implementation with the native Activity integration on current main (`29401fe`), preserving the current shell and strict frontend checks. It does not activate B5 or sign off B4/J1.

## Latest verified state

The implementation combines both branch histories. Subsequent owner-authorized checks and fixes include the scoped follow-ups below. The records below name their exact binaries and scope. Counts overlap and must not be added as a full-acceptance total.

| Scope | Latest applicable evidence |
|---|---|
| Actual temporary Windows task, disabled/enabled reads and closed-UI sync | [63 assertions plus two 10/10 native page runs](Activity-native-scheduler-2026-10-08.md); older unchanged schedule-read implementation/binary |
| Explicit production send consent | [17/17 modeled native checks](Activity-send-confirmation-2026-10-08.md); every send request intercepted before native IPC |
| Production-confirmation slice desktop checks and unsigned installer | [37 frontend tests, 31+3 host/Core tests, strict build, fmt/clippy and 20/20 installer ownership checks](Activity-send-confirmation-2026-10-08.md); installer built, not installed |
| Persistent index recovery guidance | [48/48 native checks, 38 frontend tests, 31+3 host/Core tests and 26/26 installer checks](Index-recovery-guidance-2026-10-08.md); actual 47/48 baseline, temporary contention distinguished from persistent unavailability |
| Installed runner/management outside Git with bootstrap inputs removed | [21 checks](Activity-independent-package-2026-10-08.md); system-only child PATH, delivery disabled and no task |
| Ordinary Activity flow plus actual healthy Core rebuild | [35/35 native checks](Activity-index-isolation-2026-10-08.md); Activity bytes unchanged and approved Memory survives source failure |
| Same workflow plus actual missing-cache recovery | [41/41 native checks](Activity-missing-index-2026-10-08.md); canonical Vault and Activity bytes unchanged after cache removal/restart/rebuild |
| Same workflow plus malformed-cache search refusal and recovery | [45/45 native checks](Activity-malformed-index-2026-10-08.md); canonical list and Activity remain readable, search recovers after rebuild, canonical Vault and Activity bytes unchanged |
| Same workflow plus Windows index-sharing failure and retry | [46/46 native checks](Activity-locked-index-2026-10-08.md); exact busy/sharing-violation failure, Activity remains readable, release/rebuild/search recovery preserves canonical Vault and Activity bytes |
| Actual running-worker read overlap | [40/40 native checks](Activity-rebuild-overlap-2026-10-08.md); 241 approved synthetic memories, reads bracketed by the same running rebuild, canonical Vault and Activity bytes unchanged |
| Actual pre-first-batch cancellation and fresh rebuild | [46/46 native checks](Activity-rebuild-cancel-2026-10-08.md); real cancelled terminal, fresh operation identity and recovered approved memory search after Activity failure |
| Actual partial-progress cancellation and automatic catch-up | [49/49 native checks](Activity-rebuild-partial-2026-10-08.md); retained watermark 256, three complete search pages at sequence 496 and fresh rebuild recovery |
| Actual producer mutations during running Core rebuild | [47/47 native checks](Activity-rebuild-mutations-2026-10-08.md); pause/resume intentionally create generations, archive/sequence/pending/restored delivery and canonical Vault stay intact |
| Copied-author absence and independent static read/restart | [12/12 checks](Activity-static-read-2026-10-08.md); removed copied author modules, actual curl over loopback, unchanged public/package/Activity bytes, no deployed-site claim |
| Explicit safety classifications | [ADR-031 comparison follow-up](B4-validation-compatibility-2026-10-08.md): 30 frozen cases and 49 literal cases/75 checks, zero unclassified differences |
| Complete recorded-days keyboard access | [16/16 native history checks, 11/11 action checks, 39 frontend tests, 31+3 host/Core tests and 26/26 installer checks](Activity-full-recorded-days-2026-10-08.md); all dates/values verified after a 10/16 baseline |
| Observed next trigger | [65 real task assertions, two native 10/10 runs, 32+3 host/Core tests, strict build, fmt/clippy and 26/26 installer checks](Activity-next-trigger-2026-10-08.md); independent Windows timestamp matches; frontend 39-test evidence reused for unchanged source |
| Actual timer-driven invocation | [25 assertions](Activity-timed-trigger-2026-10-09.md), zero demand starts, paused no-write / resumed next sequence / exact pending retry; short rearmed boundaries; separate elapsed-hourly result below |
| Actual elapsed-hourly repetition | [27 assertions](Activity-hourly-repeat-2026-10-09.md), zero demand starts; one unchanged PT1H pair spans 3602 seconds, final short retry preserves exact pending, owned task removed; logon/power/production remain open |
| Strict frontend source semantics | [23/23 native checks, 42 frontend tests, 32+3 host/Core tests and 26/26 installer checks](Activity-source-contract-2026-10-09.md); modeled invalid replies plus real-read recovery after 14/23 baseline |
| Diagnostic/payload field boundaries and current desktop checks | [36/36 native checks, 45 frontend tests, strict build and 26/26 installer checks](Activity-export-contract-2026-10-09.md); extra fields refused, copy/preview isolated; unchanged 32+3 host/Core evidence reused |
| Actual Activity read-sharing failure and Memory independence | [45/45 native checks](Activity-read-failure-isolation-2026-10-09.md); real overview/preview failure, Memory list/search/page survive, release restores exact history without data changes |
| Request/reply correlation and desktop at that slice | [12/12 modeled and 35/35 actual-action native checks, 48 frontend tests and 26/26 installer checks](Activity-reply-correlation-2026-10-09.md); requested run/source/range/pause enforced, host/Core evidence reused |
| Run query recovery and desktop at that slice | [17/17 modeled and 35/35 actual-action native checks, 48 frontend tests and 26 installer checks](Activity-run-polling-2026-10-09.md); same-run read retries and all nonterminal stages retain operation locks |
| Bounded run-outcome display and desktop at that slice | [22/22 modeled and 35/35 actual-action native checks, 50 frontend tests and 26 installer checks](Activity-run-outcome-2026-10-09.md); unknown state text stays private and whole failure counts remain bounded to three sources |
| Actual CURRENT read ACL denial and recovery | [47/47 native checks](Activity-read-acl-2026-10-09.md); file read genuinely refused, Memory survives, exact descriptor/data restoration; other ACL/write faults remain open |
| Actual generation-creation write denial | [48/48 native checks](Activity-generation-write-acl-2026-10-09.md); real pre-staging pause failure preserves complete store, exact descriptor restores and subsequent pause/resume succeed |
| Package-choice reply boundary and desktop at that slice | [34/34 native setup checks, 35/35 actual actions, 53 frontend tests and 26 installer checks](Activity-setup-contract-2026-10-09.md); action-specific malformed replies refused, actual selection/cancellation/clear/reselection recover |
| Actual package-choice save/clear failure and desktop at that slice | [16/16 native fault/recovery checks, 35/35 actual actions, 55 frontend tests and 26 installer checks](Activity-choice-save-2026-10-09.md); saved false feedback, named retry and repeated-click guard; earlier harness/startup failures preserved |
| Actual current-pointer replacement failure | [50/50 native checks](Activity-pointer-switch-2026-10-09.md); readable old state and Memory survive two failed switches, complete unselected generations/prepared pointers remain, release recovers actual pause/resume |
| Actual saved-choice deletion refusal and restart | [12/12 native checks](Activity-choice-delete-2026-10-09.md); exact retained file really reconnects after restart, release and named retry remove it, subsequent restart stays unconfigured; Activity bytes unchanged |
| Bounded repeated pause/resume and independent Core rebuilds | [77/77 native checks](Activity-repeated-pause-2026-10-09.md); ten cycles, twenty mutations, ten unique rebuild IDs, per-cycle archive/sequence/pending/canonical-Vault preservation; sustained stress remains open |
| Actual bounded run records and restart | [47/47 native checks](Activity-run-history-2026-10-09.md); seventeen paused starts, exact latest-sixteen retention, oldest/post-restart contract refusal, no paused-store changes, actual resume |
| Saved-choice verification across page remount and desktop at that slice | [20/20 native setup checks, 35/35 actual actions, 56 frontend tests, 33+3 host/Core tests and 26 installer checks](Activity-choice-persistence-2026-10-09.md); verified optional saved flag retains failed-save feedback across remount and stays quiet after recovery |
| Explicit forget outcomes across page remount and desktop at that slice | [19/19 actual forget/remount checks, 35/35 actual actions, 57 frontend tests, 34+3 host/Core tests and 26 installer checks](Activity-clear-remount-2026-10-09.md); failed deletion retains warning/retry and actual recovery clears them across remount |
| Refused selection preserves pending forget feedback and desktop at that slice | [25/25 actual selection/forget/remount checks, 35/35 actual actions and 57 frontend tests](Activity-select-recovery-2026-10-09.md); cancellation and real invalid-directory refusal retain warning/retry without replacing native choice |
| Actual temporary current-pointer file creation denial and recovery | [52/52 native checks](Activity-pointer-create-acl-2026-10-09.md); two complete unselected generations remain, no temporary pointer is created, original files/current and canonical Vault stay exact, descriptor restoration permits actual pause/resume |
| Actual concurrent paused run admission | [37/37 native checks](Activity-run-admission-2026-10-09.md); ten pairs each accept one run and refuse one with retryable busy, correlate terminal records, preserve paused store and recover admission after completion |
| Actual selected-generation manifest read denial | [51/51 native checks](Activity-generation-manifest-acl-2026-10-09.md); CURRENT stays readable/exact, reads and pause refuse, UI disables mutation, Memory stays available and full descriptor/data restore precedes recovery |
| Actual cached installed-runner hash mismatch and recovery | [21/21 native checks](Activity-runner-hash-2026-10-09.md); owned paused binary copy changes are refused across reads/pause/run/selection, exact restore permits reselection/resume/restart without data changes |
| Actual running-host page remount and desktop at that slice | [11/11 actual remount checks, 35/35 actual actions and 57 frontend tests](Activity-run-remount-2026-10-09.md); native running state keeps mutations locked after remount, terminal refresh recovers without repeating the start |
| Actual quick-search window Activity permission scope | [19/19 native checks](Activity-window-scope-2026-10-09.md); actual overlay refuses eight operations and three setup actions while main reads and exact saved/data bytes remain intact; existing show/hide scope works |
| Actual running-host native setup protection and desktop at that slice | [12/12 setup checks, 35/35 actual actions and 58 frontend tests](Activity-setup-running-2026-10-09.md); select/clear refuse busy during an active run, preserve the saved choice and recover after the same terminal |
| Bounded absolute saved-choice startup admission and current desktop | [20/20 native startup checks, 35/35 actual actions and 58 frontend tests](Activity-saved-choice-boundary-2026-10-10.md); relative and oversized settings refuse without changing files, actual picker recovery remains available |
| Actual saved-choice file read sharing | [24/24 native checks](Activity-codex-choice-read-2026-10-10.md); same-host saved verification recovery and startup refusal/actual picker/restart recovery on unchanged binaries, initial 0/1 prerequisite retained |
| Retryable refused pointer switch for runs and receipts, and current desktop/runner | [46/46 actual run-switch checks after a 32/38 old-runner baseline, 50/50 and 52/52 pause drills, 35/35 actual actions, 24 runner-death checks, 58 frontend and 35+3 host/Core tests](Activity-late-switch-integration-2026-10-10.md); a refused commit fails once and the next run reserves the same sequence |
| Actual saved-choice file write sharing | [16/16 native checks](Activity-claude-choice-write-2026-10-10.md); refused real picker save keeps exact prior bytes, histories and store; release, picker, restart and clear recover on the integrated binaries |
| Staged settings saves and interrupted-write recovery | [18/18 replacement, 16/16 write refusal, 16/16 directory failure, 35/35 actual actions and four behavioral Rust tests](Activity-atomic-choice-2026-10-10.md); new frozen executable/unsigned installer identities in its proof |
| Same-handle install-manifest bounds | [21/21 manifest, 20/20 saved-choice, 18/18 atomic replacement and 35/35 actual-action checks](Activity-manifest-boundary-2026-10-10.md); three new Rust tests, new frozen desktop and unsigned installer |
| Windows subprocess stdout deadline | [16/16 actual pipe-deadline checks after a corrected 13/16 old-build baseline](Activity-runner-pipe-2026-10-10.md); inherited handles no longer postpone the 20-second read deadline, with 21/21 manifest, 18/18 replacement, 35/35 actions and 47+3 host/Core tests |
| Diagnostic copy feedback sequencing | [22/22 native interactions after a 15/22 old-build baseline](Activity-copy-lifecycle-2026-10-10.md); controlled clipboard promises with actual reads/picker keep old completions from labeling refreshed or reselected data, plus polling and actual action/Core regressions |
| Independent refresh/run-status error feedback | [23/23 native interactions after an 18/23 old-build baseline](Activity-error-ownership-2026-10-10.md); modeled failures preserve read retry and status error independently, with separate 22/22 copy, 11/11 polling and 35/35 actual action/Core regressions |
| Positive pending sequence response admission | [18/18 native boundaries after a 16/18 old-build baseline, 60 frontend tests](Activity-sequence-contract-2026-10-10.md); modeled zero/invalid pending fields refuse, exact positive and empty boundaries remain accepted, separate 35/35 actual actions/Core pass |
| Date-only metadata display precision | [16/16 modeled native checks, 62 frontend tests](Activity-date-only-2026-10-10.md); date-only labels retain the supplied date and unknown age, explicit-offset timestamps retain clock display, 35/35 actual action/Core regressions pass |
| Current offline evidence integrity | [67 reports, 1,117 selectors, 74 negative checks](B4-coverage.md); all 18 rows partial, B4/B5 false |

The late-switch integration desktop SHA-256 was `ff22aef58fce8709600499646e41f0dd00b79195be00510aca5aaa76e5835977` (source unchanged since a289e18, rebuilt in a different worktree path); unsigned installer is `3344efebfcffcbcc9e4b206ad3a56be2b543d0bf8f4f6dae906008d0bd6e112d`. Runner is `ea6b732bc3f4e4c932fca59bc1856351204aad0bfc80cd8da588a21e76d08dbf` with the store late-switch retraction, replacing `cb665419f42ff088425012f9e43cebf22a21d2647f0a1a19b97df7ca236c8b7a`; Memory stays pinned to `ff692ccb6fbc1c387254d5ffbef41b105eeb2a84`. Earlier reports name their exact prior executables; the late-switch integration supplies current 35/35 actual-action evidence with fresh 58 frontend and 35+3 host/Core tests. The scheduler implementation is unchanged.

Next acceptance work remains explicit: actual logon and battery/resume behavior; additional hourly sessions and production timing; disk-full/other-write-permission/mid-write storage faults, sustained rebuild stress and concurrent Activity collection/delivery; physical source-checkout absence or filesystem denial; author-process independence and deployed public/static behavior; broader Windows accessibility and signing; reviewed real seed/cutover/reconciliation and observed production publication. The last items retain their owner/production gates. No personal Vault/archive, production task, credentials, server or Moriium checkout was changed.

The earlier automatic rejection of the temporary task drill was superseded by scoped owner authorization; [41-check](Activity-scheduler-live-2026-10-08.md), 57-check and 63-check follow-ups passed with ownership-checked removal. No rejection workaround or production activation occurred.

A final [read-only public HTTPS refresh](Activity-unified/public-https-probe.json) at `2026-10-08T08:18:22.939Z` still returns curl 35/HTTP 000 for the About page and public manifest, with a Schannel handshake failure on this machine. It obtains no HTTP response and establishes neither a 404 nor a hosting cause. Production observation remains unverified.
A separate verified-TLS Node/OpenSSL [read-only probe](Activity-unified/public-https-node-probe.json) at 2026-10-08T11:54:58.979Z also receives no HTTP response from either fixed public URL (ECONNRESET before verified TLS). Node v24.15.0/OpenSSL 3.5.5 differs from the earlier Schannel client, so the failure is not observed solely in Schannel. The external web tool also could not access either URL. These are client observations, not proof of a global outage, 404, DNS/hosting cause, receiver deployment or production publication. The reusable probe keeps certificate verification enabled, limits elapsed time/body size, follows no redirect, and uses no credentials or writes to the origin.


The rest of this document preserves the merged slice's original findings, counts, binary identities and failed prerequisites. In particular, its two/twelve unresolved counts describe the older reports, not the current ADR-031 classification.

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

## Integration-time evidence

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

## Integration-time open acceptance and operational findings

The two GitHub differences are duplicate-date normalization and unsafe aggregate acceptance in legacy. Runtime follows the normative unique-date/safe-integer contract, fails that source and retains history. The twelve literal differences are four shapes across three sources: no timezone, RFC 1123, hour 24 and an impossible February date. Runtime refuses these seeds; the old parser accepts/rolls them. The proposed compatibility resolution remains retaining strict validation plus explicitly reviewed migration reconciliation. The architecture's closed deliberate-difference list has not been changed or waived here. See [B4 frozen investigation](B4-frozen-comparison.md) and [literal investigation](B4-literal-comparison.md).

The attempted `test-activity-package.ps1 -LiveScheduler` was rejected by automatic approval review **before execution** because registering/modifying/removing a real task crossed the scheduler-operation boundary. No workaround was attempted and no real task was created. The reviewable pending action is that script's uniquely named `Enouia-Activity-Test-<GUID>` task only: synthetic store, delivery disabled, current-user identity, initially disabled, explicit enable/invoke, ownership-checked removal and guarded cleanup under Runtime `target`. It never targets an installed or production scheduler. It still would not prove actual hourly/logon timing, battery/sleep behavior or production publication.

Read-only actual-hostname HTTPS probes to `https://morii9961.top/zh/` and `https://morii9961.top/status-data/current.json` return curl **exit 35, HTTP 000**, with TLS failure and no HTTP response. The older preflight's receiver-absence/404 finding cannot be freshly observed through this failure; its inferred hosting cause is not established by these probes. Reachability/observed publication (O6), Moriium-owned receiver/restricted account deployment (O2), reviewed real seed/cutover/reconciliation and production task activation remain open. Historical private-account inventory was not repeated, no personal archive/Vault was opened, no credentials were copied, no public upload was performed, and neither Moriium nor the server was changed.

Full B4/J1 acceptance, deployed About/cache behavior, power-loss/storage-fault acceptance, complete accessibility, signing and B5 cutover remain outside the completed implementation and synthetic checks above.

## Read-only public HTTPS refresh, 2026-10-09

[Supplemental HTTPS observation](Activity-public-https-2026-10-09.md) remains partial and outside the passed matrix selector counts. Node verifies TLSv1.3 for the About request before ECONNRESET, while the public manifest request records no verified handshake. Neither receives HTTP; independent Schannel checks still return exit 35/HTTP 000. This does not confirm publication or infer a global outage/hosting cause. No production change is made.

A subsequent [actual open-picker/run interleave](Activity-setup-dialog-race-2026-10-09.md) passes 15/15 on the same desktop: an owned picker observed before admission returns busy upon confirmation after a real run begins, preserving exact saved choice and terminal recovery. The earlier setup-running report retains its original narrower limitation; this follow-up exercises one interleaving only.

The [actual missing installed runner](Activity-runner-missing-2026-10-10.md) passes 22/22 on the unchanged desktop: cached reads/pause and both accepted runs refuse while the development runner remains present, actual reselection refuses the incomplete package, exact byte restoration recovers selection/resume/restart and paused store bytes stay exact. This does not remove a real source checkout or establish every replacement race.

The [actual missing-runner saved-choice restart](Activity-runner-missing-restart-2026-10-10.md) passes 26/26 on the same desktop: a real restart with the retained choice and absent runner shows the connection gate, invents no clear/save failure and preserves exact choice/paused bytes. Explicit clear, restoration and real reselection/resume/restart recover; no account, task, ACL or Vault is exercised.

The settings-save follow-up changes desktop source and binaries after the late-switch integration. Its [proof](Activity-atomic-choice/proof.json) names the newly frozen desktop, unsigned installer and independently rebuilt unmodified runner; earlier records retain their original identities. Memory's pin and producer code stay unchanged.
