// Read jobs from the selected Session's saved Core header. No model request,
// private recovery cache, candidate application or approval is offered here.
import { useState } from "react";
import { call, type J } from "./client";
import { useLatestRead } from "./hooks";
import { ErrorBox, Tag, shortId } from "./ui";
import { SuggestionPreview } from "./SuggestionPreview";

export function SavedExtractionJobs({ sessionId, jobs, disabled = false, request = call }: {
  sessionId: string; jobs: J[] | undefined; disabled?: boolean; request?: typeof call;
}) {
  const [requested, setRequested] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ runId: string; preview: J } | null>(null);
  const read = useLatestRead();
  const observe = (runId: string) => {
    if (disabled) return;
    setRequested(runId);
    setLoaded(null);
    void read.run(() => request("extraction_preview", { sessionId, runId }),
      (preview) => setLoaded({ runId, preview }));
  };
  const close = () => { read.clear(); setRequested(null); setLoaded(null); };
  return <section className="mem-stack" aria-label="Saved source suggestions" aria-busy={read.busy}>
    <h3 className="mem-h3">Saved source suggestions</h3>
    <p className="mem-muted">Saved suggestion runs from this session, including its other branches. Reading them never sends to a model or approves a memory.</p>
    {!Array.isArray(jobs) ? <p className="mem-muted">Saved suggestion runs have not been read. Refresh the saved session to read them.</p>
      : jobs.length === 0 ? <p className="mem-muted">No suggestion runs in this saved session.</p>
      : <ul className="mem-list">{jobs.map(job => <li key={job.run_id} className="mem-stack">
        <span title={job.run_id}>Run {shortId(job.run_id)} · <Tag tone="muted">{job.state}</Tag> · saved progress {job.cursor}</span>
        <button type="button" className="mem-button" disabled={disabled}
          aria-label={`Read saved suggestions for job ${shortId(job.run_id)}`} onClick={() => observe(job.run_id)}>Read saved suggestions</button>
      </li>)}</ul>}
    <ErrorBox error={read.error} />
    {requested && <div className="mem-stack">
      <p className="mem-muted" title={requested}>Suggestion run {shortId(requested)} · session {shortId(sessionId)}.</p>
      {read.busy && <p className="mem-muted" role="status">Reading saved suggestions…</p>}
      {read.error && <p className="mem-muted">This job's suggestions have not been read. Read again to observe their saved state.</p>}
      {loaded?.runId === requested && <SuggestionPreview preview={loaded.preview} />}
      <div className="mem-actions">
        <button type="button" className="mem-button" disabled={disabled || read.busy} onClick={() => observe(requested)}>Read saved suggestions again</button>
        <button type="button" className="mem-button" onClick={close}>Close saved suggestions</button>
      </div>
    </div>}
  </section>;
}
