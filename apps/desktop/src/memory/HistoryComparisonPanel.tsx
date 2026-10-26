import { useEffect, useId, useRef, useState } from "react";
import { call, describe, type J } from "./client";
import { comparisonBindings, HistoryComparisonOwner, type ComparisonChoice } from "./historyComparison";

import { HistoryBriefPanel } from "./HistoryBriefPanel";

import { labels, msg, t } from '../i18n/index.ts';
const hints: Record<string, string> = labels({
  ExactRepeat: msg("Exact repeat hint"), DatedDifference: msg("Dated difference hint"), UnorderedDifference: msg("Unordered difference hint"),
  SamePath: msg("Same source path"), Divergent: msg("Different branches"), SeparateContexts: msg("Separate contexts"), Unknown: msg("Unknown branch relationship"),
  UnknownTime: msg("Unknown source time"), NonUserEvidence: msg("Not user evidence"), OwnerEdited: msg("Owner edited candidate"),
  ReviewedOrWithdrawn: msg("Already reviewed or withdrawn"), Suppressed: msg("Suppressed proposal"),
});
export function HistoryComparisonPanel({ vaultId, choices, enabled, request = call }: {
  vaultId: string; choices: readonly ComparisonChoice[]; enabled: boolean; request?: typeof call;
}) {
  if (!enabled) return null;
  try { comparisonBindings(vaultId, choices); }
  catch { return <p className="mem-error" role="alert">{t("Select saved batches in the current Vault before comparing.")}</p>; }
  return <BoundComparison key={JSON.stringify([vaultId, choices])} vaultId={vaultId} choices={choices} request={request} />;
}
function BoundComparison({ vaultId, choices, request }: {
  vaultId: string; choices: readonly ComparisonChoice[]; request: typeof call;
}) {
  const [owner] = useState(() => new HistoryComparisonOwner(vaultId));
  const [selected] = useState(() => structuredClone(choices));
  const [view, setView] = useState<J>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const fieldId = useId();
  const [project, setProject] = useState("all"), [topicIndex, setTopicIndex] = useState("");
  const [coverageMode, setCoverageMode] = useState("all");
  const [focusedSource, setFocusedSource] = useState<J>(null);
  const coverageRef = useRef<HTMLElement>(null);

  const spans: J[] = view?.runs.flatMap((run: J) => run.sources) ?? [];
  const uniqueSpans = new Set(spans.map(source => JSON.stringify([
    source.slice.source.source_id, source.slice.source.source_revision, source.slice.start, source.slice.end,
  ]))).size;
  const uncitedSpans = spans.filter(source => source.suggestion_indices.length === 0).length;
  const zeroResponses = view?.runs.filter((run: J) => run.suggestions === 0).length ?? 0;
  const sourceMatches = (source: J) => coverageMode === "selected" ? source === focusedSource
    : coverageMode === "uncited" ? source.suggestion_indices.length === 0
    : coverageMode === "unknown" ? source.context.source_context.occurred_at === null
    : coverageMode === "non_user" ? !["user_statement", "user_confirmation"].includes(source.context.evidence_class) : true;
  const coverageRuns: { run: J; sources: J[] }[] = (view?.runs ?? []).map((run: J) => ({
    run, sources: run.sources.filter(sourceMatches),
  })).filter(({ run, sources }: { run: J; sources: J[] }) => sources.length > 0 && (coverageMode !== "zero" || run.suggestions === 0));

  const topics: { topic: J; index: number }[] = view?.topics.map((topic: J, index: number) => ({ topic, index })) ?? [];
  const projectTopics = topics.filter(({ topic }) => project === "all"
    || (project === "none" ? topic.key.project === null : topic.key.project === project));
  const displayedTopics = projectTopics.filter(({ index }) => topicIndex === "" || index === Number(topicIndex));
  const projects: string[] = [...new Set<string>(topics.flatMap(({ topic }) => topic.key.project === null ? [] : [topic.key.project]))];

  useEffect(() => {
    owner.select(selected); setView(null); setBusy(false); setError("");
    return () => owner.invalidate();
  }, [owner, selected]);
  async function inspect() {
    if (owner.snapshot.reading) return;
    setBusy(true); setView(null); setError(""); setProject("all"); setTopicIndex(""); setCoverageMode("all"); setFocusedSource(null);
    try {
      const result = await owner.read(request);
      if (owner.snapshot.bindings) setView(result);
    } catch (e) { if (owner.snapshot.bindings) setError(describe(e)); }
    finally { if (owner.snapshot.bindings) setBusy(false); }
  }
  function showSource(entry: J) {
    const run = view.runs.find((run: J) => run.selection.session_id === entry.sessionId && run.selection.run_id === entry.runId);
    const source = run?.sources.find((source: J) => source.slice.source.source_id === entry.sourceId
      && source.slice.source.source_revision === entry.sourceRevision
      && source.suggestion_indices.includes(entry.responseIndex));
    if (!source) return;
    setFocusedSource(source); setCoverageMode("selected");
    coverageRef.current?.focus();
  }
  return <section className="mem-stack mem-history-request" aria-label={t("Saved history comparison")} aria-busy={busy}>
    <h3 className="mem-h3">{t("Compare selected saved batches")}</h3>
    <p className="mem-muted">{t("Read-only review hints. Dates do not choose a current truth. This does not send, approve, apply or supersede.")}</p>
    <div><button type="button" className="mem-button" disabled={busy} onClick={() => void inspect()}>{t("Read comparison")}</button></div>
    {error && <p className="mem-error" role="alert">{error}</p>}
    {view && <div className="mem-stack">
      <p className="mem-muted">Snapshot {view.base.commitId} · {view.batches.length} selected batches · refresh explicitly after changes</p>
      <HistoryBriefPanel vaultId={vaultId} choices={selected} comparison={view} request={request}/>
      {view.topics.length === 0 && <p>{t("No suggestions in the selected saved responses.")}</p>}
      {view.topics.length > 0 && <div className="mem-stack">
        <label className="mem-label" htmlFor={fieldId + "-project"}>{t("Project context")}</label>
        <select id={fieldId + "-project"} className="mem-input" style={{ maxWidth: "100%" }} value={project}
          onChange={e => { setProject(e.target.value); setTopicIndex(""); }}>
          <option value="all">{t("All project contexts")}</option>
          <option value="none">{t("No explicit project")}</option>
          {projects.map(id => <option key={id} value={id}>{id}</option>)}
        </select>
        <label className="mem-label" htmlFor={fieldId + "-topic"}>{t("Exact topic")}</label>
        <select id={fieldId + "-topic"} className="mem-input" style={{ maxWidth: "100%" }} value={topicIndex}
          onChange={e => setTopicIndex(e.target.value)}>
          <option value="">{t("All topics in this project context")}</option>
          {projectTopics.map(({ topic, index }) => <option key={index} value={index}>
            {topic.key.kind} · {topic.key.label} · {t("subjects:")} {topic.key.subjects.join(", ")}
          </option>)}
        </select>
        <p className="mem-muted">Showing {displayedTopics.length} of {view.topics.length} topics. Local display filter only; the brief and source coverage retain all selected responses.</p>
        {displayedTopics.length === 0 && <p>{t("No topics match this local selection. Source coverage remains below.")}</p>}
      </div>}
      {displayedTopics.map(({ topic, index }) => <article className="mem-card mem-stack" key={index}>
        <h4 className="mem-h3">{topic.key.kind} · {topic.key.label}</h4>
        <p className="mem-muted">Subjects: {topic.key.subjects.join(", ")} · project: {topic.key.project ?? "None"}</p>
        <ol className="mem-list">{topic.entries.map((entry: J, i: number) => <li className="mem-stack" key={i}>
          <span className="mem-label">Entry {i + 1} · {entry.application}</span>
          <p className="mem-content">Original proposal: {entry.content}</p>
          <p className="mem-content">Original details: {JSON.stringify(entry.details)}</p>
          <blockquote className="mem-content">{entry.quote}</blockquote>
          <p className="mem-content">Full selected context: {entry.selectedText}</p>
          <p className="mem-muted">Source {entry.sourceId} · r{entry.sourceRevision} · {entry.speakerRole} · {entry.evidenceClass}</p>
          <div><button type="button" className="mem-button" onClick={() => showSource(entry)}>{t("View linked source span")}</button></div>
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
      <section className="mem-stack" aria-label={t("Selected response coverage")} tabIndex={-1} ref={coverageRef}>
        <h4 className="mem-h3">{t("Selected source coverage")}</h4>
        <p className="mem-muted">{view.runs.length} saved responses · {spans.length} span occurrences · {uniqueSpans} unique spans · {uncitedSpans} uncited occurrences · {zeroResponses} zero-suggestion responses</p>
        <p className="mem-muted">{t("Only the selected saved responses are covered. Uncited text and zero suggestions are review gaps, not proof of irrelevance or complete history.")}</p>
        <label className="mem-label" htmlFor={fieldId + "-coverage"}>{t("Source navigation")}</label>
        <select id={fieldId + "-coverage"} className="mem-input" value={coverageMode} onChange={e => { setCoverageMode(e.target.value); setFocusedSource(null); }}>
          <option value="all">{t("All selected source spans")}</option>
          {focusedSource && <option value="selected">{t("Source linked from the chosen suggestion")}</option>}
          <option value="uncited">{t("Uncited spans")}</option>
          <option value="zero">{t("Zero-suggestion responses")}</option>
          <option value="unknown">{t("Unknown source time")}</option>
          <option value="non_user">{t("Non-user evidence")}</option>
        </select>
        {coverageRuns.length === 0 && <p>{t("No selected source spans match this view. This does not describe unselected history.")}</p>}
        <details className="mem-card" open={coverageMode !== "all" || undefined}><summary>{coverageMode === "all" ? "All selected source coverage, including uncited slices" : "Source spans matching the current navigation view"}</summary>
        {coverageRuns.map(({ run, sources }) => <div className="mem-stack" key={run.selection.run_id}>
          <p className="mem-muted">Run {run.selection.run_id} · {run.state} · {run.applied}/{run.suggestions} applied · response {run.response_hash}</p>
          {sources.map((source: J, i: number) => <div className="mem-stack" key={i}>
            <p className="mem-muted">Source {source.slice.source.source_id} · r{source.slice.source.source_revision} · bytes {source.slice.start}–{source.slice.end}
              {" · "}{source.context.speaker_role} · {source.context.evidence_class}
              {t(" · occurred: ")}{source.context.source_context.occurred_at ?? t("Unknown")}
              {t(" · captured: ")}{source.context.source_context.captured_at}
              {t(" · precision: ")}{source.context.source_context.time_precision}
              {t(" · suggestions: ")}{source.suggestion_indices.map((n: number) => n + 1).join(", ") || t("None")}</p>
            <p className="mem-content">{source.context.text}</p>
          </div>)}
        </div>)}
        </details>
      </section>
    </div>}
  </section>;
}
