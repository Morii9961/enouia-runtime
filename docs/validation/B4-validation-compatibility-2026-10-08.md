# Explicit safety differences in B4 comparisons

Date: 2026-10-08. Baseline: `f891ecf` plus the comparison/evidence changes. Decision: [ADR-031](../adr/031-strict-activity-validation-compatibility.md), a clarification of existing validation requirements. No Runtime parser, public three-source contract, personal seed, Memory integration or production behavior changes.

The earlier reports investigated two GitHub and twelve timestamp differences but kept them unresolved because the closed deliberate-difference list omitted existing normative checks. New reports classify only those exact cases and add assertions of the safety behavior. They do not sign off C06, B4 or B5.

## Fresh comparisons

| Evidence | Result |
|---|---|
| [Fixed-input comparison v3](B4/frozen-comparison-v3.json) | 30 cases: 23 equal, 5 explicit policy differences, 2 clock refusals, **0 unclassified differences** |
| Fixed-input safety checks | 6 additional assertions: only GitHub differs, invalid legacy success becomes failure, prior snapshot/time retained exactly |
| [Literal comparison v2](B4/literal-comparison-v2.json) | 49 cases, **75 checks**, 12 explicitly classified refusals, **0 unclassified differences** |
| Literal publishability checks | The copied actual manifest `timestamp()` rejects every noncanonical test shape; canonical control passes |
| Evidence-index self-test | 13 recorded reports, 18 rows, 152 selectors, 12 negative checks; **0 signed-off rows**, B4/B5 false |
| Runtime binary identity | Unchanged SHA-256 `cb665419f42ff088425012f9e43cebf22a21d2647f0a1a19b97df7ca236c8b7a` |

Both development harnesses use copied public reference files from clean Moriium `fd48f88c8b480480fd48a8efe36ef400b3be99b8`, verify their hashes and confirm no reference changes. The literal run adds `src/lib/status.ts` beside `activity.ts` to exercise the real manifest timestamp validator. No reference dependency enters regular Runtime tests, build or package.

## Safety interpretation

`C06-duplicate-github-date` and `C06-unsafe-github-sum` now carry `strict_github_source_validation`. Runtime fails GitHub, retains the exact prior snapshot and successful time, and allows the other sources to proceed. The historical report's Runtime bytes are unchanged; the newer evidence checker verifies that classification cannot conceal different data, inputs or outcomes.

For each of github/codex/claude, local time without a zone, RFC 1123, hour 24 and impossible February days carry `strict_retained_timestamp`. Legacy archive parsing accepts them, Runtime migration inspection returns exit 6, and the actual public manifest validator rejects them. Only those twelve case IDs can receive the classification; a newly unexpected difference stays unresolved. Timestamp strings are not normalized or restamped.

The existing date-only, explicit-offset and no-millisecond forms remain accepted for inspection and flagged as unpublishable retained success times. Import still refuses before writing a generation. This decision does not expand timestamp refusal to all noncanonical ActivityData or allow a reviewed seed to lose provenance.

## Evidence preservation and remaining scope

The original two and twelve unresolved differences remain recorded in the immutable [v2 frozen](B4/frozen-comparison-v2.json) and [original literal](B4/literal-comparison.json) reports. Their counts/hashes are preserved. Current classification is recorded separately, and the index reports historical unresolved counts apart from current unclassified counts.

The updated index also links the [actual closed-UI scheduler proof](Activity-unified/closed-ui-proof.json) to C04/C13/C17. That proof hashes its raw 57-check result and records the runner/harness identities, disabled delivery, retained history and exact pending behavior. It does not turn isolated evidence into complete C17 acceptance.

All 18 matrix rows remain partial. Real O1/O4 seed inventory/reconciliation, installed real tools, source-checkout absence, Core-repair isolation, deployed publisher/cache/About behavior, storage-fault/real-trigger acceptance and cutover/rollback remain separate. Production activation stays false.
