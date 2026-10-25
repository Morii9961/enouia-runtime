// Synthetic metadata only, shared by the planning observation and DOM checks.
import type { HistorySelection } from "../src/memory/observationIdentity";

export const historySelection: HistorySelection = { vaultId: "synthetic-vault", importId: "synthetic-import", importRevision: 7,
  messagesPerBatch: 15, maxPathReferences: 10000, cursor: null, limit: 10 };
export const PLAN_HASH = "a".repeat(64);
export const historySource = (n: number) => ({ sourceId: `synthetic-source-${n}`, sourceRevision: 1,
  speakerRole: n % 2 ? "assistant" : "user", evidenceClass: n % 2 ? "model_claim" : "user_statement",
  occurredAt: n === 23 ? null : "2026-10-18T00:00:00.000Z", completeness: "complete" });

export function historyPage(selection = historySelection) {
  const start = selection.cursor === null ? 0 : Number(selection.cursor.split(":")[1]);
  const end = Math.min(start + selection.limit, 12);
  return {
    identity: { plannerVersion: "workspace-history-plan-1", vaultId: selection.vaultId, commitId: "synthetic-commit",
      importId: selection.importId, importRevision: selection.importRevision, inputObjectHash: "b".repeat(64), adapter: { name: "synthetic", version: "1" },
      messagesPerBatch: selection.messagesPerBatch, maxPathReferences: selection.maxPathReferences },
    planHash: PLAN_HASH,
    summary: { units: 12, messages: 24, dated: 23, undated: 1, earliest: "2026-10-18T00:00:00.000Z", latest: "2026-10-18T00:00:00.000Z",
      unparseable: 2, incompleteMessages: 1, unavailableAttachments: 3, batches: 12, issues: 1 },
    issues: [{ unitIndex: 11, kind: "unknown_selection" }], issuesOmitted: 0,
    batches: Array.from({ length: end - start }, (_, n) => { const i = n + start; return { batchIndex: i, leaf: historySource(i * 2 + 1),
      selectedInExport: i % 2 === 0, observedPathStart: "2026-10-18T00:00:00.000Z", preceding: null,
      messages: [historySource(i * 2), historySource(i * 2 + 1)] }; }),
    nextCursor: end < 12 ? `${PLAN_HASH}:${end}` : null, coverageIsCompleteHistory: false, readOnly: true,
  };
}
