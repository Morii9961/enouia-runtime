import { historyTask } from "./history-task-fixture.ts";

export function historyResult(cursor = 0, state = cursor === 2 ? "completed" : "ready") {
  const task = historyTask(), batch = task.batches[0], request = task.request;
  const job = { run_id: batch.runId, input_event_id: batch.inputEventId, input_hash: "a".repeat(64),
    prompt_version: "extract-text-2", binding: { provider: request.api, model: request.model, adapter_version: "text-http-1" },
    subject_id: "synthetic-owner", sources: [{ source: { source_id: "synthetic-source", source_revision: 1 },
      content_hash: "b".repeat(64), start: 0, end: 64, snippet_hash: "c".repeat(64) }],
    max_candidates: request.maxCandidates, max_pending: request.maxPending, max_reserved_tokens: request.maxReservedTokens,
    max_reserved_cost_microusd: request.maxReservedCostMicrousd, state, cursor,
    candidates: Array.from({ length: cursor }, (_, i) => `synthetic-candidate-${i}`) };
  return { taskId: task.taskId, batchIndex: 1, sessionId: batch.sessionId, runId: batch.runId,
    responseHash: "d".repeat(64), dispatchId: "synthetic-dispatch", job,
    items: [0,1].map(i => ({ responseIndex: i, proposedType: "fact", content: `Synthetic original proposal ${i}`,
      quote: "synthetic quote", selectedText: "A complete synthetic quote with its nearby qualifier.",
      sourceId: "synthetic-source", sourceRevision: 1, speakerRole: "user", evidenceClass: "user_statement",
      occurredAt: null, capturedAt: "2026-10-23T00:00:00.000Z",
      application: i < cursor ? "candidate_recorded" : "awaiting_cursor",
      candidate: i < cursor ? { candidateId: `synthetic-candidate-${i}`, revision: 1, status: "pending", content: `Current candidate ${i}` } : null })) };
}
export function historyApplication(cursor = 1) {
  const {taskId,batchIndex,sessionId,runId,responseHash,job} = historyResult(cursor);
  return {taskId,batchIndex,sessionId,runId,responseHash,job};
}
