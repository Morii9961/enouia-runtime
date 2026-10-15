import { CallError, call } from "./client.ts";

export type SavedMockReference = Readonly<{ sessionId: string; branchId: string; dispatchId: string; requestHash: string }>;

/** Resolve a recorded Mock response through saved records, never through a new preview. */
export async function readSavedMockContext(reference: SavedMockReference, request = call): Promise<string> {
  const mismatch = () => new CallError({ code: "invalid_request", retryable: false, rules: [] });
  const dispatch = await request("dispatch_inspect", { dispatchId: reference.dispatchId });
  if (dispatch?.dispatchId !== reference.dispatchId || dispatch.verified !== true || dispatch.requestHash !== reference.requestHash
    || dispatch.destination?.kind !== "local_mock" || typeof dispatch.capsuleId !== "string" || !dispatch.capsuleId) throw mismatch();
  const capsuleId = dispatch.capsuleId;
  const saved = await request("context_inspect", { capsuleId });
  if (saved?.capsule?.capsule_id !== capsuleId || saved.inspection?.capsule_id !== capsuleId
    || saved.capsule.session_id !== reference.sessionId || saved.capsule.branch_id !== reference.branchId
    || saved.capsule.destination?.kind !== "local_mock" || !Array.isArray(saved.dispatches)) throw mismatch();
  const matching = saved.dispatches.filter((item: { dispatchId?: unknown } | null) => item?.dispatchId === reference.dispatchId);
  if (matching.length !== 1 || matching[0].requestHash !== reference.requestHash) throw mismatch();
  return capsuleId;
}
