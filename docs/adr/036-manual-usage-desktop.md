# ADR-036 — Manual private Usage workspace

Date: 2026-10-22. Status: adopted for the owner's explicitly requested local desktop continuation; verification recorded separately. This extends ADR-035's delivered R0–R3 with a manual UI, not its deferred production automation.

## Decision and authority

Morii asked to continue after Dashboard's manual-bill MVP was complete, then explicitly selected “同时加入桌面手动操作页面”. Implement the local sequence: select the independent program package and private ledger, select source roots, scan manually, inspect coverage and conflicts, review a concrete correction, and export a new offline aggregate file. Do not infer permission for personal source reads during development, task registration, watching, uploading, API valuation, deployment or Memory integration.

Activity keeps its existing public producer view. A second “私有用量” view lives within that surface; the seven primary navigation surfaces remain intact. Quiet Runtime's existing palette/type/focus rules apply. Exact count rows and a persistent unallocated boundary carry the information; no chart pretends unknown daily measurements are known. The private view loads on demand. A separate provider retains manual operation state across navigation without entering Memory's status/client or Activity DTOs. Browser preview remains disconnected; component tests disclose their synthetic transport.

## Native and runner boundaries

- Desktop still has no dependency on a Runtime domain crate. `usage_call`, `usage_pick` and `usage_cancel` are new, main-window-only commands; overlay has no grant. The Memory pin, adapter, Vault and Provider path remain unchanged.
- The independent `enouia-usage.exe` runs once with the fixed `desktop` argument and a closed version-1 request on stdin. The shell supplies paths from its own native choices, never from page strings. No path is placed in arguments or returned to the page. Requests are limited to 64 KiB and runner replies to 256 KiB. The runner uses existing explicit grant, file safety, single-writer and transaction rules.
- The owner chooses an unsigned program package containing `usage-package.json` and the fixed executable name. Version, channel version and SHA-256 must match. Every launch pins normal local package ancestors and the executable against replacement and checks the hash again. This checks consistency with the owner-selected package; it is not a publisher signature. The package script builds locked/offline and creates a new directory; it does not install or register anything.
- Native choices are typed in memory: package, existing/new ledger, Codex/Claude root or export target. The page gets at most 64 retained opaque bindings, no raw path. A wrong kind, evicted binding, unconfirmed create or unknown request field is refused. New-ledger admission becomes existing-ledger admission only after a validated creation reply.
- A native gate allows one manual runner operation at a time. Subprocess I/O is drained on workers with byte/time caps, execution is windowless, and raw stderr is discarded. Typed closed reply validation precedes forwarding. Only explicit UI actions select/read/scan/write; startup and mounting perform no source discovery.
- Stop terminates only this host's owned Usage child. SQLite keeps prior committed facts; the page waits for the outcome instead of claiming remote cancellation or success. Explicit application exit refuses new Usage work and stops its child while Memory shutdown follows its existing path. A failed shell shutdown restores admission. Closing to tray keeps the existing application lifecycle.

## Review identity and export

Paged conflict lists use a keyed source/revision/evidence-count stamp. Review tokens also bind the exact opaque group, identity and variant digest. New variants can leave the accepted projection unchanged, so checking only the export revision is insufficient. Both page continuation and confirmation reject stale evidence. The page must display the count-only candidate and require acknowledgment before adoption or whole-identity exclusion. Prior versions stay in the ledger; no maximum rule or automatic approval is introduced.

The underlying UsageSnapshot pin remains Dashboard's merged `b66a472d04da3f7767dc5ba747ba1d5b9c494a9d`, version 1.1. There is no new exchange format. Supported legacy observations stay dataset-wide unallocated, missing values stay unknown, and exports remain exclusive new files with no transmission. The UI discloses coverage, last attempt/completion/full success, unallocated dates and that the export contains aggregates only, not source text.

## Gates

Backend evidence is in [U1 runner checks](../validation/AI-usage-ledger-U1-backend.md). Desktop delivery requires the documented integration checks, isolated native package/process tests, component journeys for pending/stale/correction/export states, a real browser layout check and a packaged build. Record exact results and distinguish synthetic native host tests, mocked DOM journeys, browser preview, physical picker interaction and personal acceptance. Production and personal acceptance remain owner decisions.
