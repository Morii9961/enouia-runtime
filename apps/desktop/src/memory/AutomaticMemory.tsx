// A bounded Memory-region mount. The shared shell and browser demo are unchanged.
import { useCallback, useEffect, useRef, useState } from "react";
import { automationRead, snapshotKey } from "./automation";
import { describe, type J } from "./client";
import { useLatestRead } from "./hooks";
import { ErrorBox, Tag, shortId } from "./ui";
import { t } from '../i18n/index.ts';
const FILTER = { form: null, adoption: null, event_window: null, include_unknown_event_time: false };
export function AutomaticMemory({ read = automationRead }: { read?: typeof automationRead }) {
  const [status, setStatus] = useState<J>(null);
  const [page, setPage] = useState<J>(null);
  const [detail, setDetail] = useState<J>(null);
  const [absent, setAbsent] = useState(false);
  const [simulation, setSimulation] = useState<J>(null);
  const [cue, setCue] = useState("");
  const [observationError, setObservationError] = useState<{ cause: unknown } | null>(null);
  const reads = useLatestRead();
  const identity = useRef<string | null>(null);
  const lifecycleEpoch = useRef(0);
  const controlling = useRef(false);
  const cleared = useCallback(() => { reads.clear(); setPage(null); setDetail(null); setAbsent(false); setSimulation(null); identity.current = null; }, [reads.clear]);
  const pageRead = useCallback((cursor: J = null) => {
    setDetail(null); setAbsent(false); setSimulation(null);
    return reads.run(() => read({ operation: "page", filter: FILTER, cursor, limit: 16 }), result => {
      if (result.kind !== "automation_memory_page") throw new Error("Unexpected automatic Memory page");
      setPage(result);
    }, () => { setPage(null); identity.current = null; });
  }, [read, reads.run]);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const epoch = lifecycleEpoch.current;
      try {
        if (controlling.current) return;
        const next = await read({ operation: "status" });
        if (stopped || controlling.current || epoch !== lifecycleEpoch.current) return;
        if (next.kind !== "runtime_memory_automation_status") throw new Error("Unexpected automatic Memory status");
        setStatus(next); setObservationError(null);
        const snapshot = next.state === "open" ? snapshotKey(next.snapshot) : null;
        if (snapshot === null) cleared();
        else if (identity.current !== snapshot) {
          cleared(); identity.current = snapshot; await pageRead();
        }
      } catch (error) {
        if (!stopped && !controlling.current && epoch === lifecycleEpoch.current) {
          setStatus(null);
          // A contended probe cannot cancel an already authorized detail read.
          // Hide observations until a fresh successful probe confirms the same
          // snapshot. Revocation, lock, changed snapshots and other errors clear.
          if (error !== "automation_busy") cleared();
          setObservationError({ cause: error });
        }
      } finally { if (!stopped) timer = setTimeout(poll, 1500); }
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [read, cleared, pageRead]);
  const select = (item: J, sourceText = false) => {
    setDetail(null); setAbsent(false); setSimulation(null);
    void reads.run(() => read({ operation: "detail", memory_id: item.memory.memory_id, expected: page.snapshot, include_source_text: sourceText }), result => {
      if (result.kind === "automation_memory_absent") { setDetail(null); setAbsent(true); return; }
      if (result.kind !== "automation_memory_detail" || snapshotKey(result.snapshot) !== snapshotKey(page.snapshot)) throw new Error("Memory changed; refresh the list");
      setDetail(result);
    });
  };
  const control = async (operation: "lock" | "unlock") => {
    if (controlling.current) return;
    controlling.current = true; lifecycleEpoch.current += 1;
    cleared(); setStatus(null);
    try { await reads.run(() => read({ operation }), next => { setStatus(next); identity.current = null; }); }
    finally { controlling.current = false; lifecycleEpoch.current += 1; }
  };
  const open = status?.state === "open";
  return <>
    <div className="qr45" aria-busy={reads.busy}>
      <div className="qr31"><h2 className="qr29">{t("Automatic memories")}</h2><Tag tone="warn">{t("Isolated synthetic library")}</Tag></div>
      <div className="qr44 mem-pad">
        <p className="mem-content">{t("System formation preserves what the synthetic subject said. It is not independent verification or Owner confirmation.")}</p>
        <p className="mem-content">{t("This isolated library is separate from the Vault used by Context and Sessions.")}</p>
        {observationError && <p role="alert">{describe(observationError.cause)}</p>}
        <ErrorBox error={reads.error} />
        <p role="status">{status ? t("Library: {state}", { state: status.state }) : observationError ? t("Library state is unknown.") : t("Reading library state…")}</p>
        {open && reads.busy && <p role="status">{t("Reading…")}</p>}
        {status?.state === "disabled" && <p className="mem-content">{t("No synthetic library is enabled in this session.")}</p>}
        {status?.state === "failed" && <p className="mem-content">{t("The synthetic library is unavailable. Start a new synthetic session to recover.")}</p>}
        {open && <button className="mem-button" disabled={reads.busy} onClick={() => void pageRead()}>{t("Refresh automatic memories")}</button>}
        {(open || status?.state === "locked") && <button className="mem-button" disabled={reads.busy} onClick={() => control(open ? "lock" : "unlock")}>{t(open ? "Lock synthetic library" : "Unlock synthetic library")}</button>}
        {open && page && <>
          <p className="mem-content">{t("State observed at {time}", { time: page.authorized_at })}</p>
          <p className="mem-content">{t("{memories} currently authorized memories · {unknown} unknown event dates", { memories: page.matched_in_scope, unknown: page.unknown_event_time_in_scope })}</p>
          <p className="mem-content">{t(page.complete_in_scope ? "Complete in this authorized page scope" : "Partial page; more results are available")} · {t("Maintenance worker: {state}", { state: page.maintenance_worker_alive ? t("running") : t("stopped") })}</p>
          <ul className="mem-list">{page.items.map((item: J) => <li key={`${item.memory.memory_id}:${item.memory.revision}`}>
            <button className="mem-button" disabled={reads.busy} onClick={() => select(item)}>{item.content}</button>
            <p className="mem-content">{t("{kind} · {knowledge} · System {adoption} · validity {validity} · attention {attention}", { kind: item.dimensions.kind, knowledge: item.knowledge, adoption: item.adoption, validity: item.validity, attention: item.attention })}</p>
          </li>)}</ul>
          {page.items.length === 0 && !page.next && <p className="mem-content">{t("This synthetic library has no memories in the current authorized scope.")}</p>}
          {page.next && <button className="mem-button" disabled={reads.busy} onClick={() => void pageRead(page.next)}>{t("Next automatic page")}</button>}
          <form className="mem-stack" onSubmit={event => { event.preventDefault(); setSimulation(null); void reads.run(() => read({ operation: "simulate", query: { text: cue, conditions: [], event_window: null, at: page.authorized_at, intent: "current", limit: 8, max_bytes: 16384 } }), setSimulation); }}>
            <label className="mem-label">{t("Recall cue")} <input className="mem-input" value={cue} maxLength={2000} autoComplete="off" onChange={event => setCue(event.target.value)} /></label>
            <button className="mem-button" disabled={reads.busy || !cue.trim()}>{t("Simulate read-only recall")}</button>
          </form>
          {simulation && <section className="mem-stack" aria-label={t("Read-only recall result")}><Tag>{t("Native read · no saved experiment")}</Tag>{simulation.trace.selected.length ? <pre className="mem-source">{simulation.rendered_context}</pre> : <p className="mem-content">{t("No memory in the current authorized scope was selected for this cue.")}</p>}<p className="mem-content">{t("{selected} selected of {considered} currently authorized candidates.", { selected: simulation.trace.selected.length, considered: simulation.trace.considered })}</p></section>}
        </>}
      </div>
    </div>
    <aside className="qr88" aria-label={t("Automatic Memory Inspector")}><div className="qr79"><div className="mem-stack">
      {open && detail ? <>
        <h3>{detail.item.dimensions.kind}</h3><p className="mem-content">{detail.item.content}</p>
        <p className="mem-content">{t("Detail authorized at {time}", { time: detail.authorized_at })}</p>
        <p className="mem-content">{t("System formation · {knowledge} · System {adoption}", { knowledge: detail.item.knowledge, adoption: detail.item.adoption })}</p>
        <p className="mem-content">{t("Validity: {validity} · Attention: {attention}", { validity: detail.item.validity, attention: detail.item.attention })}</p>
        <p className="mem-content">{t("State: {state} · Occurrence: {occurrence}", { state: detail.item.dimensions.state ?? t("Unspecified"), occurrence: detail.item.dimensions.occurrence })}</p>
        <p className="mem-content">{t("Event range: {range}", { range: detail.item.dimensions.event_time ? JSON.stringify(detail.item.dimensions.event_time) : t("Unknown") })}</p>
        <p className="mem-content">{t("Valid range: {range}", { range: detail.item.dimensions.valid_time ? JSON.stringify(detail.item.dimensions.valid_time) : t("Unspecified") })}</p>
        <p className="mem-content">{t("Learned at: {time}", { time: detail.item.learned_at })}</p><p className="mem-content">{t("Source captured at: {time}", { time: detail.item.source_captured_at })}</p>
        <p className="mem-content">{t("Conditions: {conditions}", { conditions: detail.item.dimensions.conditions.join("; ") || t("None specified") })}</p>
        <p className="mem-content">{t("Stored commit: {commit} · rule {rule}", { commit: shortId(detail.item.committed_in), rule: detail.item.rule_version })}</p>
        <p className="mem-content">{t("{revisions} currently authorized revisions · {links} local derivation/reversion links", { revisions: detail.history.length, links: detail.neighbors.length })}</p>
        <p className="mem-content">{t("Policy {policy} · revision {revision}", { policy: shortId(detail.item.policy.policy_id), revision: detail.item.policy.revision })}</p>
        <p className="mem-content">{t("Witnessed System commit receipt · sequence {sequence}", { sequence: detail.item.receipt?.sequence ?? t("Unavailable") })}</p>
        <p className="mem-content">{t("{citations} supporting citations · {dependencies} analysis dependencies; dependency count is not independent corroboration.", { citations: detail.item.evidence.length, dependencies: detail.item.context_source_refs.length })}</p>
        <ul aria-label={t("Authorized revision history")}>{detail.history.map((item: J) => <li key={item.memory.revision}>
          {t("Revision {n}", { n: item.memory.revision })}: {item.content} · {item.knowledge} · {t("System {state}", { state: item.adoption })} · {t("learned {date}", { date: item.learned_at })}
        </li>)}</ul>
        <ul aria-label={t("Exact local provenance links")}>{detail.neighbors.map((link: J) => <li key={`${link.from.memory_id}:${link.from.revision}:${link.to.memory.memory_id}:${link.to.memory.revision}:${link.kind}`}>
          {link.kind}: {shortId(link.from.memory_id)} r{link.from.revision} → {shortId(link.to.memory.memory_id)} r{link.to.memory.revision}
        </li>)}</ul>
        {!detail.complete_in_scope && <p className="mem-content">{t("Partial detail within the authorized byte budget.")}</p>}
        <button className="mem-button" disabled={reads.busy} onClick={() => select(detail.item, true)}>{t("Read selected original sources")}</button>
        {detail.sources.map((source: J) => <section key={`${source.record.source_id}:${source.record.revision}`}>
          <p className="mem-content">{shortId(source.record.source_id)} · {source.record.speaker_role} · {source.record.evidence_class}</p>
          <p className="mem-content">{t(detail.item.evidence.some((e: J) => e.source_id === source.record.source_id && e.source_revision === source.record.revision) ? "Supporting citation" : detail.item.context_source_refs.some((e: J) => e.source_id === source.record.source_id && e.source_revision === source.record.revision) ? "Analysis dependency · not corroboration" : "Authorized historical dependency")}</p>
          {source.text !== null ? <pre className="mem-source">{source.text}</pre> : <p className="mem-content">{t("Original text has not been requested or was omitted by the byte budget.")}</p>}
        </section>)}
        <p className="mem-content">{t("Global timeline, global graph and saved experiments are unavailable.")}</p>
      </> : <p className="mem-content" role={open && absent ? "status" : undefined}>{t(open && absent ? "This memory is no longer in the current authorized scope. Refresh automatic memories to see the current list." : "Select an automatic memory to inspect its sources and state.")}</p>}
    </div></div></aside>
  </>;
}
