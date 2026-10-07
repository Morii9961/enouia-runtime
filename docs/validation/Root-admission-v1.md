# Runtime Vault admission — local evidence

Date: 2026-10-06. Baseline: `8d10aac` (the Quick Search slice; full SHA `8d10aacdf3d4fcce7b43ae365155f7ff541f804e`). Scope: cooperating Runtime processes on one Windows development host, with synthetic Vaults only.

A real two-process check found that both hosts could open the same Vault. The pinned Memory Core owns a per-commit writer lock, not a persistent Runtime host reservation. Runtime now reserves the native directory before CLI startup or picker-token open/create. The reservation lives in Windows kernel handles and writes no Vault file. Memory stays pinned at `a181308b3496c07281c1030cc53b7c9f1bbb7705`; the lockfile, Vault format and Memory writer policy are unchanged.

`GetFileInformationByHandleEx(FileIdInfo)` supplies the volume and 128-bit file identity, so path aliases contend on the same presence object. `CreateMutexW` atomically creates or opens that object; an existing object refuses admission. This is a handle-lifetime sentinel: no thread owns, waits for or releases the mutex. The adapter holds the directory handle without delete sharing and closes both handles after Core shutdown. Locking retains the reservation until switching or exiting. A failed admission preserves the current Vault; a later Core rejection releases the old reservation only if canonical status says the old Vault has closed.

The adapter keeps a bounded native table of 64 Vault-picker choices. The page receives only the Core token and base name; paths supplied as tokens are refused. Core token validation and the typed creation phrase remain authoritative. Startup failures appear separately in host status, with a human explanation on Home, Memory and Settings. The Vault panel's close explanation now matches tray behavior.

| Check | Result |
|---|---|
| Frontend type checking and React/client suite | Pass; 13 tests |
| Desktop formatting, locked offline tests and Clippy with warnings denied | Pass; 19 host unit tests and 3 pinned-Core integration tests |
| Locked metadata/domain guard | Pass; 7 Memory packages and 7 negative checks |
| Pin/surface checker against the committed fixed revision | Pass; 8 negative checks |
| Windows GNU embedded-assets release | Pass; no installer |
| Focused native Quick Search and competing host smoke | 25/25 pass |
| Full native regression on a fresh synthetic Vault | 61/61 pass; nine screenshots and zero autofill rows |

Host tests cover alias identity, a different directory, cross-thread handle release, picker-token create/open, locked-host retention, reopening one's own root, occupied switch preserving the old root, successful switch release, shutdown release, and failed creation/open behavior. Native evidence uses two isolated real Runtime processes on one synthetic Vault: the second remains at no Vault with `root_in_use`, the first remains open, and shortcut conflict still offers manual search and clean exit. The full smoke also opens through the native folder picker, kills that host, reopens the same root, exercises the existing Memory/Session/Context paths, and verifies persistence plus hotkey reacquisition after explicit exit. The occupied-root screenshot was inspected.

The first focused run stopped before sending input because its own window was not foreground; the unchanged retry passed. The folder-picker harness was corrected using this process's actual folder edit control (1152 rather than file edit 1148) and Windows-normalized absolute paths. These were test-tool issues, not Core or product changes. Native debugging is enabled only in the test environment; reports and screenshots remain in temporary test folders.

Release executable SHA-256: `9be3377b4845d03b450dfb1aba2f97aa09c1c58cc5ce4a2451a4c12d6a200b70`.

This protects cooperating Runtime hosts only. Memory's reference shell, CLI and older Runtime releases do not participate and must not open the same Vault concurrently. Cross-user/session access, ReFS, junction/reparse replacement attacks, hostile named-object precreation, power loss, long verify/backup shutdown, Narrator, contrast theme and installed-artifact acceptance remain unverified. No personal Vault, migration, cloud Provider or production Activity was used.

Sources: the pinned Memory host handoff and installed `windows-sys 0.61.2` bindings, Microsoft's [CreateMutexW](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-createmutexw), [directory handles](https://learn.microsoft.com/en-us/windows/win32/fileio/obtaining-a-handle-to-a-directory), [file identity](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/ns-fileapi-by_handle_file_information), and [kernel object namespaces](https://learn.microsoft.com/en-us/windows/win32/termserv/kernel-object-namespaces).
