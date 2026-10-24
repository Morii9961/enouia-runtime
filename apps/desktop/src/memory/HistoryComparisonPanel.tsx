import { useEffect, useState } from "react";
import { call, describe, type J } from "./client";
import { comparisonBindings, HistoryComparisonOwner, type ComparisonChoice } from "./historyComparison";

const hints: Record<string, string> = {
  ExactRepeat: "Exact repeat hint", DatedDifference: "Dated difference hint", UnorderedDifference: "Unordered difference hint",
  SamePath: "Same source path", Divergent: "Different branches", SeparateContexts: "Separate contexts", Unknown: "Unknown branch relationship",
  UnknownTime: "Unknown source time", NonUserEvidence: "Not user evidence", OwnerEdited: "Owner edited candidate",
  ReviewedOrWithdrawn: "Already reviewed or withdrawn", Suppressed: "Suppressed proposal",
};
export function HistoryComparisonPanel({ vaultId, choices, enabled, request = call }: {
  vaultId: string; choices: readonly ComparisonChoice[]; enabled: boolean; request?: typeof call;
}) {
  if (!enabled) return null;
  try { comparisonBindings(vaultId, choices); }
  catch { return <p className="mem-error" role="alert">Select saved batches in the current Vault before comparing.</p>; }
  return <BoundComparison key={JSON.stringify([vaultId, choices])} vaultId={vaultId} choices={choices} request={request} />;
}
function BoundComparison({ vaultId, choices, request }: {
  vaultId: string; choices: readonly ComparisonChoice[]; request: typeof call;
}) {
  const [owner] = useState(() => new HistoryComparisonOwner(vaultId));
  const [selected] = useState(() => structuredClone(choices));
  const [view, setView] = useState<J>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    owner.select(selected); setView(null); setBusy(false); setError("");
    return () => owner.invalidate();
  }, [owner, selected]);
  async function inspect() {
    if (owner.snapshot.reading) return;
    setBusy(true); setView(null); setError("");
    try {
      const result = await owner.read(request);
      if (owner.snapshot.bindings) setView(result);
    } catch (e) { if (owner.snapshot.bindings) setError(describe(e)); }
    finally { if (owner.snapshot.bindings) setBusy(false); }
  }
  return <section className="mem-stack mem-history-request" aria-label="Saved history comparison" aria-busy={busy}>
    <h3 className="mem-h3">Compare selected saved batches</h3>
    <p className="mem-muted">Read-only review hints. Dates do not choose a current truth. This does not send, approve, apply or supersede.</p>
    <div><button type="button" className="mem-button" disabled={busy} onClick={() => void inspect()}>Read comparison</button></div>
    {error && <p className="mem-error" role="alert">{error}</p>}
    {view && <div className="mem-stack">
      <p className="mem-muted">Snapshot {view.base.commitId} · {view.batches.length} selected batches · refresh explicitly after changes</p>
      {view.topics.length === 0 && <p>No suggestions in the selected saved responses.</p>}
      {view.topics.map((topic: J, index: number) => <article className="mem-card mem-stack" key={index}>
        <h4 className="mem-h3">{topic.key.kind} · {topic.key.label}</h4>
        <p className="mem-muted">Subjects: {topic.key.subjects.join(", ")} · project: {topic.key.project ?? "None"}</p>
        <ol className="mem-list">{topic.entries.map((entry: J, i: number) => <li className="mem-stack" key={i}>
          <span className="mem-label">Entry {i + 1} · {entry.application}</span>
          <p className="mem-content">Original proposal: {entry.content}</p>
          <p className="mem-content">Original details: {JSON.stringify(entry.details)}</p>
          <blockquote className="mem-content">{entry.quote}</blockquote>
          <p className="mem-content">Full selected context: {entry.selectedText}</p>
          <p className="mem-muted">Source {entry.sourceId} · r{entry.sourceRevision} · {entry.speakerRole} · {entry.evidenceClass}</p>
          <p className="mem-muted">Occurred: {entry.occurredAt ?? "Unknown"} · captured: {entry.capturedAt}</p>
          <p className="mem-muted">{entry.flags.map((f: string) => hints[f]).join(" · ") || "No review flags"}</p>
          {entry.candidate && <div className="mem-stack">
            <span className="mem-label">Current candidate · {entry.candidate.status} · r{entry.candidate.revision}</span>
            <p className="mem-content">{entry.candidate.content}</p>
            <p className="mem-content">Current details: {JSON.stringify(entry.candidate.details)}</p>
          </div>}
        </li>)}</ol>
        <ul className="mem-list">{topic.comparisons.map((pair: J) => <li key={[pair.left, pair.right].join(":")}>
          Entries {pair.left + 1} / {pair.right + 1}: {hints[pair.difference]} · {hints[pair.branches]}
        </li>)}</ul>
      </article>)}
      <details className="mem-card"><summary>All selected source coverage, including uncited slices</summary>
        {view.runs.map((run: J) => <div className="mem-stack" key={run.selection.run_id}>
          <p className="mem-muted">Run {run.selection.run_id} · {run.state} · {run.applied}/{run.suggestions} applied · response {run.response_hash}</p>
          {run.sources.map((source: J, i: number) => <div className="mem-stack" key={i}>
            <p className="mem-muted">Source {source.slice.source.source_id} · r{source.slice.source.source_revision} · bytes {source.slice.start}–{source.slice.end}
              {" · "}{source.context.speaker_role} · {source.context.evidence_class}
              {" · occurred: "}{source.context.source_context.occurred_at ?? "Unknown"}
              {" · captured: "}{source.context.source_context.captured_at}
              {" · precision: "}{source.context.source_context.time_precision}
              {" · suggestions: "}{source.suggestion_indices.map((n: number) => n + 1).join(", ") || "None"}</p>
            <p className="mem-content">{source.context.text}</p>
          </div>)}
        </div>)}
      </details>
    </div>}
  </section>;
}
