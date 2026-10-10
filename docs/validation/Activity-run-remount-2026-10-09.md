# Activity running-host controls across actual page remount

Date: 2026-10-09. Scope: frontend mutation controls when an actual native host run outlives the Activity page. B4/J1 remain partial; B5 inactive.

Operation controls previously checked only the current page's run record. Navigating to Home and back discarded that record while the actual host still ran, incorrectly enabling actions. The [old native run](Activity-unified/run-remount-before.json) passes **10/11**, failing exactly the remounted mutation-control lock assertion.

Controls now remain locked while either the local run is nonterminal or the latest native overview reports running. This preserves the existing page-local outcome model; it does not invent a restored run record. Completion and an ordinary refresh restore controls. A stale running overview can conservatively retain the lock until the next successful refresh.

The [new actual native run](Activity-unified/run-remount-native.json) passes **11/11**. A new marked loopback-only package uses the known development SSH/descendant stand-ins, with an existing eight-second linger and no real receiver invocation. The harness verifies their exact helper hash, scoped paths and marker before launch. After a real page Run now, owned linger readiness proves the installed runner is active. Native overview and the same accepted run's status must both still report running before remounted controls are assessed. No command reply is modeled. All mutation controls remain disabled despite the page lacking a local run record. The same actual run reaches a terminal state; refresh recovers controls, exact sequence 88 pending remains and only one start request was sent. Existing helper processes expire and the harness waits for the terminal result.

A [fresh actual-operation/Core-isolation rerun](Activity-unified/run-remount-actions.json) passes **35/35**. [Hashed proof](Activity-unified/run-remount-proof.json) binds all reports, prior/new binaries and helper identities. Eleven additional C17 selectors cover this scope; counts overlap and are not full acceptance. Source collectors are absent and transport is a scoped local stand-in; no account or public upload is exercised.

Fresh checks: **57 frontend tests**, strict TypeScript/frontend build, embedded desktop and unsigned NSIS build, **26 installer ownership checks**, Memory/domain guards (8/7 negatives), syntax, whitespace and **51 reports / 764 selectors / 53 negative evidence checks**. Native compilation finished normally in 20.64s. Unchanged 34+3 host/Core tests, fmt/clippy and root producer 223-test/release evidence are reused. The installer is built, not installed, signed or published.

Memory remains pinned to ff692ccb6fbc1c387254d5ffbef41b105eeb2a84. Logon/power, remaining storage faults, sustained stress and real-account/production gates remain open. No personal Vault/archive, existing/production task, credentials, server or Moriium source changes.
