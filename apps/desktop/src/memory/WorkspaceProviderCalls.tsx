// Re-observe Core-owned operation IDs after a surface remount. No request
// body, key, draft or operation result is persisted by Runtime.
import { useCallback, useEffect, useState } from "react";
import { call, type J } from "./client";
import { useLatestRead } from "./hooks";
import { operationListObservation } from "./observationIdentity";
import { ErrorBox, Operation, OperationFeedback, shortId } from "./ui";

import { t } from '../i18n/index.ts';
export function WorkspaceProviderCalls({ excludeOperationId = null, request = call }: {
  excludeOperationId?: string | null; request?: typeof call;
}) {
  const [items, setItems] = useState<J[] | null>(null);
  const read = useLatestRead();
  const refresh = useCallback(() => read.run(async () => operationListObservation(await request("operation_list")), (page) => {
    setItems(page.items.filter((op: J) => op.kind === "external_send"));
  }), [read.run, request]);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh();
      if (!stopped) timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [refresh]);
  const visible = items?.filter(op => op.operationId !== excludeOperationId);
  return <section className="mem-stack" aria-label={t("Workspace model calls")}>
    <h2 className="mem-h3">{t("Workspace model calls")}</h2>
    <p className="mem-muted">{t("Calls from this open workspace, including other sessions and source suggestions. This list does not identify them as calls in the selected session.")}</p>
    <button type="button" className="mem-button" disabled={read.busy} onClick={() => void refresh()}>{t("Refresh workspace calls")}</button>
    <ErrorBox error={read.error} />
    {read.busy && <p className="mem-muted" role="status">{t("Reading workspace calls…")}</p>}
    {read.error && items && <p className="mem-muted" role="status">{t("The call list is from an earlier observation. Running calls continue to read their own status.")}</p>}
    {items == null && !read.busy && !read.error && <p className="mem-muted" role="status">{t("Workspace calls have not been read yet.")}</p>}
    {items != null && !read.busy && !read.error && items.length === 0 && <p className="mem-muted">{t("No model calls in the current operation list.")}</p>}
    {excludeOperationId && items?.some(op => op.operationId === excludeOperationId) && <p className="mem-muted">{t("The selected session's watched call is shown in its inspector.")}</p>}
    {visible?.map(op => <div key={op.operationId} className="mem-stack">
      <span className="mem-mono">Operation {shortId(op.operationId)}</span>
      {["queued", "running"].includes(op.state)
        ? <Operation id={op.operationId} kind="external_send" request={request} onDone={() => void refresh()} />
        : <OperationFeedback status={op} onCancel={() => {}} />}
    </div>)}
  </section>;
}
