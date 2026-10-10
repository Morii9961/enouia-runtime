# Windows Activity runner pipe deadline

Date: 2026-10-10. Baseline: `3a1dd8c1183f8e54764df34246d0c243ac13b93a`. This changes the Windows desktop adapter's subprocess output collection. Producer/store, IPC and pinned Memory Core remain unchanged. J1/B4 are partial; B5 is inactive.

The previous adapter polled the direct runner until exit or timeout, then joined a thread reading stdout to EOF. A descendant inheriting stdout could keep that join waiting after the runner exited. Killing a timed-out direct runner also joined the same reader. The declared deadline therefore did not bound this wait.

Windows now owns the stdout reader on the calling worker, probes available bytes, drains only those bytes, checks direct-child status, and checks its deadline on every loop. Idle polling backs off from 1 to 25 milliseconds; receiving bytes resets it. Output up to 8 MiB remains accepted, and the next probe byte is refused. Success requires both complete stdout and an observed direct-child exit. Timeout returns the existing retryable `busy` code, and errors terminate/reap only the owned direct child. There is no reader thread left waiting to join.

Microsoft documents anonymous-pipe support for [PeekNamedPipe](https://learn.microsoft.com/en-us/windows/win32/api/namedpipeapi/nf-namedpipeapi-peeknamedpipe), and warns that a synchronous handle can block under multithreaded use. This implementation keeps one exclusively owned reader with no cloned handle or outstanding read. The tests below establish this particular use with actual processes; they do not establish a guarantee against arbitrary Windows or kernel stalls. The existing pinned `windows-sys` dependency gains its `Win32_System_Pipes` feature; no dependency version or Memory revision changes.

## Evidence

The [hashed proof](Activity-runner-pipe/proof.json) records the frozen executable from this unsigned NSIS build, the unchanged real producer, the finite helper source, raw attempts, and four serial native runs on separate new synthetic packages.

| Scope | Result |
| --- | --- |
| [Old executable, corrected actual IPC observer](Activity-runner-pipe/before.json) | 13/16; approximately 45.2 seconds for a declared 20-second read, then `contract_invalid` |
| [New executable, actual IPC deadline and recovery](Activity-runner-pipe/pipe.json) | 16/16 |
| [Install-manifest bounds regression](Activity-runner-pipe/manifest.json) | 21/21 |
| [Atomic choice replacement regression](Activity-runner-pipe/atomic.json) | 18/18 |
| [Actual producer actions and pinned-Core isolation](Activity-runner-pipe/actions.json) | 35/35 |

The pipe drill initially connects the unchanged real producer, then replaces only its owned sandbox package's executable with a finite Rust helper and updates that package's matching manifest hash. The actual native picker admits it. Its overview and preview parents exit while descendants retain stdout for up to 45 seconds. A forwarding fetch observer clones actual Tauri responses without substituting replies. Both reads must return retryable `busy` within an 18–30 second observation window around the declared 20-second deadline, and the UI must show the existing busy feedback. Settings and the complete Activity store remain exact. The drill releases its two owned holders, restores exact original executable/manifest bytes, reconnects through the actual picker, and verifies unchanged three-source histories and store.

The [47 host + 3 Core test run](Activity-runner-pipe/tests.json) adds four Windows behavioral tests: complete small output and nonzero status; exact 8 MiB versus the next byte; inherited stdout after exited and still-live parents; and an owned hanging parent. The three deadline cases declare 200 milliseconds and measured 200, 201 and 201 milliseconds in the recorded run. Their helper is prepared and spawned before that measurement, matching the existing adapter's execution deadline boundary. All holders have a finite independent ceiling and an explicit release.

Intermediate attempts are preserved and excluded from acceptance. The first two native observations ([13/16 old](Activity-runner-pipe/before_observer.json), [14/16 new](Activity-runner-pipe/after_observer.json)) tried to replace Tauri's read-only invoke property, so no replies were recorded; their 65-second observation windows are not call-duration evidence. The first corrected new run ([11/12](Activity-runner-pipe/restore_intermediate.json)) passed both actual busy responses and the 20.1-second deadline but hit a temporary Windows image-sharing lock when immediately restoring the executable. The owned original producer was restored after release. Restoration now retries only this package's exact original bytes for at most ten seconds and retains an original-byte backup. An initial focused Rust 2/4 attempt included cold helper compilation/process creation in its elapsed assertion; the corrected full run measures only the already-spawned pipe execution.

Fresh checks: fmt/clippy, strict TypeScript and frontend build, 58 frontend tests, native/unsigned NSIS build, 26 installer ownership checks, Memory guard with 8 negatives and resolved domain guard with 7 negatives. C17 adds 20 selectors (16 native and four Rust); evidence integrity is **63 reports / 1,034 selectors / 65 negative checks**. Every matrix row keeps its remaining gaps.

The deadline still starts after process spawn; hash verification and process creation are outside it. Descendants are not terminated by this adapter, and no kill-on-host-exit Job is introduced. A previously started Activity run can still continue after the UI exits. The non-Windows reader is unchanged and has no new deadline evidence. No personal Vault/settings, account, credentials, scheduler task, live delivery or server was touched. The installer was built, not installed or signed. This does not activate production or sign off B4/B5.
