# Native Activity reads an actual isolated task

Date: 2026-10-08. Base revision: `603a38b`. Scope: the existing ADR-028 read-only schedule boundary, using the owner-authorized temporary sandbox task. Product source, runner, desktop binary and Memory pin are unchanged.

The live packaging harness now accepts `-NativeDesktop <absolute exe>` with `-LiveScheduler`. It checks the package's registered-but-disabled state through the real desktop, enables the owned task through the packaging module, then checks its registered-and-enabled state through a second isolated desktop process. The Activity page never changes the task. Both page runs use the package's real runner and native adapter, not modeled IPC replies.

## Evidence

`test-activity-package.ps1 -LiveScheduler -ClosedUiSync -NativeDesktop <release exe>` exits 0 with **63 successful packaging/scheduler assertions**. Its [recorded result](Activity-unified/native-scheduler.json) includes the two native **10/10** runs and the closed-UI scheduled invocation facts. The ordinary scheduler-double mode still passes **87** checks. JavaScript syntax, the Memory integration self-test (7 locked packages, 8 negative checks), and Git whitespace checks pass.

Each native run checks:

- The isolated installed package connects and has exactly the three public sources.
- The task is registered, its enablement matches the actual Windows state, and scheduler health distinguishes disabled from enabled.
- The corresponding `Registered · disabled` or `Registered · enabled` text reaches the page. Screenshots of both states were inspected.
- Durable producer pause remains separate: the enabled task does not make Run now available while the producer is paused.
- Unobserved next-trigger time stays null and reads as `Not observed`.
- Scheduler enable/disable IPC requests are refused with `contract_invalid`.
- Repeated reads preserve the public payload hash, task state and private path redaction.

The parent harness independently verifies byte-identical Activity files around each UI run and queries the actual owned task state afterward. After both native processes exit, the scheduler advances sequence 50 to 51 with the desktop closed. Delivery stays disabled, all three source histories survive unavailable collectors, and the second invocation retains the exact pending bytes without reserving another sequence. Both task invocations return 4 (unresolved delivery). Ownership-checked uninstall removes the idle test task and preserves files before guarded cleanup of its disposable root.

## Identities and limits

- Desktop SHA-256: `de6f86e5e247e7601c3c93eed0494a9091a10b924b0d1d67531f79e074aaa765`.
- Runner SHA-256: `cb665419f42ff088425012f9e43cebf22a21d2647f0a1a19b97df7ca236c8b7a`.
- Memory pin: `ff692ccb6fbc1c387254d5ffbef41b105eeb2a84`.
- Recorded result SHA-256: `b81ef76379bfde2cc5b93b5eb4ec65e9025d2215ba2a922dccb741b906650c20`.
- Page harness SHA-256: `b6b672dc244cb0733beeacebe5551ad5407817902eeaf25c3ed0225bf003bc31`; packaging harness: `900ef7bcd6a514f055e939cce6da494449ab88ba9432b6797798dadcaba106ce`.
- Screenshots and detailed page reports remain in ignored `target/native-scheduler-95cab1fa2ef74759b09a7a3f0dbc1769/{disabled,enabled}`. Isolated WebView profiles and package-selection settings also stay there.

The task fixture uses a GUID name, current-user identity, a delivery-disabled minimal config and `installed & independent` paths under the marked Runtime test root. The page harness refuses other task-mode packages and touches only its spawned processes and their folder dialogs. It registers no task itself. No production task, personal source store, Vault, account or public upload is involved.

This proves the implemented registration/enablement read path against an actual Windows task. It does not prove hourly/logon trigger timing, sleep/battery behavior, production delivery, complete accessibility or full J1/B4 sign-off. B5 remains inactive.
