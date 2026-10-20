// Keys belong to exact saved-job arguments, outside head-bound previews.
// No persistence of request bodies, handles or private task data in WebView storage.
import { call, newKey, type J } from "./client.ts";

export type BatchArgs = { taskId: string; batchIndex: number; policyId: string; outputTokens: number };
export class HistoryBatchOwner {
  selection: { taskId: string; index: number } | null = null;
  private readonly drafts = new Map<string, { policy: string; output: string }>();
  private readonly keys = new Map<string, string>();
  private readonly submitted = new Set<string>();
  draft(vaultId: string, taskId: string, index: number) {
    return this.drafts.get(JSON.stringify([vaultId, taskId, index])) ?? { policy: "", output: "1024" };
  }
  setDraft(vaultId: string, taskId: string, index: number, draft: { policy: string; output: string }) {
    this.drafts.set(JSON.stringify([vaultId, taskId, index]), { ...draft });
  }
  key(vaultId: string, args: BatchArgs): string {
    const identity = JSON.stringify([vaultId, args.taskId, args.batchIndex, args.policyId, args.outputTokens]);
    let key = this.keys.get(identity);
    if (!key) { key = newKey(); this.keys.set(identity, key); }
    return key;
  }
  wasSubmitted(vaultId: string, taskId: string, index: number): boolean {
    return this.submitted.has(JSON.stringify([vaultId, taskId, index]));
  }
  markSubmitted(vaultId: string, args: BatchArgs): void {
    this.submitted.add(JSON.stringify([vaultId, args.taskId, args.batchIndex]));
  }
  forgetRefusedHandle(vaultId: string, args: BatchArgs): void {
    this.submitted.delete(JSON.stringify([vaultId, args.taskId, args.batchIndex]));
  }
}

// Process-local metadata survives surface remount, navigation and lock/reopen.
// Bodies, call handles and confirmations never enter this registry. A full
// WebView/process restart still requires fresh discovery and inspection.
const owners = new Map<string, HistoryBatchOwner>();
export function historyBatchOwner(vaultId: string): HistoryBatchOwner {
  let owner = owners.get(vaultId);
  if (!owner) { owner = new HistoryBatchOwner(); owners.set(vaultId, owner); }
  return owner;
}

export function batchPreparationObservation(result: J, task: J, args: BatchArgs): J {
  const batch = task.batches.find((b: J) => b.batchIndex === args.batchIndex);
  const id = (v: unknown) => typeof v === "string" && v.length > 0;
  if (!batch || result?.taskId !== args.taskId || result.batchIndex !== args.batchIndex
    || result.sessionId !== batch.sessionId || result.runId !== batch.runId || result.inputEventId !== batch.inputEventId
    || result.api !== task.request.api || result.model !== task.request.model || result.outputTokens !== args.outputTokens
    || ![result.callId, result.dispatchId, result.endpoint, result.body].every(id)
    || typeof result.wireHash !== "string" || !/^[a-f0-9]{64}$/.test(result.wireHash)
    || !Number.isSafeInteger(result.estimatedInputTokens) || result.estimatedInputTokens < 0
    || !Number.isSafeInteger(result.expiresInMs) || result.expiresInMs <= 0 || typeof result.streaming !== "boolean") {
    throw new Error("history batch request identity mismatch");
  }
  return result;
}

export function batchProviderSignature(status: J): string {
  if (typeof status?.configured !== "boolean" || !Array.isArray(status.destinations) || !Array.isArray(status.grants)) {
    throw new Error("provider observation unavailable");
  }
  return JSON.stringify([status.configured, status.destinations, status.grants]);
}

export const prepareHistoryBatch = (owner: HistoryBatchOwner, vaultId: string, args: BatchArgs, request = call) =>
  request("history_batch_prepare", args, owner.key(vaultId, args));
