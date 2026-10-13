// Result fields are opaque in IPC v1. Before publishing a record, keep its
// returned identity attached to the reference that initiated this read.
import { type J } from "./client";

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
