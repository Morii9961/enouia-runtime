// Recover jobs from the selected Session's saved Core header. Local queue
// application never sends to a model or approves a memory.
import { useEffect, useRef, useState } from "react";
import { call, type J } from "./client";
import { useAction, useLatestRead } from "./hooks";
import { ErrorBox, Tag, shortId } from "./ui";
import { SuggestionPreview } from "./SuggestionPreview";
import { applySavedSuggestions, resumeSavedSuggestions } from "./applySavedSuggestions";
import { suggestionObservation } from "./observationIdentity";

import { t } from '../i18n/index.ts';
export function SavedExtractionJobs({ sessionId, jobs, disabled = false, onBusyChange, onChanged, onReview, request = call }: {
  sessionId: string; jobs: J[] | undefined; disabled?: boolean; request?: typeof call;
  onBusyChange?: (busy: boolean) => void; onChanged?: () => Promise<void>; onReview?: () => void;
}) {
  const [requested, setRequested] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ runId: string; preview: J; current: boolean } | null>(null);
  const [mutation, setMutation] = useState<"apply" | "resume">("apply");
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
    void read.run(async () => suggestionObservation(await request("extraction_preview", { sessionId, runId }), runId),
      (preview) => setLoaded({ runId, preview, current: true }));
  };
  const close = () => { if (writing.current) return; read.clear(); action.clear(); setRequested(null); setLoaded(null); };
  const changeQueue = (kind: "apply" | "resume") => {
    if (disabled || writing.current || read.pending.current || !loaded?.current || loaded.runId !== requested) return;
    const state = loaded.preview.job.state;
    if (state === "completed" || (kind === "resume" ? state !== "paused" : state === "paused")) return;
    const job = { sessionId, runId: loaded.runId };
    const items = loaded.preview.items.length;
    writing.current = true;
    onBusyChange?.(true);
    read.clear();
    setMutation(kind);
    setLoaded({ ...loaded, current: false });
    void action.run(async () => {
      try {
        const preview = kind === "resume"
          ? await resumeSavedSuggestions(request, job, () => mounted.current)
          : await applySavedSuggestions(request, job, items, () => mounted.current);
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
  return <section className="mem-stack" aria-label={t("Saved source suggestions")} aria-busy={read.busy || action.busy}>
    <h3 className="mem-h3">{t("Saved source suggestions")}</h3>
    <p className="mem-muted">{t("Saved suggestion runs from this session, including its other branches. Reading them never sends to a model or approves a memory.")}</p>
    <p className="mem-muted">{t("Adding remaining suggestions only creates local pending candidates. Review them in Memory Vault before they become approved memories.")}</p>
    {!Array.isArray(jobs) ? <p className="mem-muted">{t("Saved suggestion runs have not been read. Refresh the saved session to read them.")}</p>
      : jobs.length === 0 ? <p className="mem-muted">{t("No suggestion runs in this saved session.")}</p>
      : <ul className="mem-list">{jobs.map(job => <li key={job.run_id} className="mem-stack">
        <span title={job.run_id}>{t("Run {id}", { id: shortId(job.run_id) })} · <Tag tone="muted">{job.state}</Tag> · {t("saved progress {n}", { n: job.cursor })}</span>
        <button type="button" className="mem-button" disabled={disabled || action.busy}
          aria-label={t("Read saved suggestions for job {v0}", { v0: shortId(job.run_id) })} onClick={() => observe(job.run_id)}>{t("Read saved suggestions")}</button>
      </li>)}</ul>}
    <ErrorBox error={read.error} />
    <ErrorBox error={action.error} />
    {requested && <div className="mem-stack">
      <p className="mem-muted" title={requested}>Suggestion run {shortId(requested)} · session {shortId(sessionId)}.</p>
      {read.busy && <p className="mem-muted" role="status">{t("Reading saved suggestions…")}</p>}
      {action.busy && <p className="mem-muted" role="status">{mutation === "resume" ? "Resuming the local queue." : "Adding remaining suggestions locally."} Waiting for the saved result…</p>}
      {read.error && <p className="mem-muted">{t("The current saved suggestions could not be read. Read again to observe their saved state.")}</p>}
      {loaded?.runId === requested && !loaded.current && <p className="mem-muted" role="status">{t("Previous suggestion observation. Read saved suggestions again before starting another write.")}</p>}
      {loaded?.runId === requested && <SuggestionPreview preview={loaded.preview} />}
      <div className="mem-actions">
        <button type="button" className="mem-button" disabled={disabled || read.busy || action.busy} onClick={() => observe(requested)}>{t("Read saved suggestions again")}</button>
        {loaded?.runId === requested && loaded.preview.job.state !== "completed" && loaded.preview.job.state !== "paused" && loaded.preview.items.length > 0 &&
          <button type="button" className="mem-button mem-primary" disabled={disabled || read.busy || action.busy || !loaded.current} onClick={() => changeQueue("apply")}>{t("Add remaining suggestions to the review queue")}</button>}
        {loaded?.runId === requested && loaded.preview.job.state === "paused" && <>
          <p className="mem-muted">This local queue is paused. Resuming it does not send to a model or add suggestions; choose whether to add the remaining items after reading its saved state.</p>
          <button type="button" className="mem-button" disabled={disabled || read.busy || action.busy || !loaded.current} onClick={() => changeQueue("resume")}>{t("Resume local queue")}</button>
        </>}
        {onReview && loaded?.runId === requested && loaded.preview.items.some((item: J) => item.candidate?.status === "pending") && <>
          <p className="mem-muted">{t("The inbox contains all pending candidates, including other suggestion runs. Match the candidate ID shown above, then read its source before reviewing.")}</p>
          <button type="button" className="mem-button" disabled={disabled || read.busy || action.busy || !loaded.current}
            onClick={() => { if (!disabled && !writing.current && !read.pending.current && loaded.current) onReview(); }}>{t("Open candidate inbox")}</button></>}
        <button type="button" className="mem-button" disabled={action.busy} onClick={close}>{t("Close saved suggestions")}</button>
      </div>
    </div>}
  </section>;
}
