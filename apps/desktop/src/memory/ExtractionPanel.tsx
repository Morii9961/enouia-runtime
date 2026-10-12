// Optional model suggestions from one shown source range (Enouia Memory
// ADR-MEM-48, MV-7.4). The owner reads the exact request before it is sent
// once, then each suggestion with its quote and complete selected text.
// Adding suggestions only queues pending candidates for ordinary review;
// none becomes a memory here.
import { useEffect, useId, useState } from "react";
import { CallError, call, type J } from "./client";
import { useAction, useLatestRead } from "./hooks";
import { ErrorBox, Operation, OperationFeedback, Tag, shortId } from "./ui";

type Range = { sourceId: string; revision: number; start: number; end: number };

export function ExtractionPanel({ range, onClose, onBusyChange, request = call }: { range: Range; onClose: () => void; onBusyChange?: (busy: boolean) => void; request?: typeof call }) {
  const [status, setStatus] = useState<J>(null);
  const [api, setApi] = useState("");
  const providerId = useId();
  const [prepared, setPrepared] = useState<J>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [completion, setCompletion] = useState<J>(null);
  const [job, setJob] = useState<{ sessionId: string; runId: string } | null>(null);
  const [preview, setPreview] = useState<J>(null);
  const [previewCurrent, setPreviewCurrent] = useState(false);
  const action = useAction();
  const read = useLatestRead();
  const owningWork = action.busy || operation != null;
  useEffect(() => {
    onBusyChange?.(owningWork);
    return () => onBusyChange?.(false);
  }, [owningWork, onBusyChange]);
  useEffect(() => {
    void read.run(() => request("provider_status"), (s) => {
      setStatus(s);
      setApi(s.destinations[0]?.api ?? "");
    });
  }, [read.run, request]);

  if (read.error) return <div className="mem-stack"><ErrorBox error={read.error} /><button type="button" className="mem-button" onClick={onClose}>Close</button></div>;
  if (!status) return <p role="status" className="mem-muted">Reading provider setup…</p>;
  const destination = status.destinations.find((d: J) => d.api === api);
  const grant = (status.grants ?? []).find((g: J) => g.active && g.purposes.includes("extraction")
    && g.destinations.some((d: J) => d.provider === api && d.model === destination?.model));
  const showPreview = (j: { sessionId: string; runId: string }) =>
    action.run(async () => {
      setPreviewCurrent(false);
      setPreview(await request("extraction_preview", j));
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
        <div className="mem-actions">{close}</div>
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
              onClick={() => void action.run(async (key) => setPrepared(await request("extraction_prepare", {
                sourceId: range.sourceId, sourceRevision: range.revision, startByte: range.start, endByte: range.end,
                api, policyId: grant.policyId, maxCandidates: 8,
              }, key)))}>Prepare the request…</button>
            {close}
          </div>
        </>
      )}
      {prepared && (
        <>
          <p>This exact request goes to <span className="mem-mono">{prepared.endpoint}</span> ({prepared.model}), about {prepared.estimatedInputTokens} input tokens. It is sent once and never retried.</p>
          <pre className="mem-pre" tabIndex={0}>{prepared.body}</pre>
          <div className="mem-actions">
            <button type="button" className="mem-button mem-primary" disabled={action.busy}
              onClick={() => void action.run(async (key) => {
                const started = await request("external_send", { callId: prepared.callId, wireHash: prepared.wireHash }, key);
                setJob({ sessionId: prepared.sessionId, runId: prepared.runId });
                setPrepared(null);
                setOperation(started.operationId);
              })}>Send once</button>
            <button type="button" className="mem-button" disabled={action.busy} onClick={onClose}>Don't send</button>
          </div>
        </>
      )}
      {operation && <Operation id={operation} request={request} onDone={(s) => {
        setCompletion(s);
        setOperation(null);
        if (s.state === "succeeded" && job) void showPreview(job);
      }} />}
      {completion && <OperationFeedback status={completion} onCancel={() => {}} />}
      {job && !operation && !preview && <div className="mem-actions">
        <button type="button" className="mem-button" disabled={action.busy} onClick={() => void showPreview(job)}>Read saved suggestions</button>
        {close}
      </div>}
      {preview && job && (
        <>
          {!previewCurrent && <p role="status" className="mem-muted">Previous suggestion observation. Read saved suggestions again to check which items reached the review queue before starting another write.</p>}
          <p className="mem-muted">{preview.items.length} suggestion{preview.items.length === 1 ? "" : "s"}. Each quote is checked against the source; that does not make the suggestion true.</p>
          <ul className="mem-list">
            {preview.items.map((i: J) => (
              <li key={i.responseIndex} className="mem-stack">
                <span><Tag>{i.proposedType}</Tag> {i.content}</span>
                <span className="mem-muted">Quote: “{i.quote}”</span>
                <span className="mem-muted">In: {i.selectedText}</span>
                {i.candidate && <div className="mem-stack">
                  <span><Tag tone={i.candidate.status === "pending" ? "warn" : "muted"}>{i.candidate.status}</Tag> candidate · {shortId(i.candidate.candidateId)} · r{i.candidate.revision}</span>
                  {i.candidate.content !== i.content && <span className="mem-muted">Current candidate: {i.candidate.content}</span>}
                </div>}
                {!i.candidate && i.application === "suppressed" && <span className="mem-muted">No candidate recorded for this suggestion.</span>}
              </li>
            ))}
          </ul>
          <div className="mem-actions">
            <button type="button" className="mem-button" disabled={action.busy} onClick={() => void showPreview(job)}>Refresh saved suggestions</button>
            {preview.job.state !== "completed" && preview.items.length > 0 && (
              <button type="button" className="mem-button mem-primary" disabled={action.busy || !previewCurrent}
                onClick={() => {
                  void action.run(async () => {
                    setPreviewCurrent(false);
                    try {
                      // Core advances the saved cursor, not a page-keyed
                      // receipt. After ambiguity, read it before another batch.
                      for (let n = 0; n <= preview.items.length; n += 1) {
                        const applied = await request("extraction_apply", job);
                        if (applied.job.state === "completed") break;
                      }
                      setPreview(await request("extraction_preview", job));
                      setPreviewCurrent(true);
                    } catch (err) {
                      // Keep the Core's explanation, but do not offer a blind
                      // replay of a loop whose previous step may have committed.
                      if (err instanceof CallError) throw new CallError({ ...err.error, retryable: false });
                      throw err;
                    }
                  });
                }}>Add to the review queue</button>
            )}
            {close}
          </div>
        </>
      )}
    </div>
  );
}
