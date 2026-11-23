// ADR-041: Morii's local Agents (Claude Code, Codex) and their persistent
// grants on the registered library. Each change is planned by Core first and
// written only when Morii confirms the shown plan. Connecting an Agent's MCP
// pipe is a later step; this panel says so instead of implying a connection.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CATALOG_FILTER, catalogAgents, catalogRead, type AgentGrantPlan, type AgentGrants, type AgentRequest, type AgentRequests, type CatalogDetail } from "./catalog";
import { CorrectionPanel } from "./CorrectionPanel";
import { describe } from "./client";
import { recordTimeText, word } from "./catalogWords";
import { labels, msg, t } from "../i18n";

const ACTIONS = labels({ register: msg("Register…"), renew: msg("Renew for 90 days…"), refresh: msg("Include new sources…"), revoke: msg("Revoke…") });
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
      <span className="mem-muted">{t("Claude Code and Codex read this library through MCP under a grant: up to Private, 90 days, and they may only add notes, correction requests and forget requests. A registered Agent connects through its own local pipe while this library is open; locking or exiting disconnects it.")}</span>
      {grants?.agents.map(a => <span key={a.key} className="mem-stack">
        <strong>{a.name}</strong>
        <span role="status" className="mem-row-meta">{!a.grant ? t("Not registered") : !a.grant.active ? t("Revoked") :
          t("Registered · until {date} · up to {max} · {sources} sources · requests {requests}", { date: day(a.grant.valid_until), max: word(a.grant.max_sensitivity), sources: a.grant.sources, requests: t(a.grant.allow_requests ? "allowed" : "not allowed") })}</span>
        {a.grant?.active && a.coverage && <span className="mem-row-meta">{a.coverage.policies + a.coverage.sources === 0 ? t("Covers every current window and source.")
          : t("Missing {windows} new windows and {sources} new sources captured since this grant was written.", { windows: a.coverage.policies, sources: a.coverage.sources })}</span>}
        {a.grant?.active && a.pipe && grants.bridge.path && <McpConfig name={a.key} command={grants.bridge.path} args={["--protocol", grants.bridge.protocol, "--pipe", a.pipe, "--vault-id", grants.vault_id]} present={grants.bridge.present} />}
        <span className="mem-actions">{(!a.grant ? ["register"] : a.grant.active ? ["renew", ...(a.coverage?.refreshable ? ["refresh"] : []), "revoke"] : ["renew"]).map(action =>
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

// ADR-043 (D1b): what to paste into the Agent's own MCP settings. The bridge
// beside Runtime connects to this Agent's pipe; up to four sessions at once.
function McpConfig({ name, command, args, present }: { name: string; command: string; args: string[]; present: boolean }) {
  const quoted = (v: string) => /[\s"]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
  const claude = `claude mcp add enouia-memory -- ${[command, ...args].map(quoted).join(" ")}`;
  const codex = `[mcp_servers.enouia-memory]\ncommand = '${command}'\nargs = [${args.map(a => JSON.stringify(a)).join(", ")}]`;
  return <span className="mem-stack" aria-label={t("MCP configuration")}>
    {!present && <span role="note" className="mem-row-meta">{t("The bridge program is not next to this copy of Runtime, so the Agent cannot connect from it yet.")}</span>}
    <span className="mem-row-meta">{t("Claude Code: run once in a terminal")}</span>
    <pre className="mem-content" data-agent={name}>{claude}</pre>
    <span className="mem-row-meta">{t("Codex: add to ~/.codex/config.toml")}</span>
    <pre className="mem-content">{codex}</pre>
    <span className="mem-row-meta">{t("Up to four sessions of each Agent can be connected at once; a fifth waits a few seconds and then fails.")}</span>
  </span>;
}

// ADR-042 (D2): correction and forget requests the Agents saved. A request
// changes nothing by itself; Morii reviews it as an ordinary planned change
// (prefilled from the Agent's proposal, editable) or ignores it on this computer.
export function AgentRequestsPanel() {
  const [queue, setQueue] = useState<AgentRequests | null>(null);
  const [review, setReview] = useState<{ request: AgentRequest; detail: CatalogDetail } | null>(null);
  const [showIgnored, setShowIgnored] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await work(); } catch (cause) { setError(describe(cause)); } finally { setBusy(false); }
  }, []);
  const load = useCallback(() => run(async () => setQueue(await catalogAgents({ operation: "agent_requests" }))), [run]);
  useEffect(() => { void load(); }, [load]);
  const open = (request: AgentRequest) => run(async () => {
    setNotice(null);
    setReview({ request, detail: await catalogRead({ operation: "detail", filter: CATALOG_FILTER, memory_id: request.target.memory.memory_id }) });
  });
  const ignore = (request: AgentRequest, ignored: boolean) => run(async () => {
    setQueue(await catalogAgents({ operation: "agent_request_ignore", key: request.key, ignored }));
    if (review?.request.key === request.key) setReview(null);
  });
  const done = () => { setReview(null); setNotice(t("Written. The request is resolved and leaves the queue.")); void load(); };
  const items = queue?.items ?? [];
  const waiting = items.filter(r => r.pending && !r.ignored);
  const ignored = items.filter(r => r.pending && r.ignored);
  const resolved = items.length - waiting.length - ignored.length;
  const kind = (r: AgentRequest) => t(r.kind === "correction" ? "Correction request" : "Forget request");
  const row = (r: AgentRequest, actions: ReactNode) => <li key={r.key} className="mem-card mem-stack">
    <strong>{t("{agent}: {kind}", { agent: r.agent ?? t("Unnamed Agent"), kind: kind(r) })}</strong>
    <span className="mem-row-meta mem-content">{r.target.memory.memory_id} · r{r.target.memory.revision}</span>
    <span className="mem-label">{t("Your words it cites")}</span><blockquote className="mem-content">{r.evidence.quote}</blockquote>
    <span className="mem-label">{t(r.kind === "correction" ? "Its proposed correction (not checked)" : "Its reason (not checked)")}</span><p className="mem-content">{r.text}</p>
    <span className="mem-actions">{actions}</span>
  </li>;
  return <section className="mem-stack" aria-label={t("Agent requests")} aria-busy={busy}>
    <div className="qr216"><span className="qr35">{t("Agent requests")}</span><span className="mem-stack">
      <span className="mem-muted">{t("Agents can only ask. Nothing changes until you review a request and confirm the planned change here.")}</span>
      {queue && <span role="status" className="mem-row-meta">{t("{open} waiting · {ignored} ignored · {resolved} resolved", { open: waiting.length, ignored: ignored.length, resolved })}</span>}
      {waiting.length > 0 && <ul className="mem-list">{waiting.map(r => row(r, <>
        <button type="button" className="mem-button" disabled={busy} onClick={() => void open(r)}>{t("Review…")}</button>
        <button type="button" className="mem-link" disabled={busy} onClick={() => void ignore(r, true)}>{t("Ignore")}</button></>))}</ul>}
      {review && <CorrectionPanel key={review.request.key} detail={review.detail} entities={[]} onDone={done}
        start={review.request.kind === "correction" ? { kind: "correct", text: review.request.text } : { kind: "forget" }} />}
      {review && !review.detail.item && <span role="status">{t("This record is no longer available in the current scope.")}</span>}
      {ignored.length > 0 && <button type="button" className="mem-link" aria-expanded={showIgnored} onClick={() => setShowIgnored(!showIgnored)}>{t(showIgnored ? "Hide ignored" : "Show ignored")}</button>}
      {showIgnored && <ul className="mem-list">{ignored.map(r => row(r, <button type="button" className="mem-link" disabled={busy} onClick={() => void ignore(r, false)}>{t("Return to queue")}</button>))}</ul>}
      {notice && <span role="status">{notice}</span>}
      {error && <span role="alert">{error}</span>}
    </span></div>
  </section>;
}
