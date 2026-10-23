// Memory ADR-MEM-72 consumer at the exact pin. No Provider setup, transport,
// approval, Vault-file access or WebView storage belongs here.
import { call, type J } from "./client.ts";
import { historyTaskObservation } from "./historyTasks.ts";

export type HistoryApplyArgs = { taskId: string; batchIndex: number; responseHash: string; cursor: number };
type Scope = {
  vaultId: string; taskId: string; batchIndex: number; sessionId: string; runId: string; inputEventId: string;
  api: string; model: string; maxCandidates: number; maxPending: number;
  maxReservedTokens: number; maxReservedCostMicrousd: number | null;
};
type Held = { args: Readonly<HistoryApplyArgs>; key: string; acknowledged: boolean };
const integer = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const id = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const mismatch = (): never => { throw new Error("history result observation mismatch"); };
const time = (v: unknown): boolean => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
function immutable<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
function selection(vaultId: string, task: J, batchIndex: number): Scope {
  historyTaskObservation(task, { vaultId });
  const batch = task.batches.find((b: J) => b.batchIndex === batchIndex);
  if (!batch) return mismatch();
  return Object.freeze({ vaultId, taskId: task.taskId, batchIndex,
    sessionId: batch.sessionId, runId: batch.runId, inputEventId: batch.inputEventId,
    api: task.request.api, model: task.request.model, maxCandidates: task.request.maxCandidates,
    maxPending: task.request.maxPending, maxReservedTokens: task.request.maxReservedTokens,
    maxReservedCostMicrousd: task.request.maxReservedCostMicrousd });
}
function argumentsFor(args: HistoryApplyArgs): Readonly<HistoryApplyArgs> {
  if (!id(args?.taskId) || !integer(args.batchIndex, 0, 99999) || !hash(args.responseHash) || !integer(args.cursor, 0, 32)) mismatch();
  return Object.freeze({ taskId: args.taskId, batchIndex: args.batchIndex, responseHash: args.responseHash, cursor: args.cursor });
}
/** Stable identity recovers only this local cursor step, never a new response item. */
export async function historyApplicationKey(vaultId: string, args: HistoryApplyArgs): Promise<string> {
  if (!id(vaultId)) mismatch();
  const a = argumentsFor(args);
  const bytes = new TextEncoder().encode(JSON.stringify([
    "enouia-runtime-history-batch-apply-v1", vaultId, a.taskId, a.batchIndex, a.responseHash, a.cursor,
  ]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `ui-history-apply-v1-${Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("")}`;
}
function jobObservation(result: J, scope: Scope): J {
  const job = result?.job;
  if (result?.taskId !== scope.taskId || result.batchIndex !== scope.batchIndex
    || result.sessionId !== scope.sessionId || result.runId !== scope.runId
    || job?.run_id !== scope.runId || job.input_event_id !== scope.inputEventId
    || !hash(job.input_hash) || !["extract-text-1", "extract-text-2"].includes(job.prompt_version)
    || job.binding?.provider !== scope.api || job.binding.model !== scope.model || job.binding.adapter_version !== "text-http-1"
    || !id(job.subject_id) || job.max_candidates !== scope.maxCandidates || job.max_pending !== scope.maxPending
    || job.max_reserved_tokens !== scope.maxReservedTokens || job.max_reserved_cost_microusd !== scope.maxReservedCostMicrousd
    || !["ready", "paused", "completed"].includes(job.state) || !integer(job.cursor, 0, scope.maxCandidates)
    || !Array.isArray(job.candidates) || job.candidates.length !== job.cursor
    || job.candidates.some((v: unknown) => v !== null && !id(v))
    || !Array.isArray(job.sources) || job.sources.length < 1 || job.sources.length > 16) mismatch();
  let bytes = 0;
  for (const source of job.sources) {
    if (!id(source?.source?.source_id) || !integer(source.source.source_revision, 1)
      || !hash(source.content_hash) || !hash(source.snippet_hash)
      || !integer(source.start, 0) || !integer(source.end, source.start + 1) || source.end - source.start > 32768) mismatch();
    bytes += source.end - source.start;
  }
  if (bytes > 65536) mismatch();
  return job;
}
/** Checks fields exposed to the future inspector against the observed saved task. */
export function historyPreviewObservation(result: J, vaultId: string, task: J, batchIndex: number): J {
  return previewObservation(result, selection(vaultId, task, batchIndex));
}
function previewObservation(result: J, scope: Scope): J {
  const job = jobObservation(result, scope);
  if (!id(result.dispatchId) || !hash(result.responseHash) || !Array.isArray(result.items)
    || result.items.length > scope.maxCandidates || job.cursor > result.items.length
    || job.state === "completed" && job.cursor !== result.items.length) mismatch();
  for (const [index, item] of result.items.entries()) {
    if (item?.responseIndex !== index || !["fact", "preference", "episode", "project_state", "session_checkpoint", "identity"].includes(item.proposedType) || !id(item.content)
      || !id(item.quote) || !id(item.selectedText) || !item.selectedText.includes(item.quote)
      || !id(item.sourceId) || !integer(item.sourceRevision, 1)
      || !job.sources.some((s: J) => s.source.source_id === item.sourceId && s.source.source_revision === item.sourceRevision)
      || !["user", "assistant", "tool", "system", "unknown"].includes(item.speakerRole)
      || !["user_statement", "user_confirmation", "external_observation", "model_claim", "summary", "unknown"].includes(item.evidenceClass)
      || !(item.occurredAt === null || time(item.occurredAt)) || !time(item.capturedAt)) mismatch();
    const recorded = job.candidates[index];
    if (index >= job.cursor) {
      if (item.application !== "awaiting_cursor" || item.candidate !== null) mismatch();
    } else if (recorded === null) {
      if (item.application !== "suppressed" || item.candidate !== null) mismatch();
    } else if (item.application !== "candidate_recorded" || item.candidate?.candidateId !== recorded
      || !integer(item.candidate.revision, 1) || !["pending", "accepted", "rejected", "merged", "withdrawn"].includes(item.candidate.status)
      || !id(item.candidate.content)) mismatch();
  }
  return immutable(structuredClone(result));
}
function applicationObservation(result: J, scope: Scope, args: HistoryApplyArgs): J {
  const job = jobObservation(result, scope);
  // A cooperating client can advance farther. Core returns a verified current
  // job for an old cursor; that never authorizes our next step.
  if (result.responseHash !== args.responseHash || job.cursor < args.cursor) mismatch();
  return immutable(structuredClone(result));
}

/** Select only after observing the saved task; invalidate on lifecycle change
 * or unmount. Construction and selection perform no IPC. */
export class HistoryResultOwner {
  private readonly vaultId: string;
  private scope: Scope | null = null;
  private epoch = 0;
  private shown: J = null;
  private active: "reading" | "applying" | null = null;
  private readonly held = new Map<string, Held>();
  constructor(vaultId: string) { if (!id(vaultId)) mismatch(); this.vaultId = vaultId; }
  private identity(scope: Scope): string { return JSON.stringify(scope); }
  private current(scope: Scope, epoch: number): boolean { return this.scope === scope && this.epoch === epoch; }
  get snapshot() {
    const pending = this.scope ? this.held.get(this.identity(this.scope)) ?? null : null;
    return Object.freeze({ phase: this.active ?? (pending ? "recovery_required" : this.shown ? "inspected" : "unobserved"),
      scope: this.scope, preview: this.shown, pending: pending ? Object.freeze({ ...pending }) : null });
  }
  select(task: J, batchIndex: number): void {
    this.invalidate();
    this.scope = selection(this.vaultId, task, batchIndex);
  }
  invalidate(): void { this.epoch++; this.scope = null; this.shown = null; }
  private observedScope(): Scope {
    if (!this.scope || this.active) throw new Error("history result owner unavailable");
    return this.scope;
  }
  async preview(request = call): Promise<J> {
    const scope = this.observedScope(), epoch = this.epoch;
    this.active = "reading"; this.shown = null;
    try {
      const result = previewObservation(await request("history_batch_preview",
        { taskId: scope.taskId, batchIndex: scope.batchIndex }), scope);
      if (!this.current(scope, epoch)) return null;
      this.shown = result;
      const held = this.held.get(this.identity(scope));
      // A read establishes progress, not whose request committed or whether a
      // candidate was published. Same-position ready jobs remain uncertain.
      if (held && result.responseHash === held.args.responseHash
        && (result.job.cursor > held.args.cursor || result.job.state === "completed" && result.job.cursor === held.args.cursor)) {
        this.held.delete(this.identity(scope));
      }
      return result;
    } catch (error) {
      if (!this.current(scope, epoch)) return null;
      throw error;
    } finally { this.active = null; }
  }
  async apply(confirmed: boolean, request = call): Promise<J> {
    const scope = this.observedScope();
    if (confirmed !== true || !this.shown || this.shown.job.state !== "ready" || this.held.has(this.identity(scope))) {
      throw new Error("inspect and confirm one history result step first");
    }
    return this.submit(scope, argumentsFor({ taskId: scope.taskId, batchIndex: scope.batchIndex,
      responseHash: this.shown.responseHash, cursor: this.shown.job.cursor }), request);
  }
  /** Explicitly retry the held step. After process restart, the caller may
   * supply original hash/cursor metadata: the original key is reconstructed.
   * A fresh preview must first verify this response and cursor. */
  async recover(confirmed: boolean, original?: HistoryApplyArgs, request = call): Promise<J> {
    const scope = this.observedScope(), held = this.held.get(this.identity(scope));
    const args = original ? argumentsFor(original) : held?.args;
    if (confirmed !== true || !args || !this.shown || args.taskId !== scope.taskId || args.batchIndex !== scope.batchIndex
      || args.responseHash !== this.shown.responseHash || args.cursor > this.shown.job.cursor
      || held && JSON.stringify(args) !== JSON.stringify(held.args)) {
      throw new Error("inspect the saved response before recovering the original history step");
    }
    return this.submit(scope, args, request);
  }
  private async submit(scope: Scope, args: Readonly<HistoryApplyArgs>, request: typeof call): Promise<J> {
    const epoch = this.epoch, identity = this.identity(scope);
    this.active = "applying"; this.shown = null;
    try {
      const key = await historyApplicationKey(this.vaultId, args);
      // Web Crypto yields: A -> B -> A, lock or unmount invalidates submission.
      if (!this.current(scope, epoch)) return null;
      const existing = this.held.get(identity);
      if (existing && (existing.key !== key || JSON.stringify(existing.args) !== JSON.stringify(args))) mismatch();
      const held: Held = { args, key, acknowledged: false };
      this.held.set(identity, held); // retained before IPC, including thrown/invalid replies
      const result = applicationObservation(await request("history_batch_apply", args, key), scope, args);
      held.acknowledged = true;
      return this.current(scope, epoch) ? result : null;
    } catch (error) {
      if (!this.current(scope, epoch)) return null;
      throw error;
    } finally { this.active = null; }
    // Receipt delivery never selects another cursor or issues another command.
  }
}

// Process-local only. Lifecycle invalidation drops previews/quotes/confirmation;
// uncertain requests retain only exact argument/key metadata.
const owners = new Map<string, HistoryResultOwner>();
export function historyResultOwner(vaultId: string): HistoryResultOwner {
  let owner = owners.get(vaultId);
  if (!owner) { owner = new HistoryResultOwner(vaultId); owners.set(vaultId, owner); }
  return owner;
}
