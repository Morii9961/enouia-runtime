// ADR-041: Morii's local Agents (Claude Code, Codex) and their persistent
// grants on the registered library. Each change is planned by Core first and
// written only when Morii confirms the shown plan. Connecting an Agent's MCP
// pipe is a later step; this panel says so instead of implying a connection.
import { useCallback, useEffect, useState } from "react";
import { catalogAgents, type AgentGrantPlan, type AgentGrants } from "./catalog";
import { describe } from "./client";
import { recordTimeText, word } from "./catalogWords";
import { labels, msg, t } from "../i18n";

const ACTIONS = labels({ register: msg("Register…"), renew: msg("Renew for 90 days…"), refresh: msg("Update source scope…"), revoke: msg("Revoke…") });
type Action = keyof typeof ACTIONS;
const day = (at: string) => recordTimeText({ from: at, until: null, precision: "day", bound: "within", tz: null, basis: "source_time" });

export function AgentGrantsPanel() {
  const [grants, setGrants] = useState<AgentGrants | null>(null);
  const [plan, setPlan] = useState<AgentGrantPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await work(); } catch (cause) { setError(describe(cause)); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void run(async () => setGrants(await catalogAgents({ operation: "agent_status" }))); }, [run]);
  const propose = (agent: string, action: Action) => run(async () => setPlan(await catalogAgents({ operation: "agent_plan", agent, action })));
  const confirm = () => plan && run(async () => { setGrants(await catalogAgents({ operation: "agent_commit", plan_id: plan.plan_id })); setPlan(null); });
  return <section className="mem-stack" aria-label={t("Local Agents")} aria-busy={busy}>
    <div className="qr216"><span className="qr35">{t("Local Agents")}</span><span className="mem-stack">
      <span className="mem-muted">{t("Claude Code and Codex read this library through MCP under a grant: up to Private, 90 days, and they may only add notes, correction requests and forget requests. Connecting their MCP pipes is not available yet.")}</span>
      {grants?.agents.map(a => <span key={a.key} className="mem-stack">
        <strong>{a.name}</strong>
        <span role="status" className="mem-row-meta">{!a.grant ? t("Not registered") : !a.grant.active ? t("Revoked") :
          t("Registered · until {date} · up to {max} · {sources} sources · requests {requests}", { date: day(a.grant.valid_until), max: word(a.grant.max_sensitivity), sources: a.grant.sources, requests: t(a.grant.allow_requests ? "allowed" : "not allowed") })}</span>
        <span className="mem-actions">{(!a.grant ? ["register"] : a.grant.active ? ["renew", "refresh", "revoke"] : ["renew"]).map(action =>
          <button key={action} type="button" className="mem-link" disabled={busy || !!plan} onClick={() => void propose(a.key, action as Action)}>{t(ACTIONS[action as Action])}</button>)}</span>
      </span>)}
      {grants && grants.other_grants.length > 0 && <span className="mem-row-meta">{t("{n} other grants exist on this library without a name on this computer.", { n: grants.other_grants.length })}</span>}
      {plan && <span className="mem-card mem-stack" aria-label={t("Planned grant")}>
        <strong>{t("Planned grant: {agent} · {action}", { agent: grants?.agents.find(a => a.key === plan.agent)?.name ?? plan.agent, action: t(ACTIONS[plan.action as Action] ?? plan.action) })}</strong>
        <span className="mem-row-meta">{t("Revision {revision} · {state} · until {date} · up to {max} · {policies} policies · {sources} sources · requests {requests}",
          { revision: plan.revision, state: t(plan.active ? "active" : "revoked"), date: day(plan.valid_until), max: word(plan.max_sensitivity), policies: plan.policies, sources: plan.sources, requests: t(plan.allow_requests ? "allowed" : "not allowed") })}</span>
        <span className="mem-actions"><button type="button" className="mem-button mem-danger" disabled={busy} onClick={() => void confirm()}>{t("Confirm and write")}</button>
          <button type="button" className="mem-link" disabled={busy} onClick={() => setPlan(null)}>{t("Cancel")}</button></span>
      </span>}
      {error && <span role="alert">{error}</span>}
    </span></div>
  </section>;
}
