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
