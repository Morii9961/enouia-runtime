// External text Provider controls for one session branch (ADR-032; Enouia
// Memory ADR-MEM-48). Every rule lives in the Core: the owner confirms a
// standing grant by its exact bytes, reads the exact request body before it
// is sent once, and closes an unknown call locally. Keys never reach this
// page; they are set in the native Windows credential prompt.
import { useCallback, useEffect, useState } from "react";
import { call, describe, providerSetup, providerReload, providerKey, type J } from "./client";
import { useAction, useLatestRead } from "./hooks";
import { holdProviderConfirmation } from "./providerConfirmation";
import { holdProviderSend } from "./providerSend";
import { ErrorBox, Operation, OperationFeedback, Tag, shortId } from "./ui";

type Branch = { sessionId: string; branchId: string };
type Native = { setup: typeof providerSetup; reload: typeof providerReload; key: typeof providerKey };
const NATIVE: Native = { setup: providerSetup, reload: providerReload, key: providerKey };

const SETUP_TEXT: Record<string, string> = {
  absent: "External providers are off. To turn them on, the owner writes memory-providers.json in Runtime's settings folder with the exact models and limits they verified.",
  invalid: "memory-providers.json was refused, so external providers stay off.",
};

const STATE_TEXT: Record<string, string> = {
  completed: "completed",
  length: "stopped at the output limit",
  failed: "failed",
  cancelled: "closed locally",
  outcome_unknown: "outcome unknown: the request may have reached the provider",
};

