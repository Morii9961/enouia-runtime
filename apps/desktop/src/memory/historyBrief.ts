// Deterministic local navigation from an explicitly inspected comparison.
import { call, type J } from "./client.ts";
import { comparisonBindings, historyComparisonObservation, type ComparisonChoice } from "./historyComparison.ts";

const mismatch = (): never => { throw new Error("history brief observation mismatch"); };
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const budget = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 1 && v <= 2 * 1024 * 1024;
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
export async function historyBriefObservation(result: J, comparison: J, maxBytes: number): Promise<J> {
  result = structuredClone(result);
  if (!budget(maxBytes) || result?.maxBytes !== maxBytes || !hash(result?.contentHash)
    || typeof result?.markdown !== "string" || result.markdown.length === 0
    || !Array.isArray(result.batches) || result.batches.length !== comparison.batches.length) mismatch();
  for (const field of ["commitId", "sequence", "policyEpoch", "deletionEpoch"])
    if (result.base?.[field] !== comparison.base[field]) mismatch();
  for (const [i, batch] of comparison.batches.entries())
    for (const field of ["taskId", "batchIndex", "sessionId", "runId"])
      if (result.batches[i]?.[field] !== batch[field]) mismatch();
  const bytes = new TextEncoder().encode(result.markdown);
  if (bytes.length > maxBytes) mismatch();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const actual = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
  if (actual !== result.contentHash) mismatch();
  return freeze(structuredClone(result));
}
type Binding = { comparison: J; args: Readonly<{ batches: readonly { taskId: string; batchIndex: number }[];
  comparisonCommitId: string; maxBytes: number }> };
export class HistoryBriefOwner {
  private readonly vaultId: string;
  private binding: Binding | null = null;
  private generation = 0;
  private reading = false;
  private shown: J = null;
  constructor(vaultId: string) { this.vaultId = vaultId; }
  get snapshot() { return Object.freeze({ preview: this.shown, reading: this.reading, selected: this.binding !== null }); }
  invalidate() { this.generation++; this.binding = null; this.shown = null; this.reading = false; }
  select(choices: readonly ComparisonChoice[], comparison: J, maxBytes = 128 * 1024) {
    this.invalidate();
    if (!budget(maxBytes)) mismatch();
    const bindings = comparisonBindings(this.vaultId, choices);
    const observed = historyComparisonObservation(comparison, bindings);
    this.binding = freeze({ comparison: observed, args: { batches: bindings.map(({ taskId, batchIndex }) => ({ taskId, batchIndex })),
      comparisonCommitId: observed.base.commitId, maxBytes } });
  }
  async read(request = call): Promise<J> {
    if (!this.binding || this.reading) throw new Error("history brief unavailable");
    const binding = this.binding, generation = this.generation;
    const current = () => this.binding === binding && this.generation === generation;
    this.reading = true; this.shown = null;
    try {
      const raw = await request("history_brief", binding.args);
      if (!current()) return null;
      const shown = await historyBriefObservation(raw, binding.comparison, binding.args.maxBytes);
      // Hashing yields too: selection/lifecycle round trips cannot restore old text.
      if (!current()) return null;
      this.shown = shown; return shown;
    } catch (error) {
      if (!current()) return null;
      throw error;
    } finally { if (current()) this.reading = false; }
  }
}
