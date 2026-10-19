// Result fields are opaque in IPC v1. Before publishing a record, keep its
// returned identity attached to the reference that initiated this read.
import type { J } from "./client";

export function sourceObservation(result: J, sourceId: string, sourceRevision: number): J {
  if (result?.sourceId !== sourceId || result?.sourceRevision !== sourceRevision) throw new Error("source observation identity mismatch");
  return result;
}

export function memoryObservation(result: J, memoryId: string): J {
  if (result?.record?.memory_id !== memoryId || result?.summary?.memoryId !== memoryId) throw new Error("memory observation identity mismatch");
  return result;
}

export function capsuleObservation(result: J, capsuleId: string): J {
  if (result?.capsule?.capsule_id !== capsuleId || result?.inspection?.capsule_id !== capsuleId) throw new Error("capsule observation identity mismatch");
  return result;
}

export function dispatchObservation(result: J, dispatchId: string, capsuleId: string, requestHash: string): J {
  if (result?.dispatchId !== dispatchId || result?.capsuleId !== capsuleId || typeof result?.verified !== "boolean") throw new Error("dispatch observation identity mismatch");
  if (result.verified && result.requestHash !== requestHash) throw new Error("dispatch observation hash mismatch");
  return result;
}

export function sessionObservation(result: J, sessionId: string, branchId: string): J {
  if (result?.sessionId !== sessionId || result?.branchId !== branchId) throw new Error("session observation identity mismatch");
  return result;
}

export function suggestionObservation(result: J, runId: string): J {
  if (result?.job?.run_id !== runId) throw new Error("suggestion observation identity mismatch");
  return result;
}

export function operationObservation(result: J, operationId: string, kind?: string | null): J {
  if (typeof operationId !== "string" || !operationId || result?.operationId !== operationId || typeof result?.kind !== "string" || !result.kind || (kind != null && result.kind !== kind)) throw new Error("operation observation identity mismatch");
  const progress = result.progress;
  const count = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0;
  if (!["queued", "running", "succeeded", "failed", "cancelled"].includes(result.state) ||
    typeof result.cancelRequested !== "boolean" || !progress || Array.isArray(progress) ||
    !count(progress.done) || !(progress.total === null || count(progress.total))) throw new Error("operation observation fields mismatch");
  return result;
}

export function operationListObservation(result: J): J {
  if (!Array.isArray(result?.items)) throw new Error("operation list fields mismatch");
  const ids = new Set<string>();
  for (const item of result.items) {
    operationObservation(item, item?.operationId);
    if (ids.has(item.operationId)) throw new Error("operation list identity mismatch");
    ids.add(item.operationId);
  }
  return result;
}

export type HistorySelection = { vaultId: string; importId: string; importRevision: number; messagesPerBatch: number; maxPathReferences: number; cursor: string | null; limit: number };

/** Reject mixed archive, page and parameter replies before showing references. */
export function historyObservation(result: J, selection: HistorySelection): J {
  const fail = () => { throw new Error("history observation mismatch"); };
  const integer = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  const time = (value: unknown) => value === null || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
  const source = (value: J) => value && typeof value.sourceId === "string" && value.sourceId.length > 0
    && integer(value.sourceRevision) && value.sourceRevision > 0 && typeof value.speakerRole === "string"
    && typeof value.evidenceClass === "string" && typeof value.completeness === "string" && time(value.occurredAt);
  const id = result?.identity, summary = result?.summary;
  if (!id || id.plannerVersion !== "workspace-history-plan-1" || id.vaultId !== selection.vaultId
    || id.importId !== selection.importId || id.importRevision !== selection.importRevision
    || id.messagesPerBatch !== selection.messagesPerBatch || id.maxPathReferences !== selection.maxPathReferences
    || typeof id.commitId !== "string" || !id.commitId || !hash(id.inputObjectHash)
    || !hash(result.planHash) || result.readOnly !== true || result.coverageIsCompleteHistory !== false || !summary) fail();
  for (const key of ["units", "messages", "dated", "undated", "unparseable", "incompleteMessages", "unavailableAttachments", "batches", "issues"])
    if (!integer(summary[key])) fail();
  if (summary.dated + summary.undated !== summary.messages || summary.incompleteMessages > summary.messages
    || !time(summary.earliest) || !time(summary.latest) || !Array.isArray(result.batches) || !Array.isArray(result.issues)
    || result.issues.length > 100 || !integer(result.issuesOmitted) || result.issues.length + result.issuesOmitted !== summary.issues) fail();
  let start = 0;
  if (selection.cursor !== null) {
    const parts = selection.cursor.split(":");
    if (parts.length !== 2 || parts[0] !== result.planHash || !/^\d+$/.test(parts[1])) fail();
    start = Number(parts[1]);
    if (!integer(start) || start > summary.batches) fail();
  }
  const end = start + result.batches.length;
  if (result.batches.length !== Math.min(selection.limit, summary.batches - start)
    || result.nextCursor !== (end < summary.batches ? `${result.planHash}:${end}` : null)) fail();
  result.batches.forEach((batch: J, index: number) => {
    if (batch?.batchIndex !== start + index || !source(batch.leaf) || typeof batch.selectedInExport !== "boolean"
      || !time(batch.observedPathStart) || !(batch.preceding === null || source(batch.preceding))
      || !Array.isArray(batch.messages) || batch.messages.length === 0 || batch.messages.length > selection.messagesPerBatch
      || batch.messages.some((message: J) => !source(message))) fail();
  });
  result.issues.forEach((issue: J) => {
    if (!integer(issue?.unitIndex) || issue.unitIndex >= summary.units
      || !["ambiguous_message_id", "broken_parent_chain", "unknown_selection", "non_monotonic_time"].includes(issue.kind)) fail();
  });
  return result;
}
