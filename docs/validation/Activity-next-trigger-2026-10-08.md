# Observed Activity next-trigger time

Date: 2026-10-08. Scope: read-only Runtime adapter and independently owned GUID temporary scheduler fixture; delivery disabled. B4/J1 remain partial; B5 stays inactive.

An enabled owned task previously always showed an unobserved next trigger. The actual prior desktop [baseline](Activity-unified/next-trigger-before.json) reproduces exactly this gap: **9/10**, with only the next-trigger assertion failing. The disabled baseline remained 10/10.

The adapter retains its bounded schtasks XML ownership/enablement read. For an enabled owned task only, a bounded windowless Windows PowerShell COM read obtains the registered task's future NextRunTime, rechecks marker and enablement, and formats canonical UTC. It never reads a trigger boundary as a prediction. Failed/malformed/past/missing observations and any individually disabled trigger leave the time null. The latter guard follows Microsoft's documented caveat that individually disabled triggers can still influence [RegisteredTask.NextRunTime](https://learn.microsoft.com/en-us/windows/win32/taskschd/registeredtask-nextruntime). [TaskFolder.GetTask](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskfolder-gettask) and the read-only [RegisteredTask.Definition](https://learn.microsoft.com/en-us/windows/win32/taskschd/registeredtask-definition) provide the selected task/ownership checks. No new dependency or task-control operation is introduced.

The [final GUID-task drill](Activity-unified/next-trigger-live.json) passes **65 assertions** and [disabled](Activity-unified/next-trigger-disabled.json)/[enabled](Activity-unified/next-trigger-enabled.json) native page runs each pass **10/10**. The enabled timestamp matches a separate Get-ScheduledTaskInfo read exactly; disabled returns null. Producer pause is separate from task enablement and a displayed scheduler time does not promise collection or publication. Attempts to control scheduling through IPC remain refused; read-only queries preserve Activity files and task state. Closed-UI sync advances one sequence with delivery disabled, while a second invocation retains exact pending bytes. The task is removed with the existing source/action/user ownership guards. The visible timestamp/status screenshot was inspected.

The first new-build page reads passed 10/10 each, but their external timestamp comparison failed because PowerShell 7.6 automatically converted JSON timestamps to DateTime; subsequent local-format parsing swapped the month/day. A focused reproduction confirmed that transformation. The harness now preserves JSON date strings where supported and uses exact invariant UTC parsing. The successful full rerun above uses the corrected script; no product behavior was changed to hide the harness error.

Fresh checks: **32 host + 3 pinned-Core tests**, desktop fmt and clippy (all targets, warnings denied), strict frontend build, unsigned NSIS build, **26/26 source/rendered installer checks**, Memory integration self-test (8 negative checks), desktop domain check (7 negative checks), harness syntax and whitespace. Frontend source/assets are unchanged from the complete recorded-days slice, so its **39-test** result is reused. Root producer source/binary and the exact Memory pin are unchanged.

The [hashed proof](Activity-unified/next-trigger-proof.json) binds both native reports, the actual task report and baseline. Current offline evidence integrity is 26 reports / 258 selectors / 25 negative cases; all rows remain partial.

- Desktop SHA-256: 9c41dde375bd6b8e0debc32bebbfe57bd15531ca15b4c2c0a3235294ab588e9c.
- Unsigned installer SHA-256: 1e7aa400841293b2e58765189de2f74c8e54d9b6e040140b5d3e5cb8557394b5.
- Runner SHA-256: cb665419f42ff088425012f9e43cebf22a21d2647f0a1a19b97df7ca236c8b7a.
- Memory pin: ff692ccb6fbc1c387254d5ffbef41b105eeb2a84.

The folder picker is assisted through owned-process UI Automation. Actual elapsed hourly/logon, battery/resume, complete Windows keyboard/Narrator, installation/signing and production remain unverified. No personal data, public upload, production task, credentials, server or Moriium source was changed.
