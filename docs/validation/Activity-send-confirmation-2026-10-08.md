# Activity production send confirmation

Date: 2026-10-08. Base revision: `5d88381`. Scope: two reproduced frontend confirmation defects in ADR-028, with production metadata modeled in an owned native WebView over a synthetic sandbox installation. No real production runner, task, account or delivery was used.

## Reproduction and fix

The previous page reused its Run now handler for the explicit confirmation button. Once its `confirming` state was true, a second click on the ordinary Run now button dispatched the mutation. The page also decided whether to confirm solely from the optional `overview.producer` field, so a production package with an otherwise valid older overview lacking that field dispatched immediately.

The [valid failing baseline](Activity-unified/confirmation-before.json) records **9/13**, including four failed assertions: ordinary second-click consent and first-click/visibility/second-click behavior with missing producer metadata. That run first proves mutation interception, and the real runner's high-water, publication hash, pending and pause remain unchanged.

Run now now always opens or retains the production confirmation. The separate Collect and send handler dispatches only when confirmation is present and no action is outstanding; its button is disabled while acting, running, paused or without an overview. Cancel closes the prompt without a request. Production detection considers both selected-package mode and optional runner metadata. A missing producer cannot suppress confirmation; an explicitly false delivery flag still permits collection without a send prompt. Unit checks also cover conflicting package/producer modes and sandbox controls.

## Current evidence

| Check | Result |
|---|---|
| Native modeled production confirmation, [report](Activity-unified/confirmation-after.json) | **17/17**, exit 0: enabled and missing-metadata confirmations, repeated ordinary clicks, cancel, exactly one explicit request, disabled-delivery and sandbox controls |
| Ordinary real native Activity/runner regression, [report](Activity-unified/confirmation-regression.json) | **29/29**, exit 0: runner reads, pause/resume, pending preservation, shell termination/restart and usable synthetic Memory after malformed Activity replies |
| Frontend tests | **37 passed**, no failures |
| Strict frontend check and production build | Pass |
| Desktop host and pinned-Core tests | **31 + 3 passed**, locked |
| Desktop fmt and clippy, all targets, warnings denied | Pass |
| Desktop dependency boundary self-test | 7 pinned Memory packages, 7 negative checks |
| Memory integration self-test | Exact pin consistent, 8 negative checks |
| Unsigned current-user NSIS build and ownership checks | Built; **20/20** static checks; not installed |
| Harness syntax, default-mode output preflight and Git whitespace | Pass; Git-tree Vault output refused before launch |

New release executable SHA-256: `9067ccb52f321b10ffe2acd1ed6f4f04b43dff2d3e79c124bd557781c3bfad6a`. Unsigned installer SHA-256: `a8c81938be6c825e655386de738ab9035665201871bca998e125df626638d018`. The runner stays `cb665419f42ff088425012f9e43cebf22a21d2647f0a1a19b97df7ca236c8b7a`; Memory stays pinned to `ff692ccb6fbc1c387254d5ffbef41b105eeb2a84`.

Confirmation screenshots were inspected. Detailed outputs stay in ignored `target/activity-confirm-after-20261008`; ordinary regression outputs, including its synthetic Vault, stay in a marked local temporary directory outside Git. The earlier actual-scheduler/keyboard and broader Memory/shell results remain scoped to their recorded binaries; their untouched implementation paths were not all rerun on this executable. No new full J1/B4 sign-off is claimed.

## Test mechanics and failed prerequisites

The confirmation mode preserves real native setup/read calls but transforms only their returned mode/optional producer metadata through an owned-page fetch wrapper. Run now is intercepted before native IPC and returns a structured test refusal. A direct probe must prove that the wrapper increments its request counter and returns the refusal before page actions begin. This follows the installed Tauri 2.12.0 `scripts/ipc-protocol.js` transport shape; its immutable `invoke` property is not replaced.

The first exploratory attempt incorrectly assigned that immutable property. It reached **2/4**, failed to show the modeled confirmation and started a real **synthetic** runner operation. Its marked SSH stand-in refuses delivery outside its fixture harness, so the batch remained pending; no public upload occurred. That invalid interception attempt is not the failing product baseline above. The corrected probe then established the valid **9/13** baseline and **17/17** result.

The first ordinary regression placed its output under Runtime `target`, so pinned Core correctly refused the synthetic Vault inside a Git working tree (**18/21**, including the resulting dependent failures). The final run moved output outside Git and passed **29/29**. The Activity harness now checks the default-mode output's ancestor `.git` markers before launching; focused modes that create no Vault may still use `target`. These were acceptance prerequisites, not changes to Core or its policy.

All production labels in the focused screenshots are explicitly modeled test metadata. The actual selected package is sandbox, no real send request reaches native IPC, and the final runner state is unchanged. This verifies frontend consent, not production publication, B5 activation or complete accessibility.
