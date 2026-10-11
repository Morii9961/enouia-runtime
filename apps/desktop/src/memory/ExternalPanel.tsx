// External text Provider controls for one session branch (ADR-032; Enouia
// Memory ADR-MEM-48). Every rule lives in the Core: the owner confirms a
// standing grant by its exact bytes, reads the exact request body before it
// is sent once, and closes an unknown call locally. Keys never reach this
// page; they are set in the native Windows credential prompt.
import { useCallback, useEffect, useState } from "react";
import { call, providerSetup, providerKey, type J } from "./client";
import { useAction, useLatestRead } from "./hooks";
import { ErrorBox, Operation, Tag, shortId } from "./ui";

type Branch = { sessionId: string; branchId: string };
type Native = { setup: typeof providerSetup; key: typeof providerKey };

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

export function ExternalPanel({ branch, text, invocations, onChanged, consumeText, request = call, native = { setup: providerSetup, key: providerKey } }: {
  branch: Branch;
  text: string;
  invocations: J[];
  onChanged: () => Promise<void>;
  consumeText: (submitted: string) => void;
  request?: typeof call;
  native?: Native;
}) {
  const [status, setStatus] = useState<J>(null);
  const [setup, setSetup] = useState<J>(null);
  const [api, setApi] = useState("");
  const [plan, setPlan] = useState<J>(null);
  const [prepared, setPrepared] = useState<J>(null);
  const [operation, setOperation] = useState<string | null>(null);
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
  ), [read.run, request, native]);
  useEffect(() => { void refresh(); }, [refresh]);
  // A prepared call and a held plan belong to the branch they came from.
  useEffect(() => { setPrepared(null); setPlan(null); setNotice(null); }, [branch.sessionId, branch.branchId]);

  if (read.error) return <ErrorBox error={read.error} />;
  if (!status) return <p role="status" className="mem-muted">Reading provider setup…</p>;
  if (!status.configured) {
    const why = setup?.state === "invalid" ? `${SETUP_TEXT.invalid} (${setup.rule})` : SETUP_TEXT.absent;
    return (
      <div className="mem-stack">
        <h3 className="mem-h3">External provider</h3>
        <p className="mem-muted">{why}</p>
      </div>
    );
  }
  const destination = status.destinations.find((d: J) => d.api === api);
  const grant = (status.grants ?? []).find((g: J) => g.active && g.destinations.some((d: J) => d.provider === api && d.model === destination?.model));
  const busy = action.busy || operation != null;
  const holdPlan = (command: string, args: Record<string, unknown>) =>
    void action.run(async () => { setNotice(null); setPlan(await request(command, args)); });

  return (
    <div className="mem-stack" aria-label="External provider">
      <h3 className="mem-h3">External provider</h3>
      <ErrorBox error={action.error} />
      {notice && <p className="mem-muted" role="status">{notice}</p>}

      <label className="mem-label" htmlFor="mem-ext-api">Provider</label>
      <select id="mem-ext-api" className="mem-input" value={api} disabled={busy} onChange={(e) => { setApi(e.target.value); setPrepared(null); }}>
        {status.destinations.map((d: J) => <option key={d.api} value={d.api}>{d.api} · {d.model}</option>)}
      </select>
      <div className="mem-actions">
        <button type="button" className="mem-button" disabled={busy}
          onClick={() => void action.run(async () => {
            const r = await native.key(api, "set");
            setNotice(r.cancelled ? "Key entry cancelled." : "Key saved in Windows Credential Manager.");
          })}>Set key…</button>
        <button type="button" className="mem-button" disabled={busy}
          onClick={() => void action.run(async () => {
            await native.key(api, "remove");
            setNotice("Key removed from this computer. This does not revoke it at the provider.");
            await refresh();
          })}>Remove key</button>
      </div>

      {grant
        ? <p className="mem-muted">Allowed by grant {shortId(grant.policyId)} (up to {grant.maxSensitivity}).{" "}
            <button type="button" className="mem-link" disabled={busy} onClick={() => holdPlan("egress_revoke_plan", { policyId: grant.policyId })}>Revoke…</button></p>
        : <div className="mem-stack">
            <p className="mem-muted">No grant allows sending to {api} yet. A grant lets this provider receive private memories and session text you include in a request.</p>
            <label className="mem-muted"><input type="checkbox" checked={extraction} disabled={busy} onChange={(e) => setExtraction(e.target.checked)} />{" "}
              Also allow suggesting memories from sources you select (extraction)</label>
            <div className="mem-actions">
              <button type="button" className="mem-button" disabled={busy}
                onClick={() => holdPlan("egress_grant_plan", { apis: [api], maxSensitivity: "private", extraction })}>Review a grant…</button>
            </div>
          </div>}

      {plan && (
        <div className="mem-stack" role="group" aria-label="Plan to confirm">
          <p><Tag tone="warn">{plan.kind}</Tag> Confirm exactly this content:</p>
          <pre className="mem-pre" tabIndex={0}>{plan.inspection}</pre>
          <div className="mem-actions">
            <button type="button" className="mem-button mem-primary" disabled={action.busy}
              onClick={() => void action.run(async (key) => {
                await request("provider_confirm", { planId: plan.planId, diffHash: plan.diffHash }, key);
                setPlan(null);
                await refresh();
                await onChanged();
              })}>Confirm</button>
            <button type="button" className="mem-button" disabled={action.busy} onClick={() => setPlan(null)}>Cancel</button>
          </div>
        </div>
      )}

      {!prepared && !operation && (
        <div className="mem-actions">
          <button type="button" className="mem-button" disabled={busy || !grant || !text.trim()}
            title={grant ? undefined : "A grant is needed first"}
            onClick={() => void action.run(async (key) => {
              const submitted = text;
              setNotice(null);
              const result = await request("external_prepare", {
                ...branch, text: submitted, api, policyId: grant.policyId,
                streaming: destination?.streaming === "supported",
                outputTokens: Math.min(1024, destination?.maxOutputTokens ?? 1024),
              }, key);
              consumeText(submitted);
              setPrepared(result);
              await onChanged();
            })}>Prepare the question for {api}…</button>
        </div>
      )}

      {prepared && (
        <div className="mem-stack" role="group" aria-label="Request to send">
          <p>This exact request goes to <span className="mem-mono">{prepared.endpoint}</span> ({prepared.model}), about {prepared.estimatedInputTokens} input tokens and at most {prepared.outputTokens} output tokens. It is sent once and never retried.</p>
          <pre className="mem-pre" tabIndex={0}>{prepared.body}</pre>
          <div className="mem-actions">
            <button type="button" className="mem-button mem-primary" disabled={action.busy}
              onClick={() => void action.run(async (key) => {
                const started = await request("external_send", { callId: prepared.callId, wireHash: prepared.wireHash }, key);
                setPrepared(null);
                setOperation(started.operationId);
              })}>Send once</button>
            <button type="button" className="mem-button" disabled={action.busy}
              onClick={() => { setPrepared(null); setNotice("Not sent. The question stays saved in this session."); }}>Don't send</button>
          </div>
        </div>
      )}

      {operation && <Operation id={operation} request={request} onDone={() => { setOperation(null); void onChanged(); }} />}

      {invocations.length > 0 && (
        <div className="mem-stack">
          <h4 className="mem-label">Provider calls in this session</h4>
          <ul className="mem-list">
            {invocations.map((i: J) => (
              <li key={i.dispatch_id}>
                <Tag tone={i.state === "completed" ? "ok" : "warn"}>{STATE_TEXT[i.state] ?? i.state}</Tag>{" "}
                {shortId(i.dispatch_id)} · reserved {i.reserved_tokens} tokens
                {i.input_tokens != null && ` · reported ${i.input_tokens} in / ${i.output_tokens ?? "?"} out`}
                {i.state === "outcome_unknown" && !operation && (
                  <>{" "}<button type="button" className="mem-link" disabled={busy}
                    onClick={() => holdPlan("external_interrupt_plan", { inputEventId: i.input_event_id, dispatchId: i.dispatch_id })}>Close locally…</button></>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
