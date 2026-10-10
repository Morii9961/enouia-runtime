# ADR-031 — Classify existing strict Activity validation in comparisons

Date: 2026-10-08. Status: adopted clarification; no Runtime behavior or public contract changes. Authority: Architecture v0.3 sections 7–9 and the owner's instruction to finish remaining Runtime Activity work. B4 row sign-off, real-seed reconciliation and B5 activation remain separate.

## Context

The fixed-input comparison kept two investigated GitHub differences unresolved because section 9's deliberate-difference list omitted checks already required by the normative unique-date/safe-integer contract. The timestamp matrix likewise kept twelve differences unresolved: four literal shapes across three sources are accepted by legacy `Date.parse` but refused by Runtime. The old public manifest validator refuses those same literals when used as retained success times.

Weakening Runtime to mimic these legacy acceptance paths would violate existing validation requirements or import data that cannot be published on the next failed-source run. Silently restamping a seed would change its meaning. The gap is in comparison classification and the closed difference list, rather than the Runtime implementation.

## Decision

1. **Strict GitHub report validation** is an expected safety difference. Duplicate input dates and an unsafe source aggregate fail the GitHub source and preserve its previous dates, values and successful time. Other sources still advance. This does not authorize coercion, rounding, summation of duplicates or replacement of retained history. The two exact synthetic case IDs are `C06-duplicate-github-date` and `C06-unsafe-github-sum`.
2. **Strict retained timestamp parsing** is an expected safety difference for local time without a zone, RFC 1123, hour 24 and impossible calendar days. Runtime refuses such migration seeds. These four shapes across exactly `github`, `codex` and `claude` are classified as `intentional_refusal`, with policy `strict_retained_timestamp`, only after verifying legacy archive acceptance, Runtime exit 6 and rejection by the copied public manifest timestamp validator.
3. This does not make all noncanonical timestamps invalid ActivityData. Existing accepted date-only, offset and no-millisecond forms retain their inspection flags and import refusal under section 7. No seed is restamped automatically. Real-seed inspection must still prove publishability or provide explicitly reviewed reconciliation with original provenance preserved.
4. Unexpected differences remain unresolved and block the corresponding acceptance. The comparison harnesses must not classify by a broad “Runtime is stricter” rule. Named safety cases require their exact rejection/retention evidence. Historical reports keep their original unresolved counts and hashes; new reports record this decision.

## Classification gates and observed results

- The new fixed-input run has 30 cases: 23 equal, five explicit policy differences and two clock refusals, with no unclassified differences. Six additional assertions prove that each GitHub safety case affects only GitHub, turns the invalid legacy success into a failed Runtime outcome and retains its prior snapshot/success time exactly.
- The new literal run has 49 cases and 75 checks. It copies both public validators from the same clean reference revision. All twelve named stricter refusals are nonpublishable under the actual manifest validator; the canonical control passes. Units/zones and existing flagged forms retain their original behavior. No other difference is waived.
- Runtime source, runner binary and three-source public meaning are unchanged. The fresh reports and the evidence-index checks bind classification to the exact observed cases.

These classification gates are satisfied by the [validation report](../validation/B4-validation-compatibility-2026-10-08.md). They authorize documenting the existing behavior, not deployment, personal migration, complete C06 acceptance or B4/B5 activation.
