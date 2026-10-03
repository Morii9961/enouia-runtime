# ADR-024 — Read-only operator inspection and reviewed export

Date: 2026-10-03. Status: adopted backend design; implementation/activation pending. Authority: ADR-020/023 and current backend-design scope.

## Decision

Separate observation/export from canonical mutation/recovery selection. Freeze closed process-owned inspection reports and exact reviewed plans over validated named retained history. Export preserves bytes/ancestors and cannot become authority by discovery. Missing CURRENT permits an explicitly named non-authoritative export after validation/review, never guessed initialization/rollback/selection.

The [operator design](../VAULT_OPERATOR_v1_DESIGN.md), [schema](../../contracts/operator/inspection-export-v1.schema.json) and selected synthetic plan corpus specify this boundary. No Core endpoint/job/provider/root writer/private migration is enabled. Hashes/IDs bind review data; actual authorization and accepted ports remain required.

## Activation gates

1. Accept checked bounded native inspection, full model/invocation/receipt/raw/lineage validation and accurate selector observations on synthetic roots.
2. Prove private destination topology/ACL/ancestry/identity, plan/process expiry, actual human action and unchanged observed selector throughout export.
3. Verify exact full-ancestor payload/metadata, exclusive staging/publication, copy/space/hash/flush/sharing failures, destination uncertainty/retry and source/Activity sentinels. Distinguish injection, process death and physical fault evidence.
4. Freeze result/receipt/progress handling and advertise only accepted operations. Actual private export retains explicit user action and separately accepted scope.

Selector repair/reconciliation, destructive cleanup and import need later contracts/authorization. P04 is not accepted by this shape/plan checker.
