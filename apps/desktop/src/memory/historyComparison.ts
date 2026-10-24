// Memory ADR-MEM-81. Explicit saved-batch reads only; no writes or Provider port.
import { call, type J } from "./client.ts";
import { historyTaskObservation } from "./historyTasks.ts";

export type ComparisonChoice = { task: J; batchIndex: number };
type Binding = Readonly<{ taskId: string; batchIndex: number; sessionId: string; runId: string }>;
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const hash = (v: unknown): boolean => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const time = (v: unknown): boolean => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const mismatch = (): never => { throw new Error("history comparison observation mismatch"); };
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
export function comparisonBindings(vaultId: string, choices: readonly ComparisonChoice[]): readonly Binding[] {
  if (!text(vaultId) || !Array.isArray(choices) || choices.length < 1 || choices.length > 32) mismatch();
  const bindings = choices.map(({ task, batchIndex }) => {
    historyTaskObservation(task, { vaultId });
    const batch = task.batches.find((b: J) => b.batchIndex === batchIndex);
    if (!batch) return mismatch();
    return Object.freeze({ taskId: task.taskId as string, batchIndex,
      sessionId: batch.sessionId as string, runId: batch.runId as string });
  });
  if (new Set(bindings.map(b => JSON.stringify([b.taskId, b.batchIndex]))).size !== bindings.length
    || new Set(bindings.map(b => JSON.stringify([b.sessionId, b.runId]))).size !== bindings.length) mismatch();
  return Object.freeze(bindings);
}
const roles = ["user", "assistant", "tool", "system", "unknown"];
const evidence = ["user_statement", "user_confirmation", "external_observation", "model_claim", "summary", "unknown"];
const flags = ["UnknownTime", "NonUserEvidence", "OwnerEdited", "ReviewedOrWithdrawn", "Suppressed"];
/** Check identity and source closure; retain Core's hints without recomputing semantics. */
export function historyComparisonObservation(result: J, bindings: readonly Binding[]): J {
  if (!text(result?.base?.commitId) || !integer(result.base.sequence) || !integer(result.base.policyEpoch)
    || !integer(result.base.deletionEpoch) || !Array.isArray(result.batches) || result.batches.length !== bindings.length
    || !Array.isArray(result.runs) || result.runs.length !== bindings.length || !Array.isArray(result.topics)
    || result.topics.length > 256 || new TextEncoder().encode(JSON.stringify(result)).length > 512 * 1024) mismatch();
  const runs = new Map<string, J>(), seenEntries = new Set<string>();
  let suggestions = 0, sourceCount = 0, pairs = 0;
  for (const [i, binding] of bindings.entries()) {
    const b = result.batches[i], run = result.runs[i];
    if (b?.taskId !== binding.taskId || b.batchIndex !== binding.batchIndex
      || b.sessionId !== binding.sessionId || b.runId !== binding.runId
      || run?.selection?.session_id !== binding.sessionId || run.selection.run_id !== binding.runId
      || !hash(run.response_hash) || !["ready", "paused", "completed"].includes(run.state)
      || !integer(run.suggestions, 0, 32) || !integer(run.applied, 0, run.suggestions)
      || run.state === "completed" && run.applied !== run.suggestions
      || !Array.isArray(run.sources) || run.sources.length < 1 || run.sources.length > 16) mismatch();
    suggestions += run.suggestions; sourceCount += run.sources.length;
    for (const [index, source] of run.sources.entries()) {
      const s = source?.slice, c = source?.context;
      if (!text(s?.source?.source_id) || !integer(s.source.source_revision, 1)
        || !hash(s.content_hash) || !hash(s.snippet_hash) || !integer(s.start) || !integer(s.end, s.start + 1)
        || c?.source?.source_id !== s.source.source_id || c.source.source_revision !== s.source.source_revision
        || c.source_index !== index || c.selection?.start !== s.start || c.selection.end !== s.end
        || !text(c.text) || new TextEncoder().encode(c.text).length !== s.end - s.start
        || !roles.includes(c.speaker_role) || !evidence.includes(c.evidence_class)
        || !(c.source_context?.occurred_at === null || time(c.source_context?.occurred_at))
        || !time(c.source_context?.captured_at)
        || !["millisecond", "second", "minute", "hour", "day", "month", "year", "unknown"].includes(c.source_context.time_precision)
        || !Array.isArray(source.suggestion_indices)
        || new Set(source.suggestion_indices).size !== source.suggestion_indices.length
        || source.suggestion_indices.some((n: unknown) => !integer(n, 0, run.suggestions - 1))) mismatch();
    }
    runs.set(JSON.stringify([binding.sessionId, binding.runId]), run);
  }
  if (suggestions > 256 || sourceCount > 512) mismatch();
  for (const topic of result.topics) {
    if (!["Fact", "Preference"].includes(topic?.key?.kind) || !text(topic.key.label)
      || !Array.isArray(topic.key.subjects) || topic.key.subjects.length < 1 || topic.key.subjects.some((v: unknown) => !text(v))
      || !(topic.key.project === null || text(topic.key.project))
      || !Array.isArray(topic.entries) || topic.entries.length < 1 || !Array.isArray(topic.comparisons)) mismatch();
    for (const entry of topic.entries) {
      const run = runs.get(JSON.stringify([entry?.sessionId, entry?.runId]));
      const identity = JSON.stringify([entry.sessionId, entry.runId, entry.responseIndex]);
      if (!run || !integer(entry.responseIndex, 0, run.suggestions - 1) || seenEntries.has(identity)
        || entry.proposedType !== (topic.key.kind === "Fact" ? "fact" : "preference")
        || !text(entry.content) || !entry.details || typeof entry.details !== "object"
        || !text(entry.quote) || !text(entry.selectedText) || !entry.selectedText.includes(entry.quote)
        || !Array.isArray(entry.flags) || new Set(entry.flags).size !== entry.flags.length
        || entry.flags.some((v: unknown) => typeof v !== "string" || !flags.includes(v))) mismatch();
      const source = run.sources.find((s: J) => s.slice.source.source_id === entry.sourceId
        && s.slice.source.source_revision === entry.sourceRevision && s.context.text === entry.selectedText
        && s.suggestion_indices.includes(entry.responseIndex));
      if (!source || source.context.speaker_role !== entry.speakerRole || source.context.evidence_class !== entry.evidenceClass
        || source.context.source_context.occurred_at !== entry.occurredAt
        || source.context.source_context.captured_at !== entry.capturedAt) mismatch();
      if (entry.responseIndex >= run.applied) {
        if (entry.application !== "awaiting_cursor" || entry.candidate !== null) mismatch();
      } else if (entry.application === "suppressed") {
        if (entry.candidate !== null) mismatch();
      } else if (entry.application !== "candidate_recorded" || !text(entry.candidate?.candidateId)
        || !integer(entry.candidate.revision, 1) || !["pending", "accepted", "rejected", "merged", "withdrawn"].includes(entry.candidate.status)
        || !text(entry.candidate.content) || !entry.candidate.details || typeof entry.candidate.details !== "object") mismatch();
      seenEntries.add(identity);
    }
    const seenPairs = new Set<string>();
    for (const pair of topic.comparisons) {
      const identity = JSON.stringify([pair?.left, pair?.right]);
      if (!integer(pair?.left, 0, topic.entries.length - 1) || !integer(pair.right, pair.left + 1, topic.entries.length - 1)
        || !["ExactRepeat", "DatedDifference", "UnorderedDifference"].includes(pair.difference)
        || !["SamePath", "Divergent", "SeparateContexts", "Unknown"].includes(pair.branches) || seenPairs.has(identity)) mismatch();
      seenPairs.add(identity); pairs++;
    }
    if (seenPairs.size !== topic.entries.length * (topic.entries.length - 1) / 2) mismatch();
  }
  if (seenEntries.size !== suggestions || pairs > 4096) mismatch();
  return freeze(structuredClone(result));
}

