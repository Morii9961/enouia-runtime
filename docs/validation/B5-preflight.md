# B5 preflight inventory and real-account capability — Stage 0

Historical report from Claude's 2026-10-07 branch. Its described account inventory, private files, authorization and server observations were not repeated or adopted as new operational authorization by the 2026-10-08 integration. The [current combined validation](Activity-unified-2026-10-08.md) confirms that read-only requests to the actual public hostname fail during TLS with curl exit 35 and no HTTP response; the old 404/deployment finding cannot be freshly confirmed from this workstation. Code integration and synthetic acceptance do not establish B5 activation.

Date: 2026-10-07. Authority: the owner's 2026-10-07 authorization to continue toward B5. Scope: [migration runbook](../ACTIVITY_MIGRATION_v0.3.md) Stage 0, read-only inventory, plus one real-account collection into a private sandbox store with delivery disabled. Nothing was uploaded, no task was registered, and neither Moriium nor any server was changed. Private details (paths, values, raw comparison reports) stay in a private bundle outside both repositories; this summary keeps only counts and outcomes.

## Inventory

| Gate | Finding |
|---|---|
| O1 old producer | No scheduled task for the old automatic producer exists on this workstation (`Moriium activity sync` absent). The old automatic work directory, sequence and pending files do not exist. The old system ran manually: `pnpm activity:refresh` updates Moriium's checked-in `src/data/activity.json`, and the external archive folder keeps dated backups and a refresh log. |
| O1 seed | One candidate: the checked-in snapshot at Moriium `fd48f88` (2026-09-30) is byte-identical to the latest backup. Runtime `migration-inspect` validates it with no unpublishable success times. Its per-source day counts and totals equal the refresh log's last line. |
| O1/O4 identity | No automatic producer ever sent a batch, and no receiver exists (below), so producer `morii-workstation` has no used sequence. A non-empty archive needs high-water ≥ 1; the rehearsal used 1, so the first batch is 2. |
| O2 receiver/publisher | **Not deployed.** The production site serves pages, but `/status-data/current.json` and `/status-data/activity/` return nginx 404. No restricted SSH alias was inspected or used. |
| O3 tools | Node 24.15.0, GitHub CLI 2.97.0 (authenticated read of the login only), Codex CLI 0.150.1 native `codex.exe` (the npm shim is not used), OpenSSH 9.5p2. The pinned `ccusage@20.0.20` with its Windows native package was copied from Moriium's local tool cache into a Runtime-owned tools folder; no npm install, credential or store copy. |
| O3 Claude stores | Normal Claude Code store plus 10 Cowork task stores. The roaming and Microsoft Store package paths resolve to the same stores and are counted once. |

## Real-account collection (private sandbox, delivery disabled)

The seed was imported at high-water 1 into private sandbox stores, then the release runner collected with the real installed tools.

1. **First run: Claude failed.** A probe example ([`claude_probe`](../../crates/enouia-activity-runner/examples/claude_probe.rs), codes only) located the failure in store discovery. Cowork now keeps installed skill bundles inside `local-agent-mode-sessions`, nested ten levels deep beside the task stores, and Runtime's six-level discovery bound failed the whole source. The real tree is 123 directories. Discovery now allows depth 32 within a 50,000-directory budget per root and still fails closed past either bound; new tests cover a deep skills tree beside and around stores and the budget (`enouia-windows-process`).
2. **Second run: all three sources succeeded.** Comparing the new archive with the seed showed no lost dates in any source and 7/7/6 new days. GitHub had one upward correction (2026-09-30 grew after the last manual refresh) and Codex none. Claude had one upward correction and one **downward** day: 2026-07-25 fell because the normal store has pruned transcripts before 2026-08-29 while one Cowork store keeps part of that day.
3. **Policy change.** Applying that downward value would erase real public history, so [ADR-029](../adr/029-claude-retains-higher-days.md) restores legacy behaviour for Claude: a lower report keeps the archived day. The frozen comparison rerun ([v2](B4/frozen-comparison-v2.json)) now matches legacy on `C03-claude-down`.
4. **Third run (fresh store, ADR-029 runner): all three sources succeeded**, with no lost dates and no downward changes in any source. The batch is sequence 2, kept locally because delivery is disabled.

This is the first real C01/C02/C04/C07/C08 capability evidence on the target workstation. It is not B4 sign-off: no transport, receiver, publication, schedule or About page was involved.

## B5 execution attempt (2026-10-07)

The owner approved all four production steps. Done locally:

- [ADR-030](../adr/030-production-activation-path.md) production install and registration path, with package tests (54 checks, scheduler doubles).
- PowerShell 7.6.6 installed from the official winget source (the Store build; tests now use `$PSHOME`, because the PATH entry is an app-execution alias).
- A dedicated ed25519 upload key and a `moriium-activity-upload` alias with strict host-key checking and `IdentitiesOnly`.
- A reviewed server install script for Moriium's status receiver and publisher from `fd48f88`, kept in the private bundle. The live nginx configuration already maps `/status-data/`, so nginx needs no change.

Stopped:

- **Remote server writes were refused by the session's permission policy.** The server script was not run, and nothing on the VPS changed.
- **The public origin is not reachable over HTTPS from this workstation.** DNS resolves to a local proxy fake-IP. Through the proxy, the TLS handshake fails. Directly to the server IP, TLS completes but the connection is reset after the request, with no HTTP response, for both curl (schannel) and Node (OpenSSL). This matches mainland hosting enforcement for a domain without ICP filing, which the 2026-10-05 deployment note says was deferred. The Runtime observer must fetch the public manifest from this machine to clear pending, so a production batch would stay pending and block later collection (O6). The production package was therefore not installed and no seed was imported.

## Gates still blocking B5

- **O2:** deploy the Moriium receiver/publisher (`/status-data/`), the restricted SSH account and alias, and nginx routing. This is Moriium-owned work, and the Moriium checkout currently holds someone else's uncommitted deployment changes and handoff notes for it. Runtime does not take over server ownership.
- **O6 reachability:** this workstation must be able to read `https://morii9961.top/status-data/current.json` (directly or through the user-level proxy that curl inherits). Complete the ICP filing, or route the domain through a proxy path that actually reaches it, then confirm with `curl.exe -sS https://morii9961.top/zh/`.
- **Stage 3–5:** after O2, a production config (mode `production`, real origin, SSH alias) with delivery enabled, import of the reviewed seed, one manual production cycle with observed publication and zh/ja/en About checks, then registration and enablement of the scheduled task and one observed scheduled run.
- **Cutover hygiene:** freeze manual `pnpm activity:refresh` writes to the checked-in snapshot during cutover, or keep it as the documented separate build-snapshot path.
