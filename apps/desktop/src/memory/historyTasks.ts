// Runtime validates observations from Workspace. The Core owns planning,
// source access, durable task creation and recovery.
import type { J } from "./client";

export type HistoryTaskRequest = {
  importId: string; importRevision: number; inputObjectHash: string; planHash: string; previewCommitId: string;
  messagesPerBatch: number; maxPathReferences: number; batchIndices: number[];
  api: "openai" | "anthropic"; model: string; maxCandidates: number; maxPending: number;
  maxReservedTokens: number; maxReservedCostMicrousd: number | null;
};
const REQUEST_FIELDS = ["importId", "importRevision", "inputObjectHash", "planHash", "previewCommitId", "messagesPerBatch",
  "maxPathReferences", "batchIndices", "api", "model", "maxCandidates", "maxPending", "maxReservedTokens", "maxReservedCostMicrousd"] as const;
const integer = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const id = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const time = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const mismatch = (): never => { throw new Error("history task observation mismatch"); };

/** Exact decimal entry: blank stays unknown and zero stays a real ceiling. */
export function historyCostMicrousd(text: string): number | null | undefined {
  const value = text.trim();
  if (!value) return null;
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) return undefined;
  const [whole, fraction = ""] = value.split(".");
  const amount = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : undefined;
}

export function validHistoryTaskRequest(v: J): v is HistoryTaskRequest {
  return !!v && id(v.importId) && integer(v.importRevision, 1) && hash(v.inputObjectHash) && hash(v.planHash) && id(v.previewCommitId)
    && integer(v.messagesPerBatch, 1, 15) && integer(v.maxPathReferences, 1, 100000)
    && Array.isArray(v.batchIndices) && v.batchIndices.length > 0 && v.batchIndices.length <= 32
    && v.batchIndices.every((n: unknown) => integer(n, 0, 99999)) && new Set(v.batchIndices).size === v.batchIndices.length
    && ["openai", "anthropic"].includes(v.api) && typeof v.model === "string" && v.model.length > 0 && v.model.length <= 160 && /^[A-Za-z0-9_.:-]+$/.test(v.model)
    && integer(v.maxCandidates, 1, 32) && integer(v.maxPending, 1, 500) && integer(v.maxReservedTokens, 1)
    && (v.maxReservedCostMicrousd === null || integer(v.maxReservedCostMicrousd, 0));
}

export function sameHistoryTaskRequest(a: HistoryTaskRequest, b: HistoryTaskRequest): boolean {
  return REQUEST_FIELDS.every(key => key === "batchIndices"
    ? a.batchIndices.length === b.batchIndices.length && a.batchIndices.every((n, i) => n === b.batchIndices[i])
    : a[key] === b[key]);
}

function taskRow(row: J): void {
  if (!id(row?.taskId) || !time(row.createdAt) || !validHistoryTaskRequest(row.request)) mismatch();
}

/** A saved descriptor is not a progress observation or permission to send. */
export function historyTaskListObservation(result: J, vaultId: string, limit: number): J {
  if (result?.identity?.vaultId !== vaultId || !id(result.identity.commitId) || result.readOnly !== true
    || !Array.isArray(result.items) || result.items.length > limit) mismatch();
  const ids = new Set<string>();
  for (const row of result.items) {
    taskRow(row);
    if (ids.has(row.taskId)) mismatch();
    ids.add(row.taskId);
  }
  if (result.nextCursor !== null && (typeof result.nextCursor !== "string" || result.nextCursor.length > 512
    || result.nextCursor.split(":").length !== 2 || !result.nextCursor.startsWith(`${result.identity.commitId}:`) || !/^\d+$/.test(result.nextCursor.split(":")[1] ?? "")
    || !integer(Number(result.nextCursor.split(":")[1]), result.items.length) || result.items.length !== limit)) mismatch();
  return result;
}

/** Preserve exact request ownership, selected order and genuinely missing jobs. */
export function historyTaskObservation(result: J, selection: { vaultId: string; taskId?: string; request?: HistoryTaskRequest }): J {
  taskRow(result);
  if (result?.identity?.vaultId !== selection.vaultId || result.identity.taskId !== result.taskId || !id(result.identity.commitId)
    || (selection.taskId !== undefined && result.taskId !== selection.taskId)
    || (selection.request !== undefined && !sameHistoryTaskRequest(result.request, selection.request))
    || !hash(result.materializationPlanHash) || result.readOnly !== true || !Array.isArray(result.batches) || !Array.isArray(result.missingBatchIndices)
    || !(result.coordinatorSessionId === null || id(result.coordinatorSessionId)) || !(result.coordinatorInputId === null || id(result.coordinatorInputId))
    || (result.coordinatorInputId !== null && result.coordinatorSessionId === null)) mismatch();
  const chosen: number[] = result.request.batchIndices, present = new Set<number>(), sessions = new Set<string>(), runs = new Set<string>(), inputs = new Set<string>();
  for (const batch of result.batches) {
    if (!integer(batch?.batchIndex, 0, 99999) || !chosen.includes(batch.batchIndex) || present.has(batch.batchIndex)
      || !id(batch.sessionId) || sessions.has(batch.sessionId) || batch.sessionId === result.taskId || batch.sessionId === result.coordinatorSessionId
      || !id(batch.runId) || runs.has(batch.runId) || !id(batch.inputEventId) || inputs.has(batch.inputEventId)
      || !["ready", "paused", "completed"].includes(batch.state) || !integer(batch.applied, 0, result.request.maxCandidates)
      || !(batch.invocationState === null || ["outcome_unknown", "completed", "length", "cancelled", "failed"].includes(batch.invocationState))) mismatch();
    present.add(batch.batchIndex); sessions.add(batch.sessionId); runs.add(batch.runId); inputs.add(batch.inputEventId);
  }
  const missing = chosen.filter(n => !present.has(n)), observed = chosen.filter(n => present.has(n));
  if (JSON.stringify(result.missingBatchIndices) !== JSON.stringify(missing) || result.batches.some((b: J, i: number) => b.batchIndex !== observed[i])
    || result.materializationComplete !== (missing.length === 0) || (result.batches.length > 0 && result.coordinatorInputId === null)
    || (missing.length === 0 && result.coordinatorInputId === null) || result.coordinatorSessionId === result.taskId) mismatch();
  return result;
}
