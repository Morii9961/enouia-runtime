// Synthetic metadata, with no source text, endpoint or credential.
import { historyPage } from "./history-fixture.ts";
import type { HistoryTaskRequest } from "../src/memory/historyTasks";

export function historyTaskRequest(): HistoryTaskRequest {
  const plan = historyPage(), identity = plan.identity;
  return { importId: identity.importId, importRevision: identity.importRevision, inputObjectHash: identity.inputObjectHash,
    planHash: plan.planHash, previewCommitId: identity.commitId, messagesPerBatch: identity.messagesPerBatch,
    maxPathReferences: identity.maxPathReferences, batchIndices: [1, 0], api: "openai", model: "synthetic-model",
    maxCandidates: 8, maxPending: 100, maxReservedTokens: 10000, maxReservedCostMicrousd: null };
}

export function historyTask(present = [1, 0]) {
  const request = historyTaskRequest();
  return { taskId: "synthetic-history-task", createdAt: "2026-10-19T00:00:00.000Z", request,
    identity: { vaultId: "synthetic-vault", commitId: "synthetic-task-head", taskId: "synthetic-history-task" },
    coordinatorSessionId: present.length ? "synthetic-coordinator" : null, coordinatorInputId: present.length ? "synthetic-coordinator-input" : null,
    materializationPlanHash: "c".repeat(64), batches: present.map(index => ({ batchIndex: index,
      sessionId: `synthetic-child-${index}`, runId: `synthetic-run-${index}`, inputEventId: `synthetic-input-${index}`,
      state: "ready", applied: 0, invocationState: null as string | null })),
    missingBatchIndices: request.batchIndices.filter(index => !present.includes(index)), materializationComplete: present.length === 2, readOnly: true };
}
