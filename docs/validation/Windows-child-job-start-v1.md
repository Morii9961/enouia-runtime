# Windows child startup: join the private Job before execution

2026-10-23, Asia/Shanghai. Isolated Runtime backend slice; no production activation.

## Scope and concrete behavior

Baseline main e1e7e922b288c13dbc483c4089e7da146b7596b4, branch codex/atomic-child-job, worktree E:/Workteree/atomic-child-job/Enouia Runtime. This addresses the user-code execution portion of the B4 process-spawn/Job-assignment gap, independently of history-results PR #94.

WindowsProcessRunner and WindowsJsonLineSession previously spawned a running child, then assigned it to a private kill-on-close Job. The child could execute and create descendants between those operations. KillOnCloseJob::spawn now uses the existing Rust Command with CREATE_SUSPENDED and CREATE_NO_WINDOW, assigns that exact child handle to its private Job, then resumes its unique initial thread. Job or thread discovery refusal kills/waits only the owned Child without resuming it. Cancellation and normal cleanup still close only that private Job; there is no process-name search or PID-based termination.

Stable Rust 1.98.1 does not expose the initial thread handle. The private helper snapshots thread metadata, selects only the retained Child's process ID, requires exactly one initial thread, opens only that thread and rechecks GetProcessIdOfThread before ResumeThread. The retained Child process handle prevents process ID reuse. A missing, extra, stale or already-resumed thread fails closed; other processes' thread handles are never opened or resumed.

The final change preserves Command's argv, environment, stdin/stdout/stderr, current-directory and existing .cmd handling. There is no new quoting implementation, environment snapshot implementation, native CreateProcess wrapper or executable restriction. The direct CreateProcess prototype was discarded before commit after identifying its batch-launcher compatibility risk. Its earlier local outputs are prototype evidence only; final evidence uses the suspended-* filenames below.

Only enouia-windows-process sources and the existing windows-sys 0.61.2 feature set change; Win32_System_Diagnostics_ToolHelp is enabled. There is no dependency version/lockfile change, Memory pin change, frontend/entry/style change, scheduler operation or package installation. Actual Activity consumers compile; no configured collector was launched.

## Primary API basis

- [Microsoft suspended thread semantics](https://learn.microsoft.com/en-us/windows/win32/procthread/suspending-thread-execution): a thread created suspended does not execute until resumed.
- [Process creation flags](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags), [AssignProcessToJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject) and [ResumeThread](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-resumethread): the startup barrier and its explicit suspend-count check.
- [Thread32First](https://learn.microsoft.com/en-us/windows/win32/api/tlhelp32/nf-tlhelp32-thread32first) and [GetProcessIdOfThread](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getprocessidofthread): metadata discovery followed by handle-based owner verification.
- [Microsoft's process ID lifetime explanation](https://devblogs.microsoft.com/oldnewthing/20110107-00/?p=11803): retaining the process handle retains the process object's ID. No identifier-only termination is used.

## Checks actually run

| Check | Final result |
| --- | --- |
| cargo test --offline --locked -p enouia-windows-process --lib --test runner --test session -- --nocapture | 18 passed, 0 failed; one private child entry ignored by the outer harness and invoked explicitly by its parent tests. target/atomic-child-job/suspended-final-tests.txt. |
| Suspended startup barrier | The real synthetic child cannot create its marker during a deliberate pre-assignment wait or after assignment while still suspended; explicit resume permits it. |
| Exact Job and descendants | Parent queries its exact live process/Job handles. An immediate child-created descendant is also in that private Job; closing it signals both retained process handles. |
| Refused Job control | Invalid Job assignment never creates the synthetic start marker. Identical executable/arguments under a valid Job do create it. No unowned-running fallback. |
| Cancellation isolation | Cancellation is signaled only after the child writes its owned start marker. A separately owned sentinel stays alive until its own private Job closes. |
| Existing Command semantics | Difficult UTF-16 argv and Unicode environment overlay round-trip through a real child. A synthetic .cmd launcher in a path containing spaces still succeeds. |
| Existing runner/session checks | stdin plus private stdout/stderr, nonzero exit, timeout/cancellation/output bounds, synthetic Codex normalization, session Drop and nonreading-stdin deadline pass. |
| cargo clippy --offline --locked -p enouia-windows-process --all-targets -- -D warnings | Passed; target/atomic-child-job/suspended-clippy.txt. |
| cargo check --offline --locked -p enouia-activity-runner --all-targets | Passed; target/atomic-child-job/suspended-consumer-check.txt. Compiles examples/tests; does not run them or contact a service. |
| Changed Rust rustfmt, Memory pin consistency and staged whitespace | Passed. |

The ignored target outputs are saved local evidence in this owned worktree; they are not public PR attachments. No workspace-wide suite, full frontend suite, build/package, smoke or performance rerun was used. Historical B4 reports and machine selectors are unchanged.

## Limits and Claude handoff

This is a barrier before user-code execution, not atomic process creation and Job assignment. Forced host death between suspended creation and Job assignment can still leave a suspended orphan. That crash interval, OS spawn/assignment stalls, additional injected startup threads, disk-full, power-loss and formal B4 sign-off remain open. No claim covers every independently implemented desktop package-runner path.

No physical desktop/tray interaction, Windows login or power transition, real account, personal log/Vault/credential, Provider request, live upload or scheduler run occurred. Process termination after Job closure is observed with bounded waits in tests.

Claude needs no App.tsx/main.tsx, routing or style adaptation for this slice. Existing redesign branches/worktrees are untouched. The history-results product entry remains a separate file-level handoff in PR #94. This backend slice can be reviewed independently; no merge, installation or activation is performed by this delivery.
