# v0.3 design validation evidence

Date: 2026-09-26. Scope: documentation and read-only protocol inspection only.

## Checks performed

- Read all 2,361 lines of architecture v0.2 and the complete activity handoff.
- Confirmed the initial Runtime directory contained only those two Markdown inputs, with no Git repository or local `AGENTS.md` found at the workspace/drive-parent locations checked.
- Inspected the current local Moriium contract, collectors, merge, synchronization, storage, receiver, publisher, scheduler-registration script, and activity/status regression tests.
- Parsed the v0.3 JSON batch example and executed it through the actual local Moriium `validateBatch` with a fixed clock. It was accepted without normalization changes. Node used for this check: `v24.15.0`; this is evidence of this check, not a required Runtime toolchain pin.
- Checked generated documents for existing relative Markdown link targets and balanced code fences.
- Verified both original input files retained their original SHA-256 hashes at this design pass. The handoff in this public repository was later redacted; the unchanged original remains in a local Git-ignored directory.
- Reviewed the requested feature list against architecture sections 3–15, the A/B milestone plan, ADRs, and migration matrix C01–C18.

No application build or implementation suite exists in this directory yet. Legacy tests were read, not rerun. No real source collection, credential read/copy, task registration, upload, VPS access, page deployment, or cutover was performed. Production activation, source-account login, and current archives remain unverified operational gates.

## Preserved inputs

| File | SHA-256 |
|---|---|
| Enouia_Runtime_Architecture_v0.2.md | b57ed9f5ab43d1b94ddd62ef1b570538c41a53bf227ac2dc46f7b4791a14a5a8 |
| handoff-2026-09-26-activity-to-enouia-runtime.md | Original retained locally; public copy redacted before release |

## Local protocol reference

Checkout inspected: local Moriium checkout. HEAD: `4f86e7a94eabc3bbdd78ccf806e5fa15efe544ea`. A targeted `git status --short` reported no working-tree changes in the files below. These hashes describe local file bytes; preserve or account for line-ending differences when reproducing them. M0 should reuse this evidence and recheck for drift before freezing executable comparison fixtures.

| Relative source path | SHA-256 |
|---|---|
| src/lib/activity.ts | 6e13dc4d9d190f05032b6db3432aeb5754877b321ca74012fbdc6fe4fe47b273 |
| src/lib/status.ts | fb4ce6c27bbef97215d44289cc7a9b1d3a5787740978d39caabae4dc669d9d80 |
| scripts/lib/activity-import.ts | 7fc5aadcc374acc45025682efb6fffe845371cba4cddd86af0bf704ed69e444b |
| scripts/lib/codex-usage.ts | 1876e0b383cb1604f63aee7c062a31504b0d964abc0407df2fed222215258826 |
| scripts/lib/cowork.ts | 1b1b9b55475b77e63b061979115e994dc681bfcd52f6d21511068a7be107ff83 |
| scripts/lib/status-batch.mjs | 50c1450e19094ff632ee658d983c11c0d25f6c58c76b2fd764cd4dc642134192 |
| scripts/lib/status-store.mjs | 98638b497acc0386264981457e41bd3c2dbabfdc6104260d1b5845edf5aa092c |
| scripts/collect-activity.mjs | 1a843d329bc3ebd3fde0c73712acbfa44b5bf20cdbe4ef4686302e5cc68af207 |
| scripts/refresh-activity.mjs | 2beffbc21decfa02d20a126a420544e420ce2174f7440ad48a8ab5113a934dfd |
| scripts/activity-sync.mjs | 2b63fc830bf7c5272b899d136955a38b82e4730fcf0217ef1cc674ba637d0ee0 |
| scripts/status-receive.mjs | e32f12e127e38fd552301377cd3b31323269c7f2a394317e1b2f2334570bd98c |
| scripts/status-publish.mjs | 5d95b17ac50025f2828b4c8421ebe8e26fefabe125fad18df8fada6c68b87a55 |
| deploy/windows/register-activity-sync.ps1 | 415b161edbe44d38e7361b97c36fc72688f5df21b4c341153f7bbf5646e179a3 |
| tests/activity.test.mjs | 3c8c615e7dbcff03eed040f140fdf7fe0001f5c05eb1567aaabe46afd59200b6 |
| tests/status.test.mjs | d03bb65c369aa023369fbf28a9763eb2e53e0d598d5595496c446e5e8dab5ef7 |

## Protocol findings reflected in v0.3

The receiver ignores equal/lower sequences but its CLI exits 0, so transport completion cannot prove publication. The public manifest has data hash and source outcomes but no sequence receipt; ambiguous delivery requires reconciliation. Batch attempt/creation timestamps must use exact UTC ISO round-trip form. Public ActivityData permits broader parseable source timestamps than the manifest; migration validates both layers.

The old Codex importer permits missing lifetime totals; the handoff requires reconciliation, so the new design deliberately fails that source when the total is absent. Legacy date-end filtering could remove known dates under clock rollback; v0.3 blocks the run. Cowork unreadable-store handling, path deduplication, AI admission bounds, and atomic transaction durability are also explicitly recorded differences, not unreported deviations from comparison expectations.
