# Activity refused selection preserves pending forget feedback

Date: 2026-10-09. Scope: frontend handling of real package-selection refusal after a failed clear. B4/J1 remain partial; B5 inactive.

After a failed deletion, selecting an invalid folder correctly returned not_a_package without changing native state. The frontend nevertheless replaced its setup state with that refusal, losing the earlier deletion warning and Retry forgetting package. The [old native run](Activity-unified/select-recovery-before.json) passes **23/25**, failing exactly those warning/retry assertions.

Selection refusal now updates its displayed error and preserves the existing setup state. Cancellation remains a no-change result. Successful selection still replaces setup normally. No native host or producer code changes in this slice.

The [new actual native run](Activity-unified/select-recovery-native.json) passes **25/25**. While an owned synthetic settings file is held without delete sharing, actual picker cancellation preserves feedback, and actual selection of the owned nonpackage output folder shows the selection error alongside the earlier clear warning and enabled retry. Native status and saved bytes remain exact. Page remount, retained-choice restart, handle release, successful clear and final unconfigured restart all pass. Complete Activity bytes stay unchanged; the helper self-expires after 90 seconds and is released in finally. This mode creates no Vault, changes no ACL and registers no task.

A [fresh actual-operation/Core-isolation rerun](Activity-unified/select-recovery-actions.json) passes **35/35**. [Hashed proof](Activity-unified/select-recovery-proof.json) binds six additional C17 selectors, all raw reports and build identities. Counts overlap and are not a full acceptance total.

Fresh checks: **57 frontend tests**, strict TypeScript/frontend build, embedded desktop and unsigned NSIS build, **26 installer ownership checks**, Memory/domain guards (8/7 negatives), syntax, whitespace and **46 reports / 662 selectors / 48 negative evidence checks**. Native compilation finished normally in 25.15s. The immediately preceding unchanged **34 host + 3 Core tests**, fmt/clippy and root producer 223-test/release evidence are reused. The installer is built, not installed, signed or published.

Memory remains pinned to ff692ccb6fbc1c387254d5ffbef41b105eeb2a84. No Memory-domain implementation, Activity protocol, scheduler operation, personal Vault/archive, credential, public upload, server or Moriium source change. Logon/power, remaining storage faults, sustained stress and real-account/production gates remain open.
