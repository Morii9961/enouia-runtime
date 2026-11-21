# ADR-039 — Confirmed native corrections in the registered entry

Date: 2026-11-21. Status: implemented for R4.3 gate A; activated on merge after synthetic verification. Amends ADR-038's read-only constraint for these actions only.

Morii authorized R4 gate A (writes to the real library) and asked for the gates to be done one by one, then accepted together. Memory already owns the native correction flow (ADR-MEM-103, extended to full history by ADR-MEM-155); Runtime only hosts it.

## Decision

The registered entry builds Memory's `NativeMemoryOwner` from the same authenticated registration as its reader (`descriptor.created_by`, Morii layout only). The page never supplies, sees or stores the Morii principal or a consent. `memory_catalog` gains three closed operations, main window and registered mode only:

- `plan_action` — one `OwnerAction`: correct, withdraw, forget, attention (protect / pin), theme rename / pin / dissolve, entity merge / split. Core resolves current targets, impact, scope and a five-minute expiry and writes nothing. For a correction the page supplies only what Morii confirms (literal text, title, language, sensitivity, interpretation); Runtime copies the record's current dimensions and marks the change a correction with no inherited derivation, counter-source or time, and Core validates the result.
- `confirm_action` — the main window's Confirm click on the plan it shows. Runtime calls `confirm_from_owner_gesture(operation, plan_hash, effects_hash, TrustedWindowsApp)` and immediately `commit` with the one-use consent. It is never retried automatically.
- `action_outcome` — lookup of an original operation after `correction_outcome_unknown`. The page offers only this lookup, never a new plan or confirm for that change.

Lock or exit drops the library and every pending plan. The fixed synthetic segmented entry has no Morii principal and refuses these operations (`correction_unavailable`). Workspace v1 writes stay refused in the registered entry.

## Defaults (Morii may change them)

| Item | Value |
| --- | --- |
| Who approves a write | Morii, by clicking Confirm on the shown plan; no separate request |
| Sensitivity ceiling for planning | `HighlySensitive` (same as reads, ADR-038 amendment) |
| Correction times | event and validity start as not recorded |
| Physical deletion | none: withdraw and forget are logical barriers; original sources stay |
| Backup before a batch of real writes | Memory makes a verified native export with the matching tool first |

## Verification and gates

Synthetic: native unit tests on a Morii-layout fixture (plan writes nothing, one confirm commits, replay and tampered hashes refused, lock discards plans, ordinary entry refuses), a DOM fixture for the plan → confirm → unknown-outcome journey, and the registered native smoke confirming a withdraw through the UI. Real library: Runtime plans without confirming to show the preview reaches the real root and CURRENT is unchanged; the first real write is Morii's own confirmation during acceptance, after Memory's verified export. Requires pin ≥ Memory ADR-MEM-155 so commits made by this program stay readable.
