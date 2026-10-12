// Recover jobs from the selected Session's saved Core header. Local queue
// application never sends to a model or approves a memory.
import { useEffect, useRef, useState } from "react";
import { call, type J } from "./client";
import { useAction, useLatestRead } from "./hooks";
import { ErrorBox, Tag, shortId } from "./ui";
import { SuggestionPreview } from "./SuggestionPreview";
import { applySavedSuggestions } from "./applySavedSuggestions";

export function SavedExtractionJobs({ sessionId, jobs, disabled = false, onBusyChange, onChanged, request = call }: {
  sessionId: string; jobs: J[] | undefined; disabled?: boolean; request?: typeof call;
  onBusyChange?: (busy: boolean) => void; onChanged?: () => Promise<void>;
}) {
  const [requested, setRequested] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ runId: string; preview: J; current: boolean } | null>(null);
  const read = useLatestRead();
  const action = useAction();
  const writing = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; onBusyChange?.(false); };
  }, [onBusyChange]);
  const observe = (runId: string) => {
    if (disabled || writing.current) return;
    action.clear();
    setRequested(runId);
    setLoaded(previous => previous?.runId === runId ? { ...previous, current: false } : null);
    void read.run(() => request("extraction_preview", { sessionId, runId }),
      (preview) => setLoaded({ runId, preview, current: true }));
  };
  const close = () => { if (writing.current) return; read.clear(); action.clear(); setRequested(null); setLoaded(null); };
  const apply = () => {
    if (disabled || writing.current || read.pending.current || !loaded?.current || loaded.runId !== requested) return;
    const job = { sessionId, runId: loaded.runId };
    const items = loaded.preview.items.length;
    writing.current = true;
    onBusyChange?.(true);
    read.clear();
    setLoaded({ ...loaded, current: false });
    void action.run(async () => {
      try {
        const preview = await applySavedSuggestions(request, job, items, () => mounted.current);
        if (preview != null && mounted.current) {
          setLoaded({ runId: job.runId, preview, current: true });
          await onChanged?.();
        }
      } finally {
        writing.current = false;
        if (mounted.current) onBusyChange?.(false);
      }
    });
  };
  return <section className="mem-stack" aria-label="Saved source suggestions" aria-busy={read.busy || action.busy}>
    <h3 className="mem-h3">Saved source suggestions</h3>
    <p className="mem-muted">Saved suggestion runs from this session, including its other branches. Reading them never sends to a model or approves a memory.</p>
    <p className="mem-muted">Adding remaining suggestions only creates local pending candidates. Review them in Memory Vault before they become approved memories.</p>
    {!Array.isArray(jobs) ? <p className="mem-muted">Saved suggestion runs have not been read. Refresh the saved session to read them.</p>
      : jobs.length === 0 ? <p className="mem-muted">No suggestion runs in this saved session.</p>
      : <ul className="mem-list">{jobs.map(job => <li key={job.run_id} className="mem-stack">
        <span title={job.run_id}>Run {shortId(job.run_id)} · <Tag tone="muted">{job.state}</Tag> · saved progress {job.cursor}</span>
        <button type="button" className="mem-button" disabled={disabled || action.busy}
          aria-label={`Read saved suggestions for job ${shortId(job.run_id)}`} onClick={() => observe(job.run_id)}>Read saved suggestions</button>
      </li>)}</ul>}
    <ErrorBox error={read.error} />
    <ErrorBox error={action.error} />
    {requested && <div className="mem-stack">
      <p className="mem-muted" title={requested}>Suggestion run {shortId(requested)} · session {shortId(sessionId)}.</p>
      {read.busy && <p className="mem-muted" role="status">Reading saved suggestions…</p>}
      {action.busy && <p className="mem-muted" role="status">Adding remaining suggestions locally. Waiting for the saved result…</p>}
      {read.error && <p className="mem-muted">The current saved suggestions could not be read. Read again to observe their saved state.</p>}
      {loaded?.runId === requested && !loaded.current && <p className="mem-muted" role="status">Previous suggestion observation. Read saved suggestions again before starting another write.</p>}
      {loaded?.runId === requested && <SuggestionPreview preview={loaded.preview} />}
      <div className="mem-actions">
        <button type="button" className="mem-button" disabled={disabled || read.busy || action.busy} onClick={() => observe(requested)}>Read saved suggestions again</button>
        {loaded?.runId === requested && loaded.preview.job.state !== "completed" && loaded.preview.job.state !== "paused" && loaded.preview.items.length > 0 &&
          <button type="button" className="mem-button mem-primary" disabled={disabled || read.busy || action.busy || !loaded.current} onClick={apply}>Add remaining suggestions to the review queue</button>}
        <button type="button" className="mem-button" disabled={action.busy} onClick={close}>Close saved suggestions</button>
      </div>
    </div>}
  </section>;
}
