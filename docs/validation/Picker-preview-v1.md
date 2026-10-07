# Picker preview binding — local evidence

Date: 2026-10-06. Baseline: `4209961`. Scope: Runtime's import and restore-preview surfaces with the unchanged pinned Memory Core.

Native reproduction found that a newly selected import token replaced the old token before its preview completed. If that read failed, the old file's preview stayed visible and Start import became enabled for the new token. A rejected restore-preview folder similarly retained the preceding "Backup is valid" result. The before-change focused run passed 7 of 11 checks and failed these specific behaviors.

The import surface now publishes the picker choice and its successful preview together. Choosing another file clears the prior selection before reading it; a failed preview leaves no import action. Cancelling the native dialog keeps the preceding valid selection because no new choice was made. Restore preview clears its preceding result after a new folder is chosen and before validating it. Core token rules, creation/commit authority, Vault format and exact Memory pin remain unchanged.

The focused harness picks file A, holds file B's real preview delivery, injects a preview-read error, and checks that A's preview and the import action are absent. It then picks B again and performs a real import with B's expected input size. The error injection is frontend evidence, not a real file-read failure. It also exports a real backup of the synthetic Vault through the native folder picker, checks the real restore-preview commit ID matches that export, selects an empty non-backup folder to exercise an actual Core rejection, and recovers by choosing the valid backup again. No actual restore is executed.

| Check | Result |
|---|---|
| Frontend type checking and React/client suite | Pass; 15 tests |
| Embedded-assets Windows GNU release | Pass; no installer |
| Final focused native picker acceptance | 13/13 pass on a fresh synthetic Vault, including cancellation retaining the preceding valid preview |
| Full native regression | Partial: 34 checks passed; both attempts stopped before sending hotkey input because the test process was not foreground. Neither run is counted as a full pass. |
| Fixed-pin and domain guards | Pass; 8 and 7 negative checks |
| Unchanged Rust/companion scope | Reuse prior 19 host plus 3 Core tests, formatting/Clippy, and the 62/62 regression in `4209961`; this slice changes only import/restore views and their focused harness |

The actual restore-preview screenshot was inspected. Its inline CLI command now stays in the paragraph rather than becoming a separate flex item. Reports and screenshots remain in temporary fixture folders. The partial full runs retain the strict foreground safety check; no input was sent to another process.

Release executable SHA-256: `e913e87281299fb909daa96b34f7d78fc1f4a185544ac62ffb62226638f7e1f3`.

This proves selection/preview correspondence for the tested sequence. External file edits/replacement between preview and import, actual storage faults, restored-Vault durability, installed-artifact behavior, Narrator and contrast theme remain unverified. Test hosts use synthetic Vaults only; no personal migration, cloud Provider or production Activity was used.
