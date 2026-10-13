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
