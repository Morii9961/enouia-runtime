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
import { holdProviderPreparation } from "./providerPreparation";
import { recordedInvocationOutcome } from "./recordedInvocation";
import { ErrorBox, Operation, OperationFeedback, Tag, shortId } from "./ui";

import { labels, msg, t, tj } from '../i18n/index.ts';
type Branch = { sessionId: string; branchId: string };
type Native = { setup: typeof providerSetup; reload: typeof providerReload; key: typeof providerKey };
const NATIVE: Native = { setup: providerSetup, reload: providerReload, key: providerKey };

const SETUP_TEXT: Record<string, string> = labels({
  absent: msg("External providers are off. To turn them on, the owner writes memory-providers.json in Runtime's settings folder with the exact models and limits they verified."),
  invalid: msg("memory-providers.json was refused, so external providers stay off."),
});

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
  const [preparation, setPreparation] = useState<ReturnType<typeof holdProviderPreparation> | null>(null);
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
    () => { setStatus(null); setSetup(null); setPrepared(null); setPreparation(null); setPlan(null); },
  ), [read.run, request, native]);
  useEffect(() => { void refresh(); }, [refresh]);
  const owningWork = action.busy || operation != null;
  const owningReview = owningWork || !!plan || submitted || !!preparation;
  useEffect(() => {
    onBusyChange?.(owningReview);
    return () => onBusyChange?.(false);
  }, [owningReview, onBusyChange]);
  useEffect(() => {
    onOperationChange?.(operation);
    return () => onOperationChange?.(null);
  }, [operation, onOperationChange]);
  // A prepared call and a held plan belong to the branch they came from.
  useEffect(() => { setPrepared(null); setPreparation(null); setPlan(null); setNotice(null); setCompletion(null); action.clear(); }, [branch.sessionId, branch.branchId, action.clear]);

  const busy = disabled || owningWork || read.busy || (!status && !read.error);
  const reviewBusy = busy || !!plan || submitted || !!preparation;
  const setupBusy = reviewBusy || !!prepared;
  const confirmationBlocked = !!action.error && !action.error.retry;
  const holdPlan = (command: string, args: Record<string, unknown>) =>
    void action.run(async () => { setNotice(null); setPlan(holdProviderConfirmation(await request(command, args), request)); });
  const confirmation = plan && (
    <div className="mem-stack" role="group" aria-label={t("Plan to confirm")}>
      <p><Tag tone="warn">{plan.kind}</Tag> {t("Confirm exactly this content:")}</p>
      <pre className="mem-pre" tabIndex={0}>{plan.inspection}</pre>
      {confirmationBlocked && <p className="mem-muted">{t("This confirmation cannot be retried. Cancel to read the saved state, then review a new plan if needed.")}</p>}
      <div className="mem-actions">
        <button type="button" className="mem-button mem-primary" disabled={busy || confirmationBlocked}
          onClick={() => void action.run(async () => {
            await confirmationPlan!.confirm();
            setPlan(null);
            await refresh();
            await onChanged();
          })}>{t("Confirm")}</button>
        <button type="button" className="mem-button" disabled={busy} onClick={() => void action.run(async () => {
          setPlan(null);
          await refresh();
          await onChanged();
        })}>{t("Cancel")}</button>
      </div>
    </div>
  );
  const callHistory = invocations.length > 0 && (
    <div className="mem-stack">
      <h4 className="mem-label">{t("Provider calls in this session")}</h4>
      <p className="mem-muted">{t("Closing an unknown call locally records a local outcome. It does not undo processing at the service.")}</p>
      <ul className="mem-list">
        {invocations.map((i: J) => {
          const saved = recordedInvocationOutcome(i.state, i.error_code);
          return (
          <li key={i.dispatch_id}>
            <Tag tone={i.state === "completed" ? "ok" : "warn"}>{saved.outcome}</Tag>{" "}
            <span title={i.dispatch_id}>{shortId(i.dispatch_id)}</span> · {t("reserved {n} tokens", { n: i.reserved_tokens })}
            {i.input_tokens != null && " · " + t("reported {input} in / {output} out", { input: i.input_tokens, output: i.output_tokens ?? "?" })}
            {saved.error && <p className="mem-muted">Recorded error: {saved.error}</p>}
            {i.state === "outcome_unknown" && !operation && (
              <>{" "}<button type="button" className="mem-link" disabled={setupBusy}
                onClick={() => holdPlan("external_interrupt_plan", { inputEventId: i.input_event_id, dispatchId: i.dispatch_id })}>{t("Close locally…")}</button></>
            )}
          </li>
          );
        })}
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
      <summary className="mem-label">{t("Model setup steps")}</summary>
      <p className="mem-muted">{tj("Create or edit {path} with the exact model and limits you verified. Set schemaVersion to 1; each destination needs api (openai or anthropic), model, contextWindowTokens, maxOutputTokens, streaming and verifiedAt (an ISO timestamp). Also set maxAttemptsPerSession and maxReservedTokensPerSession. No values are inferred.", { path: <span className="mem-mono">%APPDATA%\com.enouia.runtime\memory-providers.json</span> })}</p>
      <p className="mem-muted">Reload settings after editing. Remove the file and reload to turn external providers off. Keys belong only in the native Set key prompt. A loaded configuration still needs a key and a reviewed grant; you inspect each request before Send once. Session token limits are estimates, not a spending cap.</p>
    </details>
    <div className="mem-actions"><button type="button" className="mem-button" disabled={busy || !!plan || !!prepared || !!preparation} onClick={reload}>{action.busy ? "Working…" : "Reload settings"}</button></div>
    {operation && <p className="mem-muted">{t("Wait for the current call to finish before reloading settings.")}</p>}
    {(plan || prepared || preparation) && <p className="mem-muted">{t("Finish or cancel the current review before reloading settings.")}</p>}
  </>;

  if (read.error) return <div className="mem-stack">
    <ErrorBox error={read.error} />
    <ErrorBox error={action.error} />
    <button type="button" className="mem-button" disabled={busy} onClick={() => void refresh()}>{t("Read status again")}</button>
    {setupControls}
    {operationView}{callHistory}{confirmation}
  </div>;
  if (!status) return <div className="mem-stack"><p role="status" className="mem-muted">{t("Reading provider setup…")}</p>{operationView}{callHistory}</div>;
  if (!status.configured) {
    const why = setup?.state === "invalid" ? `${SETUP_TEXT.invalid} ${describe(setup.rule)}` : SETUP_TEXT.absent;
    return (
      <div className="mem-stack">
        <h3 className="mem-h3">{t("External provider")}</h3>
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
    <div className="mem-stack" aria-label={t("External provider")}>
      <h3 className="mem-h3">{t("External provider")}</h3>
      <ErrorBox error={action.error} />
      {notice && <p className="mem-muted" role="status">{notice}</p>}
      {setupControls}

      <label className="mem-label" htmlFor="mem-ext-api">{t("Provider")}</label>
      <select id="mem-ext-api" className="mem-input" value={api} disabled={setupBusy} onChange={(e) => { setApi(e.target.value); setPrepared(null); }}>
        {status.destinations.map((d: J) => <option key={d.api} value={d.api}>{d.api} · {d.model}</option>)}
      </select>
      <div className="mem-actions">
        <button type="button" className="mem-button" disabled={setupBusy}
          onClick={() => void action.run(async () => {
            const r = await native.key(api, "set");
            setNotice(r.cancelled ? t("Key entry cancelled.") : t("Key saved in Windows Credential Manager."));
          })}>{t("Set key…")}</button>
        <button type="button" className="mem-button" disabled={setupBusy}
          onClick={() => void action.run(async () => {
            await native.key(api, "remove");
            setNotice(t("Key removed from this computer. This does not revoke it at the provider."));
            await refresh();
          })}>{t("Remove key")}</button>
      </div>

      {grant
        ? <p className="mem-muted">Allowed by grant {shortId(grant.policyId)} (up to {grant.maxSensitivity}).{" "}
            <button type="button" className="mem-link" disabled={setupBusy} onClick={() => holdPlan("egress_revoke_plan", { policyId: grant.policyId })}>{t("Revoke…")}</button></p>
        : <div className="mem-stack">
            <p className="mem-muted">No grant allows sending to {api} yet. A grant lets this provider receive private memories and session text you include in a request.</p>
            <label className="mem-muted"><input type="checkbox" checked={extraction} disabled={setupBusy} onChange={(e) => setExtraction(e.target.checked)} />{" "}
              Also allow suggesting memories from sources you select (extraction)</label>
            <div className="mem-actions">
              <button type="button" className="mem-button" disabled={setupBusy}
                onClick={() => holdPlan("egress_grant_plan", { apis: [api], maxSensitivity: "private", extraction })}>{t("Review a grant…")}</button>
            </div>
          </div>}

      {confirmation}

      {!prepared && !operation && (
        <div className="mem-stack">
          {preparation && <p role="status" className="mem-muted">{t("Preparation was submitted. Its saved result is not confirmed here. Recover the original preparation or leave and read the saved session. Preparing does not send to a model.")}</p>}
          <div className="mem-actions">
            <button type="button" className="mem-button" disabled={busy || !!plan || submitted || (!preparation && (!grant || !text.trim())) || (!!preparation && confirmationBlocked)}
              title={grant ? undefined : t("A grant is needed first")}
              onClick={() => {
                const held = preparation ?? holdProviderPreparation("external_prepare", {
                  ...branch, text, api, policyId: grant.policyId,
                  streaming: destination?.streaming === "supported",
                  outputTokens: Math.min(1024, destination?.maxOutputTokens ?? 1024),
                }, request);
                setPreparation(held);
                void action.run(async () => {
                  setNotice(null); setCompletion(null);
                  const result = await held.prepare();
                  consumeText(held.arguments.text as string);
                  setPrepared(holdProviderSend(result, request));
                  setPreparation(null);
                  await onChanged();
                });
              }}>{preparation ? t("Recover preparation") : t("Prepare the question for {api}…", { api })}</button>
            {preparation && <button type="button" className="mem-button" disabled={busy} onClick={() => void action.run(async () => {
              setPreparation(null);
              setNotice(t("Preparation has not sent a model request. Read the saved session before preparing another question."));
              await refresh(); await onChanged();
            })}>{t("Leave preparation and read saved state")}</button>}
          </div>
        </div>
      )}

      {prepared && (
        <div className="mem-stack" role="group" aria-label={t("Request to send")}>
          <p>{t("This exact request goes to")} <span className="mem-mono">{prepared.endpoint}</span> ({prepared.model}), about {prepared.estimatedInputTokens} input tokens and at most {prepared.outputTokens} output tokens. It is sent once. Retry recovers this same call without sending again to the service.</p>
          <pre className="mem-pre" tabIndex={0}>{prepared.body}</pre>
          {submitted && <p role="status" className="mem-muted">{t("Send was submitted. The service may have received it. Recover this call, or leave this request and read the saved session and workspace calls.")}</p>}
          <div className="mem-actions">
            <button type="button" className="mem-button mem-primary" disabled={busy || !!plan || (submitted && confirmationBlocked)}
              onClick={() => void action.run(async () => {
                const started = await heldSend!.send();
                setPrepared(null);
                setOperation(started.operationId);
              })}>{submitted ? t("Recover this call") : t("Send once")}</button>
            <button type="button" className="mem-button" disabled={busy || !!plan}
              onClick={() => {
                if (!submitted) { action.clear(); setPrepared(null); setNotice(t("Not sent. The question stays saved in this session.")); }
                else void action.run(async () => {
                  setPrepared(null);
                  setNotice(t("The send outcome is not confirmed here. Read the saved session and workspace calls; the service may have received it."));
                  await refresh(); await onChanged();
                });
              }}>{submitted ? t("Leave and read saved state") : t("Don't send")}</button>
          </div>
        </div>
      )}

      {operationView}{callHistory}
    </div>
  );
}
