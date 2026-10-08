# Actual Windows scheduler acceptance

Date: 2026-10-08. Source revision: `d2f524ef5978f72d925350b7cc66eee84b978ca0`. Authority: the owner's instruction to continue after the explicit request to create, run and remove one independent, delivery-disabled temporary test task. This supersedes the earlier approval-review rejection only for this synthetic test action; production and installed scheduler operations remain outside this authorization.

`scripts/test-activity-package.ps1 -LiveScheduler` completed with exit 0 and **41 checks passed**. The [machine result](Activity-unified/live-scheduler.json) distinguishes `real_unique_sandbox_task` from scheduler doubles. The final runner hash is unchanged: `cb665419f42ff088425012f9e43cebf22a21d2647f0a1a19b97df7ca236c8b7a`.

The script created a GUID-named `Enouia-Activity-Test-*` task, initially disabled, under the current user's identity. It used a copied release binary/config and synthetic imported state inside an isolated Runtime `target/scheduler-test-*` directory. Delivery was disabled and no collector was configured. The test explicitly enabled only this task and invoked it through Windows Task Scheduler.

The actual paused invocation returned task result 3. Holding the real shared Activity file lock caused a second scheduler invocation to return result 3 as busy. The script checked installed/query ownership, the effective task definition and policy, refused replacement, removed the idle owned task, confirmed it was no longer registered and proved Activity files stayed byte-identical. Cleanup preserved files during uninstall assertions and removed only the checked synthetic test directory afterward. The process completed successfully through its cleanup block.

This verifies actual scheduler execution of the independently installed runner and shared pause/lock behavior. It does **not** yet verify an unpaused closed-UI sync, actual hourly/logon timing, battery transitions, sleep/resume, authenticated collectors, HTTPS publication, personal migration or production cutover. No existing Activity task, personal data, Moriium checkout or server was changed.

The [combined integration report](Activity-unified-2026-10-08.md) retains its earlier rejected-attempt finding as historical evidence. The rejection was resolved by the owner's subsequent scoped authorization; the live test then executed successfully.
