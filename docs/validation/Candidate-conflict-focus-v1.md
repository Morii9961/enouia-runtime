# Candidate conflict reader focus

Date: 2026-10-17 (Asia/Shanghai). Baseline `c0c19c9d18e7b0bff12cde473b570dbdb2dd2f2e`; Memory pin remains `8186aed861af08cf7a2c5d8c912a24eae51b4d66`.

The actual conflict reader did not focus newly read text or return focus after hiding its current observation. The new 15-assertion journey reproduced six failures on baseline, covering explicit/reread/Retry focus, its labelled target and Hide/late-reply focus. Existing moved-focus, error, unmount and keyed candidate-revision protections already passed.

The reader now retains the explicit read trigger until the latest read settles, focusing the literal current record or manual recovery control only while focus remains on the trigger/document. Retry preserves the original closure and arguments. The labelled text target adds no Tab stop. Hide clears pending intent and returns to Read. No record identity, revision comparison, write or conflict-resolution behavior changed.

Fresh checks pass: 98 frontend tests; 278 DOM assertions across 17 fixtures, including 15 new focus assertions and ten existing actual-Inbox conflict checks; TypeScript and strict typing of both conflict fixtures; desktop no-bundle release build (24.54 seconds); pin/domain guards with eight/seven negative checks; diff checks. Native sources/dependencies/pin remain unchanged; previous native test/Clippy/format evidence is reused from [the preceding slice](Source-suggestion-focus-v1.md).

All records, failures and reply timing are synthetic. Tests establish no browser layout/timing, Windows/Narrator, storage-error durability or Morii acceptance. No personal Vault, Provider HTTP, credentials, Activity activation, startup, installer or manual status snapshot was used. Owner changes remain preserved.
