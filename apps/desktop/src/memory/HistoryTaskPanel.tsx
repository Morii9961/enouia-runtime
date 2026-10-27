// The Import owner outlives head-bound previews. Requests and keys remain
// in memory only; saved task discovery belongs to the pinned Core.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { CallError, call, describe, newKey, type J } from "./client";
import { useLatestRead } from "./hooks";
import { historyTaskListObservation, historyTaskObservation, validHistoryTaskRequest, type HistoryTaskRequest } from "./historyTasks";
import { operationListObservation } from "./observationIdentity";
import { historyBatchOwner } from "./historyBatch";
import type { HistoryTasksProps } from "./HistoryTaskView";

import { t } from '../i18n/index.ts';
type Attempt = { command: "history_materialize" | "history_resume"; args: HistoryTaskRequest | { taskId: string }; key: string };
export function useHistoryTasks(vaultId: string, request = call) {
  const batchOwner = historyBatchOwner(vaultId);
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
        if (refused) { setAttempt(null); setNote(t("Memory refused this submission. Read a fresh plan and saved tasks before another action.")); }
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
        setNote(t("Operation receipt. Read the saved task again to observe its latest state."));
      } catch { setDetail(null); setAttempt(operation.attempt); setError(t("The task receipt could not be confirmed. Read saved tasks before creating another submission.")); }
    } else setNote(t("Local task creation stopped. Saved admission or partial jobs may remain; read the saved task and explicitly resume missing jobs."));
    refresh();
  };
  const recoveredDone = (status: J) => {
    finished.current.add(status.operationId);
    setOperations(previous => previous?.filter(op => op.operationId !== status.operationId) ?? null);
    setNote(t("Recovered local task operation {state}. Read its saved task to observe local jobs.", { state: status.state }));
    refresh();
  };
  return { vaultId, batchOwner, page, detail, operations, operation, attempt, waiting, busy, ready, error, note, list, read,
    create, resume, observe, refresh, done, recoveredDone, retry: () => { if (attempt) void execute(attempt); } };
}

// Keep request ownership outside the deferred view so loading cannot reset it.
const HistoryTaskView = lazy(() => import("./HistoryTaskView").then(module => ({ default: module.HistoryTasks })));
export function HistoryTasks(props: HistoryTasksProps) {
  return <Suspense fallback={<p role="status" className="mem-muted">{t("Loading panel…")}</p>}>
    <HistoryTaskView {...props} />
  </Suspense>;
}
