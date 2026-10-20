// The Import owner outlives head-bound previews. Requests and keys remain
// in memory only; saved task discovery belongs to the pinned Core.
import { useCallback, useEffect, useRef, useState } from "react";
import { CallError, call, describe, newKey, type J } from "./client";
import { useLatestRead } from "./hooks";
import { historyTaskListObservation, historyTaskObservation, validHistoryTaskRequest, type HistoryTaskRequest } from "./historyTasks";
import { operationListObservation } from "./observationIdentity";
import { ErrorBox, Operation, shortId, when } from "./ui";

type Attempt = { command: "history_materialize" | "history_resume"; args: HistoryTaskRequest | { taskId: string }; key: string };
export function useHistoryTasks(vaultId: string, request = call) {
  const [page, setPage] = useState<J>(null), [detail, setDetail] = useState<J>(null);
  const [operations, setOperations] = useState<J[] | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null), [waiting, setWaiting] = useState(false);
  const [operation, setOperation] = useState<{ id: string; kind: string; attempt: Attempt } | null>(null);
  const [error, setError] = useState<string | null>(null), [note, setNote] = useState<string | null>(null);
  const list = useLatestRead(), read = useLatestRead(), mounted = useRef(false), pending = useRef(false);
  const finished = useRef(new Set<string>());
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = useCallback((cursor: string | null = null) => {
    if (pending.current || list.pending.current) return;
    setPage(null); setOperations(null);
    void list.run(async () => {
      const [tasks, ops] = await Promise.all([request("history_task_list", { cursor, limit: 10 }), request("operation_list")]);
      return { tasks: historyTaskListObservation(tasks, vaultId, 10), ops: operationListObservation(ops).items.filter((op: J) =>
        ["history_materialize", "history_resume"].includes(op.kind) && ["queued", "running"].includes(op.state)) };
    }, result => { setPage(result.tasks); setOperations(result.ops.filter((op: J) => !finished.current.has(op.operationId))); });
  }, [request, vaultId, list.run, list.pending]);
  useEffect(() => { refresh(); }, [refresh]);
  const active = !!operation || !!operations?.length;
  const busy = waiting || active;
  const ready = page !== null && operations !== null && !list.busy && !list.error && !attempt && !busy;
  const observe = (taskId: string) => {
    if (pending.current || active || read.pending.current) return;
    setDetail(null);
    void read.run(async () => historyTaskObservation(await request("history_task_get", { taskId }), { vaultId, taskId }), setDetail);
  };
  const execute = async (submission: Attempt) => {
    if (pending.current || active) return;
    pending.current = true; setWaiting(true); setError(null); setNote(null); setDetail(null); read.clear();
    let refused = false;
    try {
      const started = await request(submission.command, submission.args, submission.key);
      if (!mounted.current) return;
      if (typeof started?.operationId !== "string" || !started.operationId) throw new Error("history operation identity mismatch");
      setOperation({ id: started.operationId, kind: submission.command, attempt: submission });
    } catch (err) {
      if (mounted.current) {
        setError(describe(err));
        // A typed final refusal differs from an uncertain/lost receipt.
        refused = err instanceof CallError && !err.error.retryable;
        if (refused) { setAttempt(null); setNote("Memory refused this submission. Read a fresh plan and saved tasks before another action."); }
      }
    }
    finally { pending.current = false; if (mounted.current) { setWaiting(false); if (refused) refresh(); } }
  };
  const create = (args: HistoryTaskRequest) => {
    if (!ready || pending.current || read.pending.current || !validHistoryTaskRequest(args)) return;
    const submission: Attempt = { command: "history_materialize", args: structuredClone(args), key: newKey() };
    setAttempt(submission); void execute(submission);
  };
  const resume = () => {
    if (!ready || pending.current || read.pending.current || !detail || detail.materializationComplete) return;
    const submission: Attempt = { command: "history_resume", args: { taskId: detail.taskId }, key: newKey() };
    setAttempt(submission); void execute(submission);
  };
  const done = (status: J) => {
    if (!operation) return;
    finished.current.add(operation.id);
    setOperation(null); setAttempt(null);
    if (status.state === "succeeded") {
      try {
        const selection = operation.attempt.command === "history_materialize"
          ? { vaultId, request: operation.attempt.args as HistoryTaskRequest }
          : { vaultId, taskId: (operation.attempt.args as { taskId: string }).taskId };
        setDetail(historyTaskObservation(status.result, selection));
        setNote("Operation receipt. Read the saved task again to observe its latest state.");
      } catch { setDetail(null); setAttempt(operation.attempt); setError("The task receipt could not be confirmed. Read saved tasks before creating another submission."); }
    } else setNote("Local task creation stopped. Saved admission or partial jobs may remain; read the saved task and explicitly resume missing jobs.");
    refresh();
  };
  const recoveredDone = (status: J) => {
    finished.current.add(status.operationId);
    setOperations(previous => previous?.filter(op => op.operationId !== status.operationId) ?? null);
    setNote(`Recovered local task operation ${status.state}. Read its saved task to observe local jobs.`);
    refresh();
  };
  return { page, detail, operations, operation, attempt, waiting, busy, ready, error, note, list, read,
    create, resume, observe, refresh, done, recoveredDone, retry: () => { if (attempt) void execute(attempt); } };
}

