# ADR-042 — Agent request queue in the registered entry

Date: 2026-11-22. Status: implemented for R4.3 gate D, second half (D2); activated on merge after synthetic verification. Requires pin ≥ Memory ADR-MEM-161.

Morii authorized gate D: Claude Code and Codex may save correction requests and forget requests through local MCP, and Morii confirms the final change on the desktop. Memory owns the saved requests and lists them for Morii (`NativeMemoryOwner::agent_requests`, ADR-MEM-161). A request changes nothing by itself.

## Decision

- Settings shows "Agent requests": counts of waiting, skipped and resolved requests, and each waiting request with the Agent's local name (from `registered-agents.json`; otherwise "Unnamed Agent"), the target record, the quoted user words it cites and the Agent's proposal, labelled as not checked.
- "Review…" opens the existing correction panel for the target record with only that action: a correction prefilled with the Agent's text (editable), or a forget. The change is planned by Core, shown, and written only on Morii's confirm click (ADR-039). A resolved request leaves the queue because its target revision changed (`pending: false`).
- "Skip" stores the request key in Runtime's local `ignored-agent-requests.json`, beside the Agent names, never in the library. Skipped requests can be returned to the queue.
- The read uses the registered reader's ceiling. The query is read-only; the skip mark is a local write and is never replayed.

## Verification

Synthetic: a native test captures two connector turns, registers Claude Code, submits a correction request and a forget request under the grant, reads the queue (names, pending), skips one (library unchanged, local file written), and resolves the forget through plan/confirm (`pending` becomes false). A DOM fixture covers counts, skipping, the prefilled single-action review, one confirm and returning a skipped request. Real library: acting on a request is a real write and is Morii's confirmation during acceptance, after Memory's verified export.
