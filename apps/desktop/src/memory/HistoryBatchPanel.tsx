import { useEffect, useId, useRef, useState } from "react";
import { call, CallError, describe, retryable, type J } from "./client";
import { batchPreparationObservation, batchProviderSignature, prepareHistoryBatch, type BatchArgs, type HistoryBatchOwner } from "./historyBatch";
import { historyTaskObservation } from "./historyTasks";
import { holdProviderSend } from "./providerSend";
import { Operation, OperationFeedback } from "./ui";

type Held = { token: string; signature: string; args: BatchArgs; send: ReturnType<typeof holdProviderSend>; expires: number };
export function HistoryBatchPanel({ vaultId, task, index, owner, request = call }: {
  vaultId: string; task: J; index: number | null; owner: HistoryBatchOwner; request?: typeof call;
}) {
  const [observedStatus, setStatus] = useState<J>(null), [held, setHeld] = useState<Held | null>(null);
  const [, renderDraft] = useState(0);
  const { policy, output } = task && index !== null ? owner.draft(vaultId, task.taskId, index) : { policy: "", output: "1024" };
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null), [confirmed, setConfirmed] = useState(false);
  const [operation, setOperation] = useState<{ token: string; id: string } | null>(null), [completion, setCompletion] = useState<J>(null);
  const [canRecoverSend, setCanRecoverSend] = useState(false);
  const [mustReread, setMustReread] = useState<J>(null);
  const mounted = useRef(false), pending = useRef(false), statusRef = useRef<J>(null);
  const fieldId = useId();
  const batch = task?.batches.find((b: J) => b.batchIndex === index);
  const token = JSON.stringify([vaultId, task?.taskId, index, batch?.sessionId, batch?.runId, batch?.state,
    batch?.invocationState, task?.request.api, task?.request.model, policy, output]);
  const current = useRef({ token, generation: 0 });
  if (current.current.token !== token) current.current = { token, generation: current.current.generation + 1 };
  const generation = current.current.generation;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    setHeld(null); setConfirmed(false); setCompletion(null); setError(null); setNotice(null); setCanRecoverSend(false);
  }, [token]);

  // Observe configuration changes without reloading settings or touching keys.
  useEffect(() => {
    if (!task || index === null) return;
    setStatus(null);
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await request("provider_status");
        batchProviderSignature(next);
        if (!stopped) {
          if (statusRef.current && batchProviderSignature(statusRef.current) !== batchProviderSignature(next)) {
            setHeld(null); setConfirmed(false); setNotice("Provider settings or grants changed. Read the saved task and inspect a fresh request.");
          }
          statusRef.current = next; setStatus(next);
        }
      } catch (err) {
        if (!stopped) { statusRef.current = null; setStatus(null); setHeld(null); setConfirmed(false); setError(describe(err)); }
      }
      if (!stopped) timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); statusRef.current = null; };
  }, [request, task?.taskId, index]); // A local Context commit must not restart this owner.

  const status = observedStatus === statusRef.current ? observedStatus : null;
  const signature = status ? batchProviderSignature(status) : "";
  const shown = held?.token === token && held.signature === signature ? held : null;
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => {
      setHeld(null); setConfirmed(false); setNotice("The request handle expired. Read saved state before recovering preparation; a new handle needs a new inspection.");
    }, Math.max(0, shown.expires - Date.now()));
    return () => clearTimeout(timer);
  }, [shown]);
  if (!task || index === null) return null;
  const destination = status?.destinations.find((d: J) => d.api === task.request.api && d.model === task.request.model);
  const grants = status?.grants.filter((g: J) => g.active && g.purposes.includes("extraction")
    && g.destinations.some((d: J) => d.provider === task.request.api && d.model === task.request.model)) ?? [];
  const tokens = /^\d+$/.test(output) ? Number(output) : NaN;
  const permitted = status?.configured && destination && grants.some((g: J) => g.policyId === policy);
  const invoked = owner.wasSubmitted(vaultId, task.taskId, index) || batch?.invocationState !== null;
  const eligible = batch?.state === "ready" && !invoked && task !== mustReread;
  const valid = Number.isSafeInteger(tokens) && tokens >= 1 && tokens <= Math.min(32768, destination?.maxOutputTokens ?? 32768);
  const running = operation?.token === token ? operation : null;
  const publishable = (identity: string) => mounted.current && current.current.token === identity && current.current.generation === generation;

  const prepare = async () => {
    if (pending.current || !eligible || !permitted || !valid || running) return;
    pending.current = true; setBusy(true); setHeld(null); setConfirmed(false); setError(null); setNotice(null); setCompletion(null);
    const args: BatchArgs = { taskId: task.taskId, batchIndex: index, policyId: policy, outputTokens: tokens };
    try {
      const startedAt = Date.now();
      const result = await prepareHistoryBatch(owner, vaultId, args, request);
      if (!publishable(token)) return;
      batchPreparationObservation(result, task, args);
      // Conservative TTL includes delivery time. Core checks its own TTL again.
      if (startedAt + result.expiresInMs <= Date.now()) throw new Error("expired preparation delivery");
      if (signature !== batchProviderSignature(statusRef.current)) return;
      setHeld({ token, signature, args, send: holdProviderSend(result, request), expires: startedAt + result.expiresInMs });
    } catch (err) {
      if (publishable(token)) {
        setError(describe(err));
        if (err instanceof CallError && !err.error.retryable) setMustReread(task);
        setNotice("Preparation is not confirmed here. Read the saved task, then recover only these exact arguments with their original key. Do not create another task.");
      }
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const send = async () => {
    if (pending.current || !shown || !confirmed || Date.now() >= shown.expires || running
      || (shown.send.submitted() && !canRecoverSend)) return;
    pending.current = true; setBusy(true); setError(null);
    const recovering = shown.send.submitted();
    try {
      const next = await request("provider_status");
      if (!publishable(token)) return;
      if (batchProviderSignature(next) !== shown.signature) {
        statusRef.current = next; setStatus(next); setHeld(null); setConfirmed(false);
        setNotice("Provider settings or grants changed. Inspect a fresh request before sending."); return;
      }
      if (!shown.send.submitted()) {
        const fresh = historyTaskObservation(await request("history_task_get", { taskId: task.taskId }), { vaultId, taskId: task.taskId, request: task.request });
        if (!publishable(token)) return;
        const child = fresh.batches.find((b: J) => b.batchIndex === index);
        if (!child || child.sessionId !== batch.sessionId || child.runId !== batch.runId || child.state !== "ready" || child.invocationState !== null) {
          setHeld(null); setConfirmed(false); setNotice("The saved batch changed or already has an invocation. Read its saved outcome; do not resend."); return;
        }
      }
      if (!publishable(token) || Date.now() >= shown.expires || batchProviderSignature(statusRef.current) !== shown.signature) return;
      owner.markSubmitted(vaultId, shown.args);
      const started = await shown.send.send();
      if (publishable(token)) { setHeld(null); setConfirmed(false); setOperation({ token, id: started.operationId }); }
    } catch (err) {
      if (publishable(token)) {
        if (!shown.send.submitted()) {
          setHeld(null); setConfirmed(false); setMustReread(task); setError(describe(err));
          setNotice("Saved state could not be confirmed. Read the task again before preparing and inspecting another request."); return;
        }
        setError(describe(err)); setCanRecoverSend(retryable(err) || !(err instanceof CallError));
        setNotice("Send outcome is not confirmed. The service may have received it. Recover only this same call, or read the saved task and workspace calls in Sessions.");
        if (err instanceof CallError && !err.error.retryable) {
          setHeld(null); setConfirmed(false); setMustReread(task);
          // These exact Core refusals occur before approval/invocation admission.
          // An uncertain prior send must never use this escape hatch.
          if (!recovering && err.error.rules.some(rule => ["provider.call_unknown", "provider.call_expired"].includes(rule))) {
            owner.forgetRefusedHandle(vaultId, shown.args);
            setNotice("Memory refused the unavailable request handle before sending. Read this saved task again, then recover its original preparation and inspect the new handle.");
          }
        }
      }
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const changeDraft = (draft: { policy: string; output: string }) => { owner.setDraft(vaultId, task.taskId, index, draft); renderDraft(n => n + 1); };
  return <section className="mem-card mem-stack mem-history-request" aria-label="Saved batch request">
    <h4 className="mem-h3">Batch {index + 1} request</h4>
    <p className="mem-mono">{task.taskId} · {batch?.sessionId ?? "missing child"} · {batch?.runId ?? "missing run"}</p>
    <p className="mem-muted">{task.request.api} · {task.request.model}. Preparing may save local Context. It does not read credentials, send a request or approve memories.</p>
    {!batch && <p role="status">Explicitly resume missing local jobs before preparing this batch.</p>}
    {batch && (batch.state !== "ready" || invoked) && <p role="status">This batch is paused, completed or has an existing/submitted invocation. Read its saved outcome before continuing. It cannot be resent by preparing again.</p>}
    {task === mustReread && <p role="status">Read this history task again before another preparation.</p>}
    {!status && <p role="status">Provider status is unavailable or being read. Request controls wait for a current observation.</p>}
    {status && !destination && <p role="status">Restore the saved task's exact configured model, then read the task again.</p>}
    {status && !grants.length && <p role="status">An active extraction grant for the saved model is required. Review grants in Sessions.</p>}
    <label className="mem-label" htmlFor={`${fieldId}-policy`}>Egress grant</label>
    <select id={`${fieldId}-policy`} className="mem-input" value={policy} disabled={busy || !!shown || !!running} onChange={e => changeDraft({ policy: e.target.value, output })}>
      <option value="">Choose a grant</option>{grants.map((g: J) => <option key={g.policyId} value={g.policyId}>{g.policyId} · {g.maxSensitivity}</option>)}
    </select>
    <label className="mem-label" htmlFor={`${fieldId}-tokens`}>Output token ceiling (1–32768)</label>
    <input id={`${fieldId}-tokens`} className="mem-input" inputMode="numeric" autoComplete="off" value={output} disabled={busy || !!shown || !!running} onChange={e => changeDraft({ policy, output: e.target.value })} />
    {error && <p role="alert" className="mem-error">{error}</p>}
    {notice && <p role="status" className="mem-muted">{notice}</p>}
    {busy && <p role="status">Waiting for the batch request receipt…</p>}
    {!shown && <button type="button" className="mem-button" disabled={busy || !eligible || !permitted || !valid || !!running} onClick={() => void prepare()}>Prepare or recover this batch request</button>}
    {shown && <div role="group" aria-label="Exact history request" className="mem-stack">
      <p>Destination: <span className="mem-mono">{shown.send.prepared.endpoint}</span> · {shown.send.prepared.model} · about {shown.send.prepared.estimatedInputTokens} input tokens · at most {shown.send.prepared.outputTokens} output tokens.</p>
      <p className="mem-mono">Call {shown.send.prepared.callId} · SHA-256 {shown.send.prepared.wireHash}</p>
      <p className="mem-muted">Request body is source data. Review this handle again after every recovery.</p>
      <pre className="mem-pre" tabIndex={0}>{shown.send.prepared.body}</pre>
      <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} /> I inspected this exact body, destination, model and hash.</label>
      <button type="button" className="mem-button mem-primary" disabled={busy || !confirmed || (shown.send.submitted() && !canRecoverSend)} onClick={() => void send()}>{shown.send.submitted() ? "Recover this batch call" : "Send this batch once"}</button>
      <button type="button" className="mem-button" disabled={busy} onClick={() => { setHeld(null); setConfirmed(false); setNotice("Request withdrawn. Read saved state before preparing again."); }}>Withdraw batch request</button>
    </div>}
    {running && <Operation id={running.id} kind="external_send" request={request} onDone={result => {
      if (publishable(running.token)) { setOperation(null); setCompletion(result); }
    }} />}
    {completion && <><OperationFeedback status={completion} onCancel={() => {}} /><p className="mem-muted">Read this history task again for its saved outcome. Suggestions, queueing and human review are separate steps.</p></>}
  </section>;
}
