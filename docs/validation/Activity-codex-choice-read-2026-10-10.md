# Actual saved-choice read sharing and recovery

Date: 2026-10-10. Common baseline: 451d70ed245d1a46166bf7d29a941b69cca3f111. B4/J1 remain partial; B5 inactive.

The prior coverage binds CURRENT sharing refusal, settings save/delete failure, and bounded absolute startup settings. It contains no actual sharing refusal on the picker-created saved-choice file itself. This follow-up fills that scoped acceptance gap without changing product code or public contracts.

The [actual native result](Activity-codex-choice-read/native.json) passes **24/24**. A finite owned Windows helper opens only the new synthetic settings file with FileShare.None, and an independent Node read genuinely refuses. The already-connected host retains the exact three-source histories, reports saved false, and shows its existing unverified-choice warning after page remount. Releasing the handle restores exact settings bytes, saved true in the same host, and a quiet remount.

A new host started under a second actual hold remains unconfigured, refuses overview, displays no history and invents no save/forget failure. Release plus the actual native picker reconnects and stores the same exact canonical settings bytes; a further restart verifies that choice. The complete Activity tree stays identical throughout. This verifies explicit picker recovery, not automatic startup cache reloading. No reply is modeled and no mutation of the producer store is made.

The first [prerequisite report](Activity-codex-choice-read/prerequisite.json) is **0/1: no main page**, before any sharing probe. The independently copied desktop was missing its WebView2Loader.dll. The loader was copied into the owned binary directory and a separate new fixture produced 24/24. The original report and Temp fixtures are retained.

[Hashed proof](Activity-codex-choice-read/proof.json) binds both raw reports, probe/harness/preparer, unchanged desktop/runner, copied WebView loader and stand-in. The native harness verifies listener ancestry against its spawned Runtime PID before CDP use; dialogs are PID-bound. Settings, profile, package, ports and processes belong to this session. No competing native Activity host existed before dispatch; Claude's work was limited to independent store fixtures.

Fresh checks: both E2E modules' syntax, Git whitespace, Memory integration **8 negatives**, and the offline evidence checker. Product sources, manifests, locks, Memory pin and desktop/runner identities are unchanged. The a289e18 frontend **58**, host **35 + Core 3**, fmt/clippy, strict/native/unsigned-installer build, installer **26** and actual operations/Core isolation **35/35** evidence is reused, not rerun or claimed as new product verification.

Implementation branch: codex/activity-desktop-followup; worktree: C:UsersMorii.codexworktreesactivity-desktop-followupEnouia Runtime. The slice changes only desktop E2E and new Codex validation artifacts; public index/summary integration is serialized afterward. No personal Vault/archive, account, credentials, production upload/task, server, Memory domain/pin or Moriium source was changed.

Next concrete candidate: actual sharing refusal of an existing saved-choice file's write during real picker selection, checking prior bytes and explicit recovery. Existing save-failure coverage uses an owned directory obstruction; inspect before adding this candidate. Do not reopen already completed missing-runner/startup/busy/picker/bounded-read slices.
