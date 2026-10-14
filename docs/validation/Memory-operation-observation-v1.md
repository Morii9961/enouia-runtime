# Operation observation identity

Date: 2026-10-14 (Asia/Shanghai). Baseline `8c54634f29db7e4559b9371879cca98df9ac28b6`; Memory pin unchanged at `8186aed861af08cf7a2c5d8c912a24eae51b4d66`.

Source inspection found that the shared watcher checked cancellation-reply identity but published ordinary `operation_get` results directly. A foreign terminal result could therefore finish the selected observer. No live Core defect or browser reproduction is claimed.

The latest eligible read now matches its operation ID and kind before publication or completion callbacks. Model-call callers supply `external_send`; Vault lifecycle observers use the listed kind. Generic observers bind the kind of their first matching read and retain it for later observations. Wrong/missing identities enter the existing read-error/retry path, retaining earlier valid progress without publishing a terminal outcome. The identity check follows the existing cancellation-generation comparison, so an older read cannot override a newer stop acknowledgement. Cancellation admission itself is unchanged.

Fresh validation passed: 4 new pure identity regressions within all 73 frontend tests, frontend TypeScript, strict checking of the new and affected interaction fixtures, all 5 fixed-Core consumers, Rust formatting/strict Clippy, the frontend/ordinary no-bundle desktop release build and pin/dependency guards (8 + 7 negatives). Core consumers additionally assert the requested operation ID, a nonempty kind and the started kind where supplied. The unchanged 61 native host tests retain prior evidence.

The new `e2e/operation-observation.html` fixture covers foreign/missing terminal reads, known/generic kind ownership, failed replacement, explicit recovery, terminal callback lifetime and late foreign reads after local stop. It is saved and type-checked, but was **not executed**: this turn's browser inventory was empty. Existing affected browser fixtures were likewise not rerun; their older reports remain historical. No browser/Narrator/physical acceptance is inferred from pure tests or a build.

No personal Vault, real Provider HTTP, credentials, Activity activation, installer, Memory domain/protocol/pin change or human acceptance occurred. Owner changes/manual status snapshots remain outside this commit.
