// Re-observe existing Memory operations. No operation is started, cancelled,
// retried or interpreted as an approved/published domain result here.
import { useCallback, useEffect, useRef, useState } from "react";
import { call, type J } from "../memory/client";
import { useLatestRead } from "../memory/hooks";
import { operationListObservation, operationObservation } from "../memory/observationIdentity";
import { ErrorBox, shortId, when } from "../memory/ui";

import { labels, msg, t } from '../i18n/index.ts';
const KINDS: Record<string, string> = labels({ import: msg("Import"), import_resume: msg("Resume import"), index_rebuild: msg("Rebuild index"), vault_verify: msg("Verify Vault"), backup_export: msg("Back up Vault"), external_send: msg("Model call") });
const STATES: Record<string, string> = labels({ queued: msg("Queued"), running: msg("Running"), succeeded: msg("Finished"), failed: msg("Failed"), cancelled: msg("Cancelled") });
const kindName = (kind: string) => Object.hasOwn(KINDS, kind) ? KINDS[kind] : t("Other Memory operation");
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? String(value) : "unknown";
const active = (operation: J) => operation.state === "queued" || operation.state === "running";

export function WorkspaceOperations({ request = call }: { request?: typeof call }) {
  const [page, setPage] = useState<{ items: J[]; readAt: string } | null>(null);
  const [selected, setSelected] = useState<{ id: string; kind: string } | null>(null);
  const [limit, setLimit] = useState(20);
  const list = useLatestRead();
  const refresh = useCallback(() => {
    if (list.pending.current) return;
    void list.run(async () => operationListObservation(await request("operation_list")), result => {
      setPage({ items: result.items, readAt: new Date().toISOString() });
      // A Core-owned list is not chronological. Show active tasks first,
      // then use a stable ID order, without calling either group "latest".
      setLimit(20);
      setSelected(current => current && result.items.some((item: J) => item.operationId === current.id && item.kind === current.kind) ? current : null);
    }, () => setPage(null));
  }, [request, list.run]);
  useEffect(refresh, [refresh]);
  const items = [...(page?.items ?? [])].sort((a, b) => Number(active(b)) - Number(active(a)) || a.operationId.localeCompare(b.operationId));
  return <section className="mem-stack" aria-label={t("Memory operations")}>
    <h2 className="qr194">{t("Memory operations")}</h2>
    <p className="mem-muted">{t("Operations retained for this currently open Vault in this Runtime process. Closing the Vault clears this list; it is not a durable task history.")}</p>
    <button type="button" className="mem-button" aria-disabled={list.busy} onClick={refresh}>{t("Read Memory operations again")}</button>
    <ErrorBox error={list.error} />
    {list.busy && <p className="mem-muted" role="status">{t("Reading Memory operations…")}</p>}
    {!page && !list.busy && !list.error && <p className="mem-muted" role="status">{t("Operations have not been observed.")}</p>}
    {page && !list.busy && !list.error && <>
      <p className="mem-muted">{t("List observed {when} · showing {shown} of {total}", { when: when(page.readAt), shown: Math.min(limit, items.length), total: items.length })}</p>
      {items.length === 0 && <p className="mem-muted">{t("No operations in the current list.")}</p>}
      <ul className="mem-list">{items.slice(0, limit).map(item => <li key={item.operationId}>
        <button type="button" className="mem-link" aria-label={t('Inspect operation {id}', { id: item.operationId })} aria-pressed={selected?.id === item.operationId}
          onClick={() => setSelected({ id: item.operationId, kind: item.kind })}>{kindName(item.kind)} · {shortId(item.operationId)}</button>
        {" "}<span>{STATES[item.state]}</span>
      </li>)}</ul>
      {limit < items.length && <button type="button" className="mem-button" onClick={() => setLimit(current => current + 20)}>{t("Show more operations")}</button>}
    </>}
    {selected && <OperationRead key={`${selected.id}:${selected.kind}`} operationId={selected.id} kind={selected.kind} request={request} />}
  </section>;
}

function OperationRead({ operationId, kind, request }: { operationId: string; kind: string; request: typeof call }) {
  const [observation, setObservation] = useState<{ operation: J; readAt: string } | null>(null);
  const read = useLatestRead();
  const terminal = useRef(false);
  const refresh = useCallback(async () => {
    if (read.pending.current) return;
    await read.run(async () => operationObservation(await request("operation_get", { operationId }), operationId, kind), operation => {
      terminal.current = !active(operation);
      setObservation({ operation, readAt: new Date().toISOString() });
    }, () => { setObservation(null); terminal.current = false; });
  }, [request, operationId, kind, read.run]);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh();
      if (!stopped && !terminal.current) timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [refresh]);
  const operation = observation?.operation;
  return <section className="mem-card mem-stack" aria-label={t("Observed operation")}>
    <h3 className="mem-h3">{kindName(kind)}</h3>
    <p className="mem-mono">{operationId}</p>
    <button type="button" className="mem-button" aria-disabled={read.busy} onClick={() => void refresh()}>{t("Read operation progress again")}</button>
    <ErrorBox error={read.error} />
    {read.busy && <p role="status" className="mem-muted">{t("Reading operation progress…")}</p>}
    {operation && <>
      <p role="status">{STATES[operation.state]} · {t("reported progress {n}", { n: count(operation.progress.done) })}{operation.progress.total == null ? " · " + t("total unknown") : " / " + count(operation.progress.total)}</p>
      <p className="mem-muted">{t("Progress observed {when}. Execution state does not establish a clean verification, a saved backup, a completed model answer or an approved memory; inspect the result in its owning Memory or Sessions flow.", { when: when(observation.readAt) })}</p>
      {operation.cancelRequested && <p className="mem-muted">{t("Local cancellation was requested. This does not establish completion or remote cancellation.")}</p>}
    </>}
  </section>;
}
