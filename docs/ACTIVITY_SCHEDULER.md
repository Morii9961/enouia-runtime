# Activity installation and Windows scheduling

B3.2 packages the one-shot runner independently of a checkout. Use PowerShell 7.2 or later on Windows. Installation is explicit; building or launching the runner never registers a task. Production registration and activation belong to the [B5 cutover gates](ACTIVITY_MIGRATION_v0.3.md).

The [2026-10-08 actual scheduler acceptance](validation/Activity-scheduler-live-2026-10-08.md) confirms paused/busy execution and owned-task removal using one temporary, delivery-disabled synthetic task. It is separate from production activation.

Prepare an absolute, local, non-reparse config and a valid **paused** Activity store using the [runner commands](ACTIVITY_RUNNER.md). Keep `deliveryEnabled` false during this packaging phase. The installer requires disjoint data and installation directories, an unused installation path, and a release binary with Windows GUI subsystem 2. That subsystem avoids allocating a console for scheduled execution; redirected CLI JSON still works. A debug console binary is rejected.

```powershell
./scripts/install-activity.ps1 `
  -Binary 'C:\RuntimeBuild\enouia-activity.exe' `
  -Config 'C:\EnouiaSandbox\candidate-config.json' `
  -InstallRoot 'C:\EnouiaSandbox\installed-v1' `
  -TaskName 'Enouia-Activity-Sandbox'
```

The default creates an installed executable, exact config copy, disabled `task.xml`, private `install.json`, and `management` scripts. It registers nothing. Add `-RegisterSandbox` to register a **disabled sandbox** task explicitly; this sandbox registration path rejects production mode. The B5 path ([ADR-030](adr/030-production-activation-path.md)) is separate and explicit: `-Production` installs a delivery-enabled production package (still paused and unregistered), and the installed `management/register-activity-production.ps1 -ConfirmTaskName <exact name>` registers its task disabled. With `-Enable`, it requires a valid production overview with Boolean resumed/enabled flags, no pending batch or delivery sequence, an observed public hash and an exact UTC publication-observation timestamp before enabling the owned task. Delivery-enabled installs without `-Production`, and all unpaused installs, are rejected. Partial installation failures preserve the new directory for inspection; reusing or overwriting it is refused. Updates use a new versioned directory, with the previous task quiesced through its owning package before another registration.

Configured Node, gh, Codex, SSH, and curl paths must select actual executable files. Setup runs only bounded, hidden version probes, retains version numbers and paths locally, and emits a summary without paths or raw tool output. If a source is unconfigured, setup can inventory an executable found on the current process PATH without adding it to config or enabling collection. Missing or unusable discovered wrappers/links are marked `requires_explicit_path`/`not_found`; unusable configured tools block setup. No PATH, machine environment, login files, or credentials are copied or modified. Version success does **not** prove authentication or collector capability.

When Claude is configured, supply `-RuntimeToolsRoot 'C:\Enouia\tools'`. Its existing `ccusageCli` must be inside that explicitly Runtime-owned directory, with `../package.json` relative to the CLI's `dist` directory identifying `ccusage@20.0.20`. Package metadata is recorded separately as `package_metadata_only`; provisioning dependencies and the actual offline Claude CLI capability check remain operator acceptance work. Setup performs no download or npm installation and copies no Claude stores. Keep install metadata/config private; only the returned summaries are intended for export.

The task uses the current user's SID, `InteractiveToken`, least privilege, the absolute installed action `enouia-activity.exe sync --config "<installed config>"`, and the installed directory as working directory. Hourly repetition has no end duration; a separate same-user logon trigger delays 15 minutes. `IgnoreNew`, `StartWhenAvailable`, battery execution, a 15-minute execution limit, and no wake-from-sleep are explicit. `Hidden` hides the task entry; the release executable's subsystem supplies windowless execution. These XML choices follow the [Microsoft Task Scheduler schema](https://learn.microsoft.com/en-us/windows/win32/taskschd/task-scheduler-schema) and [Hidden property documentation](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-hidden).

The user must be logged in. Logged-out and powered-off hours are not covered. Resume/login can yield a catch-up run; Runtime does not replay each missed hour. Task enablement and durable Activity pause are separate: enabling a paused task still returns the runner's paused result. The shared OS file lock protects manual runs as well as scheduler runs. Numeric task result `3` can mean pause or busy; use Activity diagnostics and task context to interpret it.

Manage an installation without the repository:

```powershell
& 'C:\EnouiaSandbox\installed-v1\management\query-activity.ps1' `
  -InstallRoot 'C:\EnouiaSandbox\installed-v1'
& 'C:\EnouiaSandbox\installed-v1\management\uninstall-activity.ps1' `
  -InstallRoot 'C:\EnouiaSandbox\installed-v1'
```

Query reports registration/state, last task result, redacted Activity diagnostics, login/battery/catch-up policy, and execution limit. Uninstall checks the package marker, exact executable/config action, working directory, and user identity. It refuses an unowned or running task, disables an idle owned task before removing it, and preserves **all** Activity data, config, executable, tool inventory, and management files. Repeated uninstall is safe. Registration also checks binary/config hashes and refuses an existing task; editing `task.xml` cannot inject another action through the registration function. The scripts never stop unrelated tasks or kill a live Activity run. Windows policy may require permission to manage even a current-user task; failure must not be treated as absence.

Run packaging checks after building the release binary:

```powershell
./scripts/test-activity-package.ps1
./scripts/test-activity-package.ps1 -LiveScheduler
./scripts/test-activity-package.ps1 -LiveScheduler -ClosedUiSync
./scripts/test-activity-package.ps1 -LiveScheduler -ClosedUiSync -NativeDesktop '<absolute release desktop exe>'
```

The first uses scheduler doubles with real files, probes, and executable. Its production-gate section models the overview reply and scheduler only, using an unreachable synthetic public origin; it never sends a production batch or registers a real task. The second explicitly registers a uniquely named temporary disabled task, enables only that delivery-disabled synthetic sandbox task, invokes it through the scheduler, then removes it. Adding `-ClosedUiSync` requires the desktop to be closed and also verifies unpaused scheduled state advancement, retained source failures and byte-identical unresolved pending on a second invocation. It never closes user applications. All modes use synthetic Activity state and checked cleanup paths. The live options do not test actual hourly/logon timing, battery transitions, sleep/resume, authenticated collectors, or a receiver. See the historical [B3.2 validation report](validation/B3.2-scheduler.md), [current live acceptance](validation/Activity-scheduler-live-2026-10-08.md) and [combined validation](validation/Activity-unified-2026-10-08.md).

`-NativeDesktop` additionally launches isolated desktop processes to read the actual disabled/enabled task through the Activity page. It checks that producer pause stays separate, scheduler controls are refused, and UI reads preserve task state and Activity files. The harness terminates only its own desktop processes before optional closed-UI sync. Page outputs remain under a marked ignored `target/native-scheduler-<GUID>` directory. See [native task-read evidence](validation/Activity-native-scheduler-2026-10-08.md).