/** New selection/read/lifecycle withdraws the old view; no background reads or retry. */
export class HistoryComparisonOwner {
  private bindings: readonly Binding[] | null = null;
  private generation = 0;
  private reading = false;
  private shown: J = null;
  private readonly vaultId: string;
  constructor(vaultId: string) { if (!text(vaultId)) mismatch(); this.vaultId = vaultId; }
  get snapshot() { return Object.freeze({ bindings: this.bindings, preview: this.shown, reading: this.reading }); }
  invalidate() { this.generation++; this.bindings = null; this.shown = null; this.reading = false; }
  select(choices: readonly ComparisonChoice[]) { this.invalidate(); this.bindings = comparisonBindings(this.vaultId, choices); }
  async read(request = call): Promise<J> {
    if (!this.bindings || this.reading) throw new Error("history comparison unavailable");
    const bindings = this.bindings, generation = this.generation;
    this.reading = true; this.shown = null;
    const current = () => this.bindings === bindings && this.generation === generation;
    try {
      const raw = await request("history_compare", { batches: bindings.map(({ taskId, batchIndex }) => ({ taskId, batchIndex })) });
      if (!current()) return null;
      const shown = historyComparisonObservation(raw, bindings);
      this.shown = shown; return shown;
    } catch (error) {
      if (!current()) return null;
      throw error;
    } finally { if (current()) this.reading = false; }
  }
}
