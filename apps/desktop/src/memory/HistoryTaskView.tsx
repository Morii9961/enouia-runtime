// Deferred view only. The Import owner hook remains in HistoryTaskPanel.
import { useState } from "react";
import { call, type J } from "./client";
import { ErrorBox, Operation, shortId, when } from "./ui";
import { HistoryBatchPanel } from "./HistoryBatchPanel";
import type { useHistoryTasks } from "./HistoryTaskPanel";
import { t } from '../i18n/index.ts';

export type HistoryTasksProps = {
  tasks: ReturnType<typeof useHistoryTasks>; request?: typeof call; openSession?: (sessionId: string) => void;
};
export function HistoryTasks({ tasks, request = call, openSession }: HistoryTasksProps) {
  const { page, detail } = tasks;
  const [selection, setSelection] = useState(tasks.batchOwner.selection);
  return <section className="mem-card mem-stack" aria-label={t("Saved history tasks")}>
    <h3 className="mem-h3">{t("Saved history tasks")}</h3>
    <p className="mem-muted">{t("These are local job descriptors. Creating or resuming them does not call a model, add suggestions or approve memories.")}</p>
    <button type="button" className="mem-button" disabled={tasks.waiting || tasks.list.busy} onClick={() => tasks.refresh()}>{t("Read saved history tasks")}</button>
    <ErrorBox error={tasks.list.error} /><ErrorBox error={tasks.read.error} />
    {tasks.error && <p role="alert" className="mem-error">{tasks.error}</p>}
    {tasks.attempt && !tasks.busy && <button type="button" className="mem-button" onClick={tasks.retry}>{t("Retry original history submission")}</button>}
    {tasks.waiting && <p role="status" className="mem-muted">{t("Waiting for the local task operation receipt…")}</p>}
    {tasks.note && <p role="status" className="mem-muted">{tasks.note}</p>}
    {tasks.operation && <Operation id={tasks.operation.id} kind={tasks.operation.kind} request={request} onDone={tasks.done} />}
    {tasks.operations?.filter((op: J) => op.operationId !== tasks.operation?.id).map((op: J) => <Operation key={op.operationId}
      id={op.operationId} kind={op.kind} request={request} onDone={tasks.recoveredDone} />)}
    {tasks.list.busy && <p role="status" className="mem-muted">{t("Reading saved task descriptors and unfinished operations…")}</p>}
    {page && <>
      <p className="mem-muted">Descriptor observation · head {shortId(page.identity.commitId)}. Progress requires a separate task read.</p>
      {page.items.length === 0 && <p className="mem-muted">{t("No saved history tasks on this page.")}</p>}
      <ul className="mem-list">{page.items.map((row: J) => <li key={row.taskId}>
        <span className="mem-mono">{shortId(row.taskId)}</span> · {when(row.createdAt)} · {row.request.batchIndices.length} selected batches
        <button type="button" className="mem-button" disabled={tasks.busy || tasks.read.busy} onClick={() => tasks.observe(row.taskId)}>Read task {shortId(row.taskId)}</button>
      </li>)}</ul>
      {page.nextCursor && <button type="button" className="mem-button" disabled={tasks.waiting || tasks.list.busy} onClick={() => tasks.refresh(page.nextCursor)}>{t("Next saved history tasks")}</button>}
    </>}
    {detail && <div className="mem-stack">
      <h4 className="mem-h3">{t("Observed local task")}</h4>
      <p className="mem-mono">{detail.taskId} · head {detail.identity.commitId}</p>
      <p className="mem-muted">{detail.request.api} · {detail.request.model} · selected order {detail.request.batchIndices.map((n: number) => n + 1).join(" → ")}</p>
      <dl className="mem-facts">
        <dt>{t("Original import")}</dt><dd>{shortId(detail.request.importId)} · {t("revision {n}", { n: detail.request.importRevision })}</dd>
        <dt>{t("Suggestions per batch")}</dt><dd>{detail.request.maxCandidates}</dd>
        <dt>{t("Pending candidate limit")}</dt><dd>{detail.request.maxPending}</dd>
        <dt>{t("Reserved token ceiling per batch")}</dt><dd>{detail.request.maxReservedTokens}</dd>
        <dt>Cost ceiling per batch (micro USD)</dt><dd>{detail.request.maxReservedCostMicrousd ?? "unknown"}</dd>
      </dl>
      <p role="status" className="mem-muted">{detail.materializationComplete ? "All selected local jobs exist. Model extraction and review are still separate." : `${detail.missingBatchIndices.length} local jobs are missing.`}</p>
      {openSession && detail.coordinatorSessionId && <button type="button" className="mem-button" disabled={tasks.busy || tasks.read.busy}
        onClick={() => { if (!tasks.busy && !tasks.read.busy) openSession(detail.coordinatorSessionId); }}>{t("View coordinator session")}</button>}
      <ul className="mem-list">{detail.batches.map((batch: J) => <li key={batch.batchIndex}>Batch {batch.batchIndex + 1} · {batch.state} · {batch.applied} applied · invocation {batch.invocationState ?? "none recorded"} · <span className="mem-mono">{batch.sessionId}</span>
        <button type="button" className="mem-button" disabled={tasks.busy || tasks.read.busy}
          onClick={() => {
            const selected = { taskId: detail.taskId, index: batch.batchIndex };
            tasks.batchOwner.selection = selected; setSelection(selected);
          }}>{t("Inspect batch {n} request", { n: batch.batchIndex + 1 })}</button>
        {openSession && <button type="button" className="mem-button" disabled={tasks.busy || tasks.read.busy}
          onClick={() => { if (!tasks.busy && !tasks.read.busy) openSession(batch.sessionId); }}>{t("View batch {n} session", { n: batch.batchIndex + 1 })}</button>}
      </li>)}</ul>
      <button type="button" className="mem-button" disabled={tasks.busy || tasks.read.busy} onClick={() => tasks.observe(detail.taskId)}>{t("Read this history task again")}</button>
      {!detail.materializationComplete && <button type="button" className="mem-button" disabled={!tasks.ready || tasks.read.busy} onClick={tasks.resume}>{t("Resume missing local jobs")}</button>}
    </div>}
    <HistoryBatchPanel vaultId={tasks.vaultId} task={detail?.taskId === selection?.taskId ? detail : null}
      index={selection?.index ?? null} owner={tasks.batchOwner} request={request} />
  </section>;
}
