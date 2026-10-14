// Optional model suggestions from one shown source range (Enouia Memory
// ADR-MEM-48, MV-7.4). The owner reads the exact request before it is sent
// once, then each suggestion with its quote and complete selected text.
// Adding suggestions only queues pending candidates for ordinary review;
// none becomes a memory here.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { call, type J } from "./client";
import { useAction, useLatestRead } from "./hooks";
import { ErrorBox, Operation, OperationFeedback, shortId } from "./ui";
import { SuggestionPreview } from "./SuggestionPreview";
import { applySavedSuggestions, resumeSavedSuggestions } from "./applySavedSuggestions";
import { suggestionObservation } from "./observationIdentity";
import { holdProviderSend } from "./providerSend";

type Range = { sourceId: string; revision: number; start: number; end: number };

export function ExtractionPanel({ range, onClose, onBusyChange, request = call }: { range: Range; onClose: () => void; onBusyChange?: (busy: boolean) => void; request?: typeof call }) {
  const [status, setStatus] = useState<J>(null);
  const [api, setApi] = useState("");
  const providerId = useId();
  const [heldSend, setPrepared] = useState<ReturnType<typeof holdProviderSend> | null>(null);
  const prepared = heldSend?.prepared;
  const submitted = heldSend?.submitted() ?? false;
  const [operation, setOperation] = useState<string | null>(null);
  const [completion, setCompletion] = useState<J>(null);
  const [job, setJob] = useState<{ sessionId: string; runId: string } | null>(null);
  const [preview, setPreview] = useState<J>(null);
  const [previewCurrent, setPreviewCurrent] = useState(false);
  const action = useAction();
  const read = useLatestRead();
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const owningWork = action.busy || operation != null || submitted;
  useEffect(() => {
    onBusyChange?.(owningWork);
    return () => onBusyChange?.(false);
  }, [owningWork, onBusyChange]);
  const readSetup = useCallback(() => {
    setStatus(null);
    return read.run(() => request("provider_status"), (s) => {
      setStatus(s);
      setApi(current => s.destinations.some((d: J) => d.api === current) ? current : s.destinations[0]?.api ?? "");
    });
  }, [read.run, request]);
  useEffect(() => { void readSetup(); }, [readSetup]);
  const setupRecovery = !prepared && !operation && !job && <button type="button" className="mem-button" disabled={read.busy || action.busy}
    onClick={() => { if (!read.pending.current && !action.busy) void readSetup(); }}>Read provider status again</button>;

  if (read.error) return <div className="mem-stack"><ErrorBox error={read.error} />
    <p className="mem-muted">Provider status could not be read. Read it again before preparing a request. This does not reload settings, change a grant or send to a model.</p>
    <div className="mem-actions">{setupRecovery}<button type="button" className="mem-button" onClick={onClose}>Close</button></div></div>;
  if (!status) return <p role="status" className="mem-muted">Reading provider setup…</p>;
  const destination = status.destinations.find((d: J) => d.api === api);
  const grant = (status.grants ?? []).find((g: J) => g.active && g.purposes.includes("extraction")
    && g.destinations.some((d: J) => d.provider === api && d.model === destination?.model));
  const showPreview = (j: { sessionId: string; runId: string }) =>
    action.run(async () => {
      setPreviewCurrent(false);
      setPreview(suggestionObservation(await request("extraction_preview", j), j.runId));
      setPreviewCurrent(true);
    });
  const close = <button type="button" className="mem-button" disabled={action.busy || operation != null} onClick={onClose}>Close</button>;
  const choiceHeld = owningWork || prepared != null || job != null;
  const providerChoice = status.configured && status.destinations.length > 0 && <>
    <label className="mem-label" htmlFor={providerId}>Model for suggestions</label>
    <select id={providerId} className="mem-input" value={api} disabled={choiceHeld}
      onChange={(e) => { if (!choiceHeld) setApi(e.target.value); }}>
      {status.destinations.map((d: J) => <option key={d.api} value={d.api}>{d.api} · {d.model}</option>)}
    </select>
    {choiceHeld && <p className="mem-muted">This suggestion flow keeps its selected model. Close it after work finishes to choose another model.</p>}
  </>;

  if (!status.configured || !grant) {
    return (
      <div className="mem-stack" role="group" aria-label="Suggest memories">
        {providerChoice}
        <p className="mem-muted">{!status.configured
          ? "External providers are off on this computer."
          : "No grant allows extraction for this provider. Review a grant with extraction allowed in a session's External provider panel first."}</p>
        <div className="mem-actions">{setupRecovery}{close}</div>
      </div>
    );
  }
  return (
    <div className="mem-stack" role="group" aria-label="Suggest memories">
      <ErrorBox error={action.error} />
      {providerChoice}
      {!prepared && !operation && !job && (
        <>
          <p className="mem-muted">Ask {api} ({destination.model}) to suggest facts from bytes {range.start}–{range.end} of this source. You see the exact request first; suggestions only enter the review queue.</p>
          <div className="mem-actions">
            <button type="button" className="mem-button mem-primary" disabled={action.busy}
              onClick={() => void action.run(async (key) => setPrepared(holdProviderSend(await request("extraction_prepare", {
                sourceId: range.sourceId, sourceRevision: range.revision, startByte: range.start, endByte: range.end,
                api, policyId: grant.policyId, maxCandidates: 8,
              }, key), request)))}>Prepare the request…</button>
            {close}
          </div>
        </>
      )}
      {prepared && (
        <>
          <p>This exact request goes to <span className="mem-mono">{prepared.endpoint}</span> ({prepared.model}), about {prepared.estimatedInputTokens} input tokens. It is sent once. Retry recovers this same call without sending again to the service.</p>
          <pre className="mem-pre" tabIndex={0}>{prepared.body}</pre>
          {submitted && <p role="status" className="mem-muted">Send was submitted. The service may have received it. Recover this call, or leave and read this saved run from Sessions.</p>}
          <div className="mem-actions">
            <button type="button" className="mem-button mem-primary" disabled={action.busy || (submitted && !!action.error && !action.error.retry)}
              onClick={() => void action.run(async () => {
                setJob({ sessionId: prepared.sessionId, runId: prepared.runId });
                const started = await heldSend!.send();
                setPrepared(null);
                setOperation(started.operationId);
              })}>{submitted ? "Recover this call" : "Send once"}</button>
            <button type="button" className="mem-button" disabled={action.busy} onClick={onClose}>{submitted ? "Leave this request" : "Don't send"}</button>
          </div>
        </>
      )}
      {job && <p className="mem-muted" title={`${job.sessionId} · ${job.runId}`}>
        Suggestion session {shortId(job.sessionId)} · run {shortId(job.runId)}. After leaving this page, read this saved run from Sessions.
      </p>}
      {operation && <Operation id={operation} kind="external_send" request={request} onDone={(s) => {
        setCompletion(s);
        setOperation(null);
        if (s.state === "succeeded" && job) void showPreview(job);
      }} />}
      {completion && <OperationFeedback status={completion} onCancel={() => {}} />}
      {job && !prepared && !operation && !preview && <div className="mem-actions">
        <button type="button" className="mem-button" disabled={action.busy} onClick={() => void showPreview(job)}>Read saved suggestions</button>
        {close}
      </div>}
      {preview && job && !prepared && (
        <>
          {!previewCurrent && <p role="status" className="mem-muted">Previous suggestion observation. Read saved suggestions again to check which items reached the review queue before starting another write.</p>}
          <SuggestionPreview preview={preview} />
          <div className="mem-actions">
            <button type="button" className="mem-button" disabled={action.busy} onClick={() => void showPreview(job)}>Refresh saved suggestions</button>
            {preview.job.state !== "completed" && preview.job.state !== "paused" && preview.items.length > 0 && (
              <button type="button" className="mem-button mem-primary" disabled={action.busy || !previewCurrent}
                onClick={() => {
                  void action.run(async () => {
                    setPreviewCurrent(false);
                    const next = await applySavedSuggestions(request, job, preview.items.length, () => mounted.current);
                    if (next != null) { setPreview(next); setPreviewCurrent(true); }
                  });
                }}>Add to the review queue</button>
            )}
            {preview.job.state === "paused" && <>
              <p className="mem-muted">This local queue is paused. Resuming it does not send to a model or add suggestions; choose whether to add the remaining items after reading its saved state.</p>
              <button type="button" className="mem-button" disabled={action.busy || !previewCurrent}
                onClick={() => {
                  if (action.busy || !previewCurrent) return;
                  void action.run(async () => {
                    setPreviewCurrent(false);
                    const next = await resumeSavedSuggestions(request, job, () => mounted.current);
                    if (next != null) { setPreview(next); setPreviewCurrent(true); }
                  });
                }}>Resume local queue</button>
            </>}
            {close}
          </div>
        </>
      )}
    </div>
  );
}
