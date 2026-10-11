// Optional model suggestions from one shown source range (Enouia Memory
// ADR-MEM-48, MV-7.4). The owner reads the exact request before it is sent
// once, then each suggestion with its quote and complete selected text.
// Adding suggestions only queues pending candidates for ordinary review;
// none becomes a memory here.
import { useEffect, useState } from "react";
import { call, type J } from "./client";
import { useAction, useLatestRead } from "./hooks";
import { ErrorBox, Operation, Tag } from "./ui";

type Range = { sourceId: string; revision: number; start: number; end: number };

export function ExtractionPanel({ range, onClose, request = call }: { range: Range; onClose: () => void; request?: typeof call }) {
  const [status, setStatus] = useState<J>(null);
  const [api, setApi] = useState("");
  const [prepared, setPrepared] = useState<J>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [job, setJob] = useState<{ sessionId: string; runId: string } | null>(null);
  const [preview, setPreview] = useState<J>(null);
  const action = useAction();
  const read = useLatestRead();
  useEffect(() => {
    void read.run(() => request("provider_status"), (s) => {
      setStatus(s);
      setApi(s.destinations[0]?.api ?? "");
    });
  }, [read.run, request]);

  if (read.error) return <ErrorBox error={read.error} />;
  if (!status) return <p role="status" className="mem-muted">Reading provider setup…</p>;
  const destination = status.destinations.find((d: J) => d.api === api);
  const grant = (status.grants ?? []).find((g: J) => g.active && g.purposes.includes("extraction")
    && g.destinations.some((d: J) => d.provider === api && d.model === destination?.model));
  const showPreview = (j: { sessionId: string; runId: string }) =>
    action.run(async () => setPreview(await request("extraction_preview", j)));
  const close = <button type="button" className="mem-button" onClick={onClose}>Close</button>;

  if (!status.configured || !grant) {
    return (
      <div className="mem-stack" role="group" aria-label="Suggest memories">
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
        setOperation(null);
        if (s.state === "succeeded" && job) void showPreview(job);
      }} />}
      {preview && job && (
        <>
          <p className="mem-muted">{preview.items.length} suggestion{preview.items.length === 1 ? "" : "s"}. Each quote is checked against the source; that does not make the suggestion true.</p>
          <ul className="mem-list">
            {preview.items.map((i: J) => (
              <li key={i.responseIndex} className="mem-stack">
                <span><Tag>{i.proposedType}</Tag> {i.content}</span>
                <span className="mem-muted">Quote: “{i.quote}”</span>
                <span className="mem-muted">In: {i.selectedText}</span>
                {i.candidate && <span><Tag tone="ok">{i.candidate.status}</Tag> in the review queue</span>}
              </li>
            ))}
          </ul>
          <div className="mem-actions">
            {preview.job.state !== "completed" && preview.items.length > 0 && (
              <button type="button" className="mem-button mem-primary" disabled={action.busy}
                onClick={() => void action.run(async () => {
                  // One suggestion per call; each call is a separate keyed write.
                  for (let n = 0; n <= preview.items.length; n += 1) {
                    const applied = await request("extraction_apply", job);
                    if (applied.job.state === "completed") break;
                  }
                  setPreview(await request("extraction_preview", job));
                })}>Add to the review queue</button>
            )}
            {close}
          </div>
        </>
      )}
    </div>
  );
}
