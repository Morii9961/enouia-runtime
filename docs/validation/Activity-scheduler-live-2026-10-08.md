# Actual Windows scheduler acceptance

Date: 2026-10-08. Source revision: `d2f524ef5978f72d925350b7cc66eee84b978ca0`. Authority: the owner's instruction to continue after the explicit request to create, run and remove one independent, delivery-disabled temporary test task. This supersedes the earlier approval-review rejection only for this synthetic test action; production and installed scheduler operations remain outside this authorization.

`scripts/test-activity-package.ps1 -LiveScheduler` completed with exit 0 and **41 checks passed**. The [machine result](Activity-unified/live-scheduler.json) distinguishes `real_unique_sandbox_task` from scheduler doubles. The final runner hash is unchanged: `cb665419f42ff088425012f9e43cebf22a21d2647f0a1a19b97df7ca236c8b7a`.

The script created a GUID-named `Enouia-Activity-Test-*` task, initially disabled, under the current user's identity. It used a copied release binary/config and synthetic imported state inside an isolated Runtime `target/scheduler-test-*` directory. Delivery was disabled and no collector was configured. The test explicitly enabled only this task and invoked it through Windows Task Scheduler.

The actual paused invocation returned task result 3. Holding the real shared Activity file lock caused a second scheduler invocation to return result 3 as busy. The script checked installed/query ownership, the effective task definition and policy, refused replacement, removed the idle owned task, confirmed it was no longer registered and proved Activity files stayed byte-identical. Cleanup preserved files during uninstall assertions and removed only the checked synthetic test directory afterward. The process completed successfully through its cleanup block.

This verifies actual scheduler execution of the independently installed runner and shared pause/lock behavior. It does **not** yet verify an unpaused closed-UI sync, actual hourly/logon timing, battery transitions, sleep/resume, authenticated collectors, HTTPS publication, personal migration or production cutover. No existing Activity task, personal data, Moriium checkout or server was changed.

## Closed-UI follow-up

The new optional `-ClosedUiSync` mode requires `-LiveScheduler`, refuses to proceed when a desktop process is open and never closes user applications. A fresh execution at baseline `2b460a8` plus this harness change passed **57 checks**; the [machine result](Activity-unified/closed-ui-scheduler.json) preserves its exact pending hash.

With the desktop absent, the installed runner was resumed and invoked through the uniquely named task. It committed sequence 51 from imported high-water 50. All three unconfigured collectors failed explicitly while retaining every previous total and successful timestamp. Delivery stayed disabled, so the runner returned task result 4 and reported delivery `unconfigured`; publication was not claimed.

A second actual scheduled invocation returned 4 again and preserved the exact pending hash, high-water and entire stored file tree. It did not reserve sequence 52 or collect past unresolved pending. The task was removed and post-run uninstall preserved the new state before checked test-directory cleanup. The 87 scheduler-double package checks also pass unchanged.

The first closed-UI run exposed a harness expectation mismatch (`pending` versus the existing `unconfigured` IPC label for disabled delivery). The corrected expectation was verified against `ipc.rs`; product state/exit behavior was unchanged. The final 57-check run passed. This extends real C17 coverage to unpaused state advancement while the desktop is closed. Absent-source-checkout, actual hourly/logon timing, battery/resume, live tools and production remain separate acceptance items.

The [combined integration report](Activity-unified-2026-10-08.md) retains its earlier rejected-attempt finding as historical evidence. The rejection was resolved by the owner's subsequent scoped authorization; the live test then executed successfully.
