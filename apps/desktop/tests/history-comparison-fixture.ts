// Synthetic Memory ADR-MEM-81 fixture; no personal source or Provider port.
import { historyTask } from "./history-task-fixture.ts";
export function historyComparisonFixture() {
  const task = historyTask();
  const choices = [0, 1].map(batchIndex => ({ task, batchIndex }));
  const batches = choices.map(({ batchIndex }) => {
    const b = task.batches.find(b => b.batchIndex === batchIndex)!;
    return { taskId: task.taskId, batchIndex, sessionId: b.sessionId, runId: b.runId };
  });
  const details = { claim_key: "synthetic_comparison", subject_ids: ["synthetic-subject"], epistemic_status: "uncertain" };
  const runs = batches.map((batch, i) => {
    const source = { source_id: "synthetic-source-" + i, source_revision: 1 };
    const content = i ? "Synthetic quote with a qualifier: not accepted." : "Synthetic quote from an unknown date.";
    return { selection: { session_id: batch.sessionId, run_id: batch.runId }, response_hash: String(i + 1).repeat(64),
      state: i ? "ready" : "completed", applied: i ? 0 : 1, suggestions: 1,
      sources: [{ slice: { source, content_hash: "a".repeat(64), snippet_hash: "b".repeat(64), start: 0, end: new TextEncoder().encode(content).length },
        context: { source, source_index: 0, selection: { start: 0, end: new TextEncoder().encode(content).length },
          text: content, speaker_role: i ? "assistant" : "user", evidence_class: i ? "model_claim" : "user_statement",
          source_context: { occurred_at: i ? "2026-01-01T00:00:00.000Z" : null,
            captured_at: "2026-10-23T00:00:00.000Z", time_precision: i ? "second" : "unknown", branch_id: null } },
        suggestion_indices: [0] }] };
  });
  const entries = batches.map((batch, i) => {
    const c = runs[i].sources[0].context;
    return { sessionId: batch.sessionId, runId: batch.runId, responseIndex: 0, proposedType: "fact",
      content: "Original synthetic proposal " + i, details: structuredClone(details), quote: "Synthetic quote",
      selectedText: c.text, sourceId: c.source.source_id, sourceRevision: 1,
      speakerRole: c.speaker_role, evidenceClass: c.evidence_class,
      occurredAt: c.source_context.occurred_at, capturedAt: c.source_context.captured_at,
      flags: i ? ["NonUserEvidence"] : ["UnknownTime", "OwnerEdited"],
      application: i ? "awaiting_cursor" : "candidate_recorded",
      candidate: i ? null : { candidateId: "synthetic-candidate", revision: 2, status: "pending",
        content: "Current owner edited synthetic wording", details: { ...details, claim_key: "edited_synthetic_key" } } };
  });
  return { task, choices, response: { base: { commitId: "synthetic-comparison-head", sequence: 10, policyEpoch: 1, deletionEpoch: 0 },
    batches, runs, topics: [{ key: { kind: "Fact", subjects: ["synthetic-subject"], project: null as string | null, label: "synthetic_comparison" },
      entries, comparisons: [{ left: 0, right: 1, difference: "UnorderedDifference", branches: "SeparateContexts" }] }] } };
}
