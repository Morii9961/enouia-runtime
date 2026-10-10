# Activity native setup protection during an actual host run

Date: 2026-10-09. Scope: installed-package selection and forgetting while the native Activity host has an accepted active run. B4/J1 remain partial; B5 inactive.

The frontend disables setup controls during ordinary execution, but the native setup entry point previously allowed a caller to open the folder picker and forget the saved package while a run was active. The [actual baseline](Activity-unified/setup-running-before.json) passes **9/12**, failing select refusal, clear refusal and exact saved-choice preservation. The baseline really opens/cancels the owned picker and clears the owned settings, then restores its choice through the real picker.

Native select/clear now refuse with the fixed `busy` code while a run is active. Clear serializes its choice mutation with run admission. Selection holds no run lock across the folder dialog, rechecks active state after the dialog returns and serializes validation/save/replacement. Frontend setup feedback translates only this known primitive code to a fixed message; arbitrary strings and private paths keep a generic fallback.

The [fresh native result](Activity-unified/setup-running-native.json) passes **12/12**. A new marked package uses the exact known development SSH/descendant stand-ins and their existing eight-second linger, with scoped paths and loopback-only origin verified before launch. Actual start and owned readiness trace precede setup attempts. Select refuses without a dialog, clear refuses without changing any saved-choice byte, status still reads the connected package, and the same accepted run is still active after the attempts. That run then reaches terminal, retains actual pending sequence 88, and normal picker cancellation/clear succeed. No native reply is modeled. No real receiver or account is invoked.

The post-dialog check is implemented, but a competing start while a picker is already open is **not exercised by this report**. This bounded case does not establish sustained stress or all admission races.

A [fresh actual-action/Core-isolation rerun](Activity-unified/setup-running-actions.json) passes **35/35**. [Hashed proof](Activity-unified/setup-running-proof.json) binds all raw reports, prior/new desktop, installer and helper identities. Twelve C17 selectors add this scope without signing off a row.

Fresh checks: frontend **58/58** after a 57/58 regression baseline, native host **34** plus pinned-Core **3** tests, fmt/clippy with warnings denied, strict TypeScript/frontend build, embedded desktop and unsigned NSIS build, **26 installer ownership checks**, Memory/domain guards (8/7 negatives), syntax/whitespace and **53 reports / 795 selectors / 55 negative evidence checks**. Native release compilation finished normally in 22.03s. Unchanged root producer 223-test/release evidence is reused. The installer is built, not installed, signed or published.

Memory remains pinned to ff692ccb6fbc1c387254d5ffbef41b105eeb2a84. Logon/power, additional storage faults, sustained stress and real-account/production acceptance remain open. No personal Vault/archive, existing/production task, credentials, server or Moriium source changes.
