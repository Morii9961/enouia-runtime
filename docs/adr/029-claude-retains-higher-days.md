# ADR-029 — Claude history keeps the higher archived day

Date: 2026-10-07. Status: adopted and implemented. Amends Architecture v0.3 section 9, deliberate difference 6. Authority: the owner's 2026-10-07 instruction to continue B4/B5 with the best available choice; real-capability evidence in [B5 preflight](../validation/B5-preflight.md).

## Context

Architecture v0.3 let a complete, validated Claude report replace a higher archived daily value, whereas the legacy collector kept the higher value (`retainHigher`). The rationale was that a validated report is a correction.

The first real-account run on the owner's workstation showed otherwise. The normal Claude Code store now begins on 2026-08-29; earlier transcripts are gone from it. One Cowork task store still holds part of 2026-07-25. The complete, valid report therefore returned a lower value for that day, and Runtime would have replaced the archived value, permanently removing 477,625 tokens of real history from the public page. Moriium's archive notes the same constraint: every source forgets, and a discarded day cannot be collected again.

Claude stores can only lose transcripts between runs; ccusage is pinned and its deduplication does not change. Store-path duplicates, the one historical source of overcounting, are removed by discovery before reports are summed. A lower Claude value for a known day is therefore evidence of upstream loss, not of a smaller day.

## Decision

1. For Claude only, a lower reported value for an already archived date keeps the archived value. The run still succeeds, its other dates are applied, and the local merge delta counts `retainedHigherDays`.
2. Higher values, new dates and explicit zeros for new dates are applied as before. GitHub and Codex corrections in both directions are unchanged: their upstream responses are authoritative for the days they return.
3. Deliberate difference 6 is withdrawn. Runtime now matches legacy on this case, and the frozen comparison records `C03-claude-down` as equal.
4. An operator who needs to lower an archived Claude day uses an explicit, reviewed seed (migration runbook section 3), never a collection run.

## Consequences

- The public Claude history cannot shrink through collection. A genuinely overstated archived day stays overstated until reconciled by an operator.
- The fixture `claudeDownwardCorrection.runtime` and the frozen comparison expectation now equal the legacy value. The 2026-10-01 frozen report remains as historical evidence of the earlier policy.
