# ADR-041 — Local Agent grants in the registered entry

Date: 2026-11-22. Status: implemented for R4.3 gate D, first half (grants); activated on merge after synthetic verification. Amends ADR-038's read-only constraint for persistent Agent grants only.

Morii authorized gate D: Claude Code and Codex read the library through local MCP, may add notes, correction requests and forget requests, and Morii confirms the final changes on the desktop. Memory owns grants, their checks and every request an Agent can submit (ADR-MEM-141, ADR-MEM-160); Runtime keeps the local names and shows each plan before committing it.

## Decision

- Settings lists the two local Agents. For each, Runtime plans a grant revision with `plan_owner_read_grant` (nothing written), shows the plan (revision, active, expiry, ceiling, policy and source counts, requests allowed) and commits it with `commit_owner_read_grant` only on Morii's confirm click. Plans stay in native memory; the page holds only an opaque plan id, used once.
- Actions: register (new principal and grant id), renew (+90 days), update source scope (all current policy revisions and their sources), revoke (`active: false`). Each is a new revision.
- Memory has no Agent name field. Runtime stores `vault id → agent → principal id, grant id` in its own config file (`registered-agents.json`), never in the library. Grants without a local name are counted as "other grants".
- Grant contents: every `policy_refs` revision of `owner_read_status`, the source ids of those policies minus capture-window slots not yet captured, subject Morii, no project.
- The fixed synthetic entry has no Morii principal and offers no grants.

## Defaults (Morii may change them)

| Item | Value |
| --- | --- |
| Agents | Claude Code, Codex |
| Ceiling | `Private` (HighlySensitive not given to external Agents) |
| Validity | 90 days from registration or renewal |
| Requests | notes, correction requests, forget requests (`allow_requests`) |
| New sources | added by "update source scope"; not automatic |

## Not yet in this slice

Serving the Agents' MCP pipes. Memory's enrollment expects the Agent process id before accepting, and Runtime cannot learn the id of an `enouia-memory-mcp` that Claude Code starts itself; the pairing method is being settled with Memory. Until then the panel states that connecting is not available. D2 (Morii's desktop queue for Agent correction and forget requests) follows Memory's slice.

## Verification

Synthetic: a native test registers, renews, refreshes and revokes a grant on a Morii-layout fixture (plans write nothing, a plan commits once, names stay in the local file), a DOM fixture covers the panel, and the registered native smoke registers Claude Code through Settings. Real library: grants are a real write; the first one is Morii's own confirmation during acceptance, after Memory's verified export. Requires pin ≥ Memory ADR-MEM-160.