export function HistoryTasks({ tasks, request = call, openSession }: {
  tasks: ReturnType<typeof useHistoryTasks>; request?: typeof call; openSession?: (sessionId: string) => void;
}) {
  const { page, detail } = tasks;
  return <section className="mem-card mem-stack" aria-label="Saved history tasks">
    <h3 className="mem-h3">Saved history tasks</h3>
    <p className="mem-muted">These are local job descriptors. Creating or resuming them does not call a model, add suggestions or approve memories.</p>
    <button type="button" className="mem-button" disabled={tasks.waiting || tasks.list.busy} onClick={() => tasks.refresh()}>Read saved history tasks</button>
    <ErrorBox error={tasks.list.error} /><ErrorBox error={tasks.read.error} />
    {tasks.error && <p role="alert" className="mem-error">{tasks.error}</p>}
    {tasks.attempt && !tasks.busy && <button type="button" className="mem-button" onClick={tasks.retry}>Retry original history submission</button>}
    {tasks.waiting && <p role="status" className="mem-muted">Waiting for the local task operation receipt…</p>}
    {tasks.note && <p role="status" className="mem-muted">{tasks.note}</p>}
    {tasks.operation && <Operation id={tasks.operation.id} kind={tasks.operation.kind} request={request} onDone={tasks.done} />}
    {tasks.operations?.filter((op: J) => op.operationId !== tasks.operation?.id).map((op: J) => <Operation key={op.operationId}
      id={op.operationId} kind={op.kind} request={request} onDone={tasks.recoveredDone} />)}
    {tasks.list.busy && <p role="status" className="mem-muted">Reading saved task descriptors and unfinished operations…</p>}
    {page && <>
      <p className="mem-muted">Descriptor observation · head {shortId(page.identity.commitId)}. Progress requires a separate task read.</p>
      {page.items.length === 0 && <p className="mem-muted">No saved history tasks on this page.</p>}
      <ul className="mem-list">{page.items.map((row: J) => <li key={row.taskId}>
        <span className="mem-mono">{shortId(row.taskId)}</span> · {when(row.createdAt)} · {row.request.batchIndices.length} selected batches
        <button type="button" className="mem-button" disabled={tasks.busy || tasks.read.busy} onClick={() => tasks.observe(row.taskId)}>Read task {shortId(row.taskId)}</button>
      </li>)}</ul>
      {page.nextCursor && <button type="button" className="mem-button" disabled={tasks.waiting || tasks.list.busy} onClick={() => tasks.refresh(page.nextCursor)}>Next saved history tasks</button>}
    </>}
    {detail && <div className="mem-stack">
      <h4 className="mem-h3">Observed local task</h4>
      <p className="mem-mono">{detail.taskId} · head {detail.identity.commitId}</p>
      <p className="mem-muted">{detail.request.api} · {detail.request.model} · selected order {detail.request.batchIndices.map((n: number) => n + 1).join(" → ")}</p>
      <dl className="mem-facts">
        <dt>Original import</dt><dd>{shortId(detail.request.importId)} · revision {detail.request.importRevision}</dd>
        <dt>Suggestions per batch</dt><dd>{detail.request.maxCandidates}</dd>
        <dt>Pending candidate limit</dt><dd>{detail.request.maxPending}</dd>
        <dt>Reserved token ceiling per batch</dt><dd>{detail.request.maxReservedTokens}</dd>
        <dt>Cost ceiling per batch (micro USD)</dt><dd>{detail.request.maxReservedCostMicrousd ?? "unknown"}</dd>
      </dl>
      <p role="status" className="mem-muted">{detail.materializationComplete ? "All selected local jobs exist. Model extraction and review are still separate." : `${detail.missingBatchIndices.length} local jobs are missing.`}</p>
      {openSession && detail.coordinatorSessionId && <button type="button" className="mem-button" disabled={tasks.busy || tasks.read.busy}
        onClick={() => { if (!tasks.busy && !tasks.read.busy) openSession(detail.coordinatorSessionId); }}>View coordinator session</button>}
      <ul className="mem-list">{detail.batches.map((batch: J) => <li key={batch.batchIndex}>Batch {batch.batchIndex + 1} · {batch.state} · {batch.applied} applied · invocation {batch.invocationState ?? "none recorded"} · <span className="mem-mono">{batch.sessionId}</span>
        {openSession && <button type="button" className="mem-button" disabled={tasks.busy || tasks.read.busy}
          onClick={() => { if (!tasks.busy && !tasks.read.busy) openSession(batch.sessionId); }}>View batch {batch.batchIndex + 1} session</button>}
      </li>)}</ul>
      <button type="button" className="mem-button" disabled={tasks.busy || tasks.read.busy} onClick={() => tasks.observe(detail.taskId)}>Read this history task again</button>
      {!detail.materializationComplete && <button type="button" className="mem-button" disabled={!tasks.ready || tasks.read.busy} onClick={tasks.resume}>Resume missing local jobs</button>}
    </div>}
  </section>;
}