export function ExternalPanel({ branch, text, invocations, onChanged, consumeText, onBusyChange, onOperationChange, disabled = false, request = call, native = NATIVE }: {
  branch: Branch;
  text: string;
  invocations: J[];
  onChanged: () => Promise<void>;
  consumeText: (submitted: string) => void;
  onBusyChange?: (busy: boolean) => void;
  onOperationChange?: (operationId: string | null) => void;
  disabled?: boolean;
  request?: typeof call;
  native?: Native;
}) {
  const [status, setStatus] = useState<J>(null);
  const [setup, setSetup] = useState<J>(null);
  const [api, setApi] = useState("");
  const [confirmationPlan, setPlan] = useState<ReturnType<typeof holdProviderConfirmation> | null>(null);
  const plan = confirmationPlan?.plan;
  const [heldSend, setPrepared] = useState<ReturnType<typeof holdProviderSend> | null>(null);
  const prepared = heldSend?.prepared;
  const submitted = heldSend?.submitted() ?? false;
  const [operation, setOperation] = useState<string | null>(null);
  const [completion, setCompletion] = useState<J>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [extraction, setExtraction] = useState(false);
  const action = useAction();
  const read = useLatestRead();
  const refresh = useCallback(() => read.run(
    async () => ({ s: await request("provider_status"), n: await native.setup() }),
    ({ s, n }) => {
      setStatus(s);
      setSetup(n);
      setApi((current) => s.destinations.some((d: J) => d.api === current) ? current : s.destinations[0]?.api ?? "");
    },
    () => { setStatus(null); setSetup(null); setPrepared(null); setPlan(null); },
  ), [read.run, request, native]);
  useEffect(() => { void refresh(); }, [refresh]);
  const owningWork = action.busy || operation != null;
  const owningReview = owningWork || !!plan || submitted;
  useEffect(() => {
    onBusyChange?.(owningReview);
    return () => onBusyChange?.(false);
  }, [owningReview, onBusyChange]);
  useEffect(() => {
    onOperationChange?.(operation);
    return () => onOperationChange?.(null);
  }, [operation, onOperationChange]);
  // A prepared call and a held plan belong to the branch they came from.
  useEffect(() => { setPrepared(null); setPlan(null); setNotice(null); setCompletion(null); action.clear(); }, [branch.sessionId, branch.branchId, action.clear]);

  const busy = disabled || owningWork || read.busy || (!status && !read.error);
  const reviewBusy = busy || !!plan || submitted;
  const setupBusy = reviewBusy || !!prepared;
  const confirmationBlocked = !!action.error && !action.error.retry;
  const holdPlan = (command: string, args: Record<string, unknown>) =>
    void action.run(async () => { setNotice(null); setPlan(holdProviderConfirmation(await request(command, args), request)); });
  const confirmation = plan && (
    <div className="mem-stack" role="group" aria-label="Plan to confirm">
      <p><Tag tone="warn">{plan.kind}</Tag> Confirm exactly this content:</p>
      <pre className="mem-pre" tabIndex={0}>{plan.inspection}</pre>
      {confirmationBlocked && <p className="mem-muted">This confirmation cannot be retried. Cancel to read the saved state, then review a new plan if needed.</p>}
      <div className="mem-actions">
        <button type="button" className="mem-button mem-primary" disabled={busy || confirmationBlocked}
          onClick={() => void action.run(async () => {
            await confirmationPlan!.confirm();
            setPlan(null);
            await refresh();
            await onChanged();
          })}>Confirm</button>
        <button type="button" className="mem-button" disabled={busy} onClick={() => void action.run(async () => {
          setPlan(null);
          await refresh();
          await onChanged();
        })}>Cancel</button>
      </div>
    </div>
  );
  const callHistory = invocations.length > 0 && (
    <div className="mem-stack">
      <h4 className="mem-label">Provider calls in this session</h4>
      <p className="mem-muted">Closing an unknown call locally records a local outcome. It does not undo processing at the service.</p>
      <ul className="mem-list">
        {invocations.map((i: J) => (
          <li key={i.dispatch_id}>
            <Tag tone={i.state === "completed" ? "ok" : "warn"}>{STATE_TEXT[i.state] ?? i.state}</Tag>{" "}
            {shortId(i.dispatch_id)} · reserved {i.reserved_tokens} tokens
            {i.input_tokens != null && ` · reported ${i.input_tokens} in / ${i.output_tokens ?? "?"} out`}
            {i.state === "outcome_unknown" && !operation && (
              <>{" "}<button type="button" className="mem-link" disabled={setupBusy}
                onClick={() => holdPlan("external_interrupt_plan", { inputEventId: i.input_event_id, dispatchId: i.dispatch_id })}>Close locally…</button></>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
  const operationView = <>
    {operation && <Operation id={operation} kind="external_send" request={request} onDone={(s) => { setCompletion(s); setOperation(null); void onChanged(); }} />}
    {completion && <OperationFeedback status={completion} onCancel={() => {}} />}
  </>;
  const reload = () => void action.run(async () => {
    setNotice(null); setPrepared(null); setPlan(null);
    read.clear();
    // Delivery failure may follow a successful native update. Observe the
    // Core again even on refusal instead of keeping an assumed old status.
    try { await native.reload(); }
    finally { await refresh(); }
  });
  const setupControls = <>
    <details className="mem-stack">
      <summary className="mem-label">Model setup steps</summary>
      <p className="mem-muted">Create or edit <span className="mem-mono">%APPDATA%\com.enouia.runtime\memory-providers.json</span> with the exact model and limits you verified. Set schemaVersion to 1; each destination needs api (openai or anthropic), model, contextWindowTokens, maxOutputTokens, streaming and verifiedAt (an ISO timestamp). Also set maxAttemptsPerSession and maxReservedTokensPerSession. No values are inferred.</p>
      <p className="mem-muted">Reload settings after editing. Remove the file and reload to turn external providers off. Keys belong only in the native Set key prompt. A loaded configuration still needs a key and a reviewed grant; you inspect each request before Send once. Session token limits are estimates, not a spending cap.</p>
    </details>
    <div className="mem-actions"><button type="button" className="mem-button" disabled={busy || !!plan || !!prepared} onClick={reload}>{action.busy ? "Working…" : "Reload settings"}</button></div>
    {operation && <p className="mem-muted">Wait for the current call to finish before reloading settings.</p>}
    {(plan || prepared) && <p className="mem-muted">Finish or cancel the current review before reloading settings.</p>}
  </>;

  if (read.error) return <div className="mem-stack">
    <ErrorBox error={read.error} />
    <ErrorBox error={action.error} />
    <button type="button" className="mem-button" disabled={busy} onClick={() => void refresh()}>Read status again</button>
    {setupControls}
    {operationView}{callHistory}{confirmation}
  </div>;
  if (!status) return <div className="mem-stack"><p role="status" className="mem-muted">Reading provider setup…</p>{operationView}{callHistory}</div>;
  if (!status.configured) {
    const why = setup?.state === "invalid" ? `${SETUP_TEXT.invalid} ${describe(setup.rule)}` : SETUP_TEXT.absent;
    return (
      <div className="mem-stack">
        <h3 className="mem-h3">External provider</h3>
        <p className="mem-muted">{why}</p>
        <ErrorBox error={action.error} />
        {setupControls}
        {operationView}{callHistory}{confirmation}
      </div>
    );
  }
  const destination = status.destinations.find((d: J) => d.api === api);
  const grant = (status.grants ?? []).find((g: J) => g.active && g.destinations.some((d: J) => d.provider === api && d.model === destination?.model));

  return (
    <div className="mem-stack" aria-label="External provider">
      <h3 className="mem-h3">External provider</h3>
      <ErrorBox error={action.error} />
      {notice && <p className="mem-muted" role="status">{notice}</p>}
      {setupControls}

      <label className="mem-label" htmlFor="mem-ext-api">Provider</label>
      <select id="mem-ext-api" className="mem-input" value={api} disabled={setupBusy} onChange={(e) => { setApi(e.target.value); setPrepared(null); }}>
        {status.destinations.map((d: J) => <option key={d.api} value={d.api}>{d.api} · {d.model}</option>)}
      </select>
      <div className="mem-actions">
        <button type="button" className="mem-button" disabled={setupBusy}
          onClick={() => void action.run(async () => {
            const r = await native.key(api, "set");
            setNotice(r.cancelled ? "Key entry cancelled." : "Key saved in Windows Credential Manager.");
          })}>Set key…</button>
        <button type="button" className="mem-button" disabled={setupBusy}
          onClick={() => void action.run(async () => {
            await native.key(api, "remove");
            setNotice("Key removed from this computer. This does not revoke it at the provider.");
            await refresh();
          })}>Remove key</button>
      </div>

      {grant
        ? <p className="mem-muted">Allowed by grant {shortId(grant.policyId)} (up to {grant.maxSensitivity}).{" "}
            <button type="button" className="mem-link" disabled={setupBusy} onClick={() => holdPlan("egress_revoke_plan", { policyId: grant.policyId })}>Revoke…</button></p>
        : <div className="mem-stack">
            <p className="mem-muted">No grant allows sending to {api} yet. A grant lets this provider receive private memories and session text you include in a request.</p>
            <label className="mem-muted"><input type="checkbox" checked={extraction} disabled={setupBusy} onChange={(e) => setExtraction(e.target.checked)} />{" "}
              Also allow suggesting memories from sources you select (extraction)</label>
            <div className="mem-actions">
              <button type="button" className="mem-button" disabled={setupBusy}
                onClick={() => holdPlan("egress_grant_plan", { apis: [api], maxSensitivity: "private", extraction })}>Review a grant…</button>
            </div>
          </div>}

      {confirmation}

      {!prepared && !operation && (
        <div className="mem-actions">
          <button type="button" className="mem-button" disabled={reviewBusy || !grant || !text.trim()}
            title={grant ? undefined : "A grant is needed first"}
            onClick={() => void action.run(async (key) => {
              const submitted = text;
              setNotice(null); setCompletion(null);
              const result = await request("external_prepare", {
                ...branch, text: submitted, api, policyId: grant.policyId,
                streaming: destination?.streaming === "supported",
                outputTokens: Math.min(1024, destination?.maxOutputTokens ?? 1024),
              }, key);
              consumeText(submitted);
              setPrepared(holdProviderSend(result, request));
              await onChanged();
            })}>Prepare the question for {api}…</button>
        </div>
      )}

      {prepared && (
        <div className="mem-stack" role="group" aria-label="Request to send">
          <p>This exact request goes to <span className="mem-mono">{prepared.endpoint}</span> ({prepared.model}), about {prepared.estimatedInputTokens} input tokens and at most {prepared.outputTokens} output tokens. It is sent once. Retry recovers this same call without sending again to the service.</p>
          <pre className="mem-pre" tabIndex={0}>{prepared.body}</pre>
          {submitted && <p role="status" className="mem-muted">Send was submitted. The service may have received it. Recover this call, or leave this request and read the saved session and workspace calls.</p>}
          <div className="mem-actions">
            <button type="button" className="mem-button mem-primary" disabled={busy || !!plan || (submitted && confirmationBlocked)}
              onClick={() => void action.run(async () => {
                const started = await heldSend!.send();
                setPrepared(null);
                setOperation(started.operationId);
              })}>{submitted ? "Recover this call" : "Send once"}</button>
            <button type="button" className="mem-button" disabled={busy || !!plan}
              onClick={() => {
                if (!submitted) { action.clear(); setPrepared(null); setNotice("Not sent. The question stays saved in this session."); }
                else void action.run(async () => {
                  setPrepared(null);
                  setNotice("The send outcome is not confirmed here. Read the saved session and workspace calls; the service may have received it.");
                  await refresh(); await onChanged();
                });
              }}>{submitted ? "Leave and read saved state" : "Don't send"}</button>
          </div>
        </div>
      )}

      {operationView}{callHistory}
    </div>
  );
}
