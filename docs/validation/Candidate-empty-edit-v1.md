# Empty candidate edit admission

Date: 2026-10-16 (Asia/Shanghai). Baseline `6e441a3eb28653a96d7543924ba95b9103054e66`; Memory pin remains `8186aed861af08cf7a2c5d8c912a24eae51b4d66`.

Clearing a candidate textarea still enabled Accept with edits, although the exact pinned workspace contract's `check_text` rejects zero characters (`workspace.text_length`). The existing Inbox DOM fixture reproduced two failed empty-edit checks among 18 assertions. Reject stayed available and prior recovery behavior passed.

The acceptance control now withholds an empty draft. The submission handler independently refuses an empty editedContent and captures the original submitted value before running the action. Reject remains available; editing back to nonempty content restores the ordinary plan/confirmation path. No trimming, whitespace policy, new Core validation, approval bypass or draft reset is introduced. Held nonempty retries retain their original arguments/key even if a later draft changes.

The 18-assertion Inbox journey now runs in `npm test` alongside the prior six fixtures: 121 DOM assertions plus 96 frontend tests pass. Coverage includes rejection availability, restoration to nonempty edits, read-error recovery, original retry ownership, later-draft retention and ordinary plan confirmation without an automatic confirm. TypeScript, strict affected-fixture typing, desktop no-bundle release build, pin/dependency guards (eight + seven negatives) and diff checks pass. Native sources, dependencies and pin are unchanged; prior native test/Clippy/format evidence is reused from [the preceding slice](Operation-stop-observation-v1.md).

All candidates, plans, failures and requests are synthetic. The DOM model does not prove browser layout, physical keyboard, real storage/Vault, Windows or Morii acceptance. No personal data, Provider, Activity activation, installer or manual status snapshot was used. Owner files are preserved.
