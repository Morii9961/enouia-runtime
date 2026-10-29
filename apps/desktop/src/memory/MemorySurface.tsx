// Memory Vault surface backed by the pinned Enouia Memory Core (ADR-025).
// Layout follows the Quiet Runtime Memory Vault: collections on the left,
// the selected collection in the middle, an inspector on the right. The
// behaviour is ported from Memory's reference workspace: stale-read guards,
// one idempotency key per submission, drafts kept across retries, plan
// dialogs that confirm only the shown diff.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { call, pick, type J, type Picked } from "./client";
import { useAction, useLatestRead } from "./hooks";
import { ComponentList, StatusPending, VaultConnect, VaultGate, exiting, useStatus } from "./status";
import { ErrorBox, Operation, PlanDialog, Source, Tag, shortId, when } from "./ui";
import { CandidateSource } from "./CandidateSource";
import { CandidateConflict } from "./CandidateConflict";
import { memoryObservation } from "./observationIdentity";
import { validImportAlias } from "./importAlias";
import { ImportReport } from "./ImportReport";
import { HistoryTasks, useHistoryTasks } from "./HistoryTaskPanel";
import { AutomaticMemory } from "./AutomaticMemory";

import { labels, msg, t, tn } from '../i18n/index.ts';
type Collection = "inbox" | "current" | "history" | "import" | "vault" | "automated";

const TITLES: Record<Collection, string> = labels({
  automated: msg("Synthetic automatic memories"),
  inbox: msg("Candidate inbox"),
  current: msg("Current memories"),
  history: msg("Including history"),
  import: msg("Import"),
  vault: msg("Vault & recovery"),
});

function dayOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function MemorySurface({ initialCollection = "current", openSession }: {
  initialCollection?: "current" | "inbox"; openSession?: (vaultId: string, sessionId: string) => void;
}) {
  const { status, vaultChanging } = useStatus();
  const [collection, setCollection] = useState<Collection>(initialCollection);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState({ text: "", seq: 0 });
  const open = status?.vault?.state === "open";
  const pending: number | null = status?.pendingCandidates ?? null;
  const groups: { label: string; items: [Collection, string, ReactNode?][] }[] = [
    { label: t("Review"), items: [["inbox", TITLES.inbox, open && pending != null ? pending : "—"]] },
    { label: t("Canonical"), items: [["current", TITLES.current], ["history", TITLES.history]] },
    { label: t("Automatic"), items: [["automated", TITLES.automated]] },
    { label: t("Vault"), items: [["import", TITLES.import], ["vault", TITLES.vault, status?.vault?.state ?? "—"]] },
  ];
  const explorer = collection === "current" || collection === "history";
  return (
    <section data-screen-label="Memory Vault" className="qr89">
      <aside className="qr28">
        <div className="qr20">
          <h1 className="qr18">{t("Memory Vault")}</h1>
          <div className="qr19">{t("What I keep, and why.")}</div>
        </div>
        <form role="search" className="qr22" onSubmit={(e) => {
          e.preventDefault();
          if (!explorer) setCollection("current");
          setSubmitted((s) => ({ text: query, seq: s.seq + 1 }));
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#7F8D9A" strokeWidth="1.2" aria-hidden="true">
            <circle cx="6" cy="6" r="4.2" /><path d="M9.2 9.2L12.5 12.5" />
          </svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Literal search · Enter")} aria-label={t("Search memories")} className="qr21" autoComplete="off" />
        </form>
        {groups.map((g) => (
          <div className="qr27" key={g.label}>
            <div className="qr23">{g.label}</div>
            {g.items.map(([key, label, count]) => {
              const active = collection === key;
              return (
                <button key={key} type="button" className="qr26" aria-pressed={active} onClick={() => setCollection(key)}
                  style={{ background: active ? "#17212B" : "transparent", color: active ? "#E7EDF2" : "#9BA9B6" }}>
                  <span className="qr24">{label}</span>
                  {count != null && <span className="qr25" style={{ color: key === "inbox" && open && (pending ?? 0) > 0 ? "#EEE7DC" : "#61707D" }}>{count}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </aside>
      {collection === "automated" ? <AutomaticMemory /> : status && (vaultChanging || exiting(status)) ? (
        <>
          <div className="qr45"><VaultGate>{null}</VaultGate></div>
          <Inspector><ComponentList status={status} /></Inspector>
        </>
      ) : collection === "vault" ? (
        <VaultPanel />
      ) : !open ? (
        <>
          <div className="qr45"><div className="mem-gate">{status ? <VaultConnect /> : <StatusPending />}</div></div>
          <aside aria-label={t("Memory Inspector")} className="qr88"><div className="qr46">{t("Open a Vault to see its memories.")}</div></aside>
        </>
      ) : explorer ? (
        <Explorer key={`${collection}:${submitted.seq}`} history={collection === "history"} submitted={submitted}
          onRefresh={() => setSubmitted((current) => ({ ...current, seq: current.seq + 1 }))} />
      ) : collection === "inbox" ? (
        <Inbox />
      ) : (
        <Import key={status.vault.vaultId} openSession={openSession} />
      )}
    </section>
  );
}

function Center({ title, count, children, busy }: { title: string; count?: string; children: ReactNode; busy?: boolean }) {
  return (
    <div className="qr45" aria-busy={busy}>
      <div className="qr31">
        <h2 id="mem-center-title" className="qr29" tabIndex={-1}>{title}</h2>
        {count && <div className="qr19">{count}</div>}
        <div className="qr30" />
      </div>
      <div className="qr44">{children}</div>
    </div>
  );
}

function Inspector({ children }: { children: ReactNode }) {
  return <aside aria-label={t("Memory Inspector")} className="qr88"><div className="qr79">{children}</div></aside>;
}

export function Explorer({ history, submitted, onRefresh, readPage = call }: {
  history: boolean; submitted: { text: string; seq: number }; onRefresh: () => void; readPage?: typeof call;
}) {
  const [rows, setRows] = useState<J[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  // A confirmed deletion removes the inspector holding the dialog's trigger,
  // the last page removes Load more, and Refresh remounts this explorer.
  // Focus waits for the latest read, then returns to its trigger if that
  // still exists, or to a fallback, unless the reader has moved elsewhere.
  const focusAfterRead = useRef<{ trigger: HTMLElement | null; fallback: () => HTMLElement | null } | null>(null);
  const refreshControl = useRef<HTMLButtonElement>(null);
  const resultsTitle = () => document.getElementById("mem-center-title");
  const read = useLatestRead();
  const query = submitted.text.trim() ? submitted.text : "";
  const load = useCallback((cursor: string | null) =>
    void read.run(() => query
      ? readPage("memory_search", { query, includeHistorical: history, cursor, limit: 25 })
      : readPage("memory_list", { includeInactive: history, cursor, limit: 25 }), (page) => {
      setRows((current) => cursor ? [...current, ...page.items] : page.items);
      setNext(page.nextCursor);
      setTotal(page.total ?? null);
      setLoaded(true);
    }), [query, history, readPage, read.run]);
  useEffect(() => { load(null); }, [load, submitted.seq]);
  useEffect(() => {
    if (document.activeElement === document.body) focusAfterRead.current = { trigger: null, fallback: () => refreshControl.current };
  }, []);
  useEffect(() => {
    const intent = focusAfterRead.current;
    if (read.busy || read.pending.current || !intent) return;
    focusAfterRead.current = null;
    if (document.activeElement !== document.body && document.activeElement !== intent.trigger) return;
    if (intent.trigger?.isConnected) intent.trigger.focus(); else intent.fallback()?.focus();
  }, [rows, read.busy, read.error]);
  const choose = (id: string) => { if (id !== selected) setNotice(""); setSelected(id); };
  const ids = rows.map((r) => r.memoryId);
  const move = (e: KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button.qr43"));
    const from = (e.target as HTMLElement).closest<HTMLButtonElement>("button.qr43");
    const i = from ? buttons.indexOf(from) : selected ? ids.indexOf(selected) : -1;
    const index = Math.max(0, Math.min(ids.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
    const n = ids[index];
    if (n) { e.preventDefault(); choose(n); buttons[index]?.focus(); }
  };
  // A list is sorted by update time, so it groups into days. Search results
  // are ranked by relevance and stay one flat group in rank order.
  const days: { label: string; items: J[] }[] = [];
  if (query) {
    if (rows.length) days.push({ label: t("Ranked by relevance"), items: rows });
  } else {
    for (const row of rows) {
      const label = row.updatedAt ? dayOf(row.updatedAt) : t("Undated");
      const last = days[days.length - 1];
      if (last && last.label === label) last.items.push(row); else days.push({ label, items: [row] });
    }
  }
  const title = query ? `“${query}”${history ? " · " + t("with history") : ""}` : history ? TITLES.history : TITLES.current;
  const count = loaded
    ? (total != null ? tn(rows.length, "{n} of {total} record", "{n} of {total} records", { total }) : tn(rows.length, "{n} record", "{n} records"))
    : read.error ? t("Results unavailable") : t("Waiting for memories");
  return (
    <>
      <Center title={title} count={count} busy={read.busy}>
        <div className="mem-pad mem-actions"><button ref={refreshControl} type="button" className="mem-button" disabled={read.busy} onClick={onRefresh}>{t("Refresh results")}</button></div>
        {notice && <p role="status" className="mem-note mem-pad">{notice}</p>}
        <ErrorBox error={read.error} />
        {read.busy && <p role="status" className="mem-muted mem-pad">{t("Reading memories…")}</p>}
        {loaded && !read.busy && !read.error && rows.length === 0 && <div className="qr32">{query ? t("Nothing matches this search.") : t("No approved memories here yet.")}</div>}
        <div onKeyDown={move}>
          {days.map((d, i) => (
            <div key={`${i}:${d.label}`}>
              <div className="qr33">{d.label}</div>
              {d.items.map((m) => (
                <button key={m.memoryId} type="button" className="qr43" aria-pressed={selected === m.memoryId}
                  style={{ background: selected === m.memoryId ? "#17212B" : "transparent" }} onClick={() => choose(m.memoryId)}>
                  <span className="qr34">{!query && m.updatedAt ? when(m.updatedAt).slice(11) : ""}</span>
                  <span className="qr42">
                    <span className="qr38">
                      <span>{m.type}</span>
                      {m.status && m.status !== "active" && <Tag>{m.status}</Tag>}
                      {m.currency && m.currency !== "current" && <Tag>{m.currency}</Tag>}
                      {m.expired && <Tag tone="warn">{t("expired")}</Tag>}
                      {m.conflicted && <Tag tone="warn">{t("conflict")}</Tag>}
                      {m.sourceMissing && <Tag tone="warn">{t("source missing")}</Tag>}
                    </span>
                    <span className="qr39">{m.snippet}</span>
                    <span className="qr41"><span className="qr25">{shortId(m.memoryId)}</span>{m.revision != null && <span>r{m.revision}</span>}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
        {next && <div className="mem-pad"><button type="button" className="mem-button" disabled={read.busy} onClick={(e) => {
          focusAfterRead.current = { trigger: e.currentTarget, fallback: resultsTitle };
          load(next);
        }}>{t("Load more")}</button></div>}
      </Center>
      {selected
        ? <MemoryDetail key={selected} id={selected} onChanged={(purge) => {
          setNotice(purge ? t("Permanent purge confirmed by Memory.") : t("Forget confirmed by Memory."));
          focusAfterRead.current = { trigger: null, fallback: resultsTitle };
          setSelected(null); load(null);
        }} />
        : <aside aria-label={t("Memory Inspector")} className="qr88"><div className="qr46">{t("Select a memory to see where it came from.")}</div></aside>}
    </>
  );
}

export function MemoryDetail({ id, onChanged, readPage = call }: { id: string; onChanged: (purge: boolean) => void; readPage?: typeof call }) {
  const { refresh } = useStatus();
  const [detail, setDetail] = useState<J>(null);
  const [correction, setCorrection] = useState("");
  const [impact, setImpact] = useState<J>(null);
  const [plan, setPlan] = useState<J>(null);
  const [note, setNote] = useState("");
  const planTrigger = useRef<HTMLElement | null>(null);
  const action = useAction();
  const reads = useLatestRead();
  const returnFocus = useReturnFocus(!action.busy && !reads.busy);
  const readAgain = useRef<HTMLButtonElement>(null);
  const correctionInput = useRef<HTMLTextAreaElement>(null);
  const load = useCallback(() => {
    setDetail(null); setImpact(null);
    void reads.run(async () => memoryObservation(await readPage("memory_read", { memoryId: id }), id), setDetail);
  }, [id, readPage, reads.run]);
  useEffect(load, [load]);
  const forget = (mode: "forget" | "purge") => {
    if (action.busy || reads.pending.current || reads.error || !detail) return;
    setNote("");
    planTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void action.run(async (key) => setPlan(await readPage("forget_plan", { memoryId: id, mode, withDependents: false }, key)));
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(id); setNote(t("ID copied.")); }
    catch { setNote(t("Could not copy. Select the ID and copy it manually.")); }
  };
  const observation = <div className="mem-stack">
    <button ref={readAgain} type="button" className="mem-button" disabled={action.busy || reads.busy || !!plan} onClick={() => { if (!action.busy && !plan) { returnFocus(() => readAgain.current); load(); } }}>{t("Read memory again")}</button>
    <ErrorBox error={reads.error} />
    {reads.busy && <p role="status" className="mem-muted">{t("Reading the memory…")}</p>}
    {reads.error && <p className="mem-muted">{t("This saved memory could not be read. Read it again before starting another correction or deletion. Unsent correction text is kept.")}</p>}
  </div>;
  if (!detail) return <Inspector>{observation}</Inspector>;
  const r = detail.record;
  const s = detail.summary;
  return (
    <Inspector>
      {observation}
      <div className="mem-stack">
        <div className="mem-row-meta">
          <Tag tone={s.status === "active" ? "ok" : "muted"}>{s.status}</Tag>
          <Tag>{s.type}</Tag>
          {s.expired && <Tag tone="warn">{t("expired")}</Tag>}
          {s.conflicted && <Tag tone="warn">{t("conflict")}</Tag>}
          {s.sourceMissing && <Tag tone="warn">{t("source missing")}</Tag>}
        </div>
        {r.title && <h3 className="mem-h3">{r.title}</h3>}
        <p className="mem-content">{r.content}</p>
        <dl className="mem-facts">
          <dt>{t("Memory")}</dt><dd><code title={r.memory_id}>{shortId(r.memory_id)}</code> <button type="button" className="mem-link" onClick={() => void copy()}>{t("Copy ID")}</button></dd>
          <dt>{t("Revision")}</dt><dd>r{r.revision}</dd>
          <dt>{t("Approved")}</dt><dd>{when(r.approved_at)}</dd>
          {r.supersedes.length > 0 && <><dt>{t("Supersedes")}</dt><dd>{r.supersedes.map((x: J) => `${shortId(x.memory_id)} r${x.revision}`).join(", ")}</dd></>}
          {detail.supersededBy.length > 0 && <><dt>{t("Superseded by")}</dt><dd>{detail.supersededBy.map(shortId).join(", ")}</dd></>}
        </dl>
      </div>
      <div className="mem-stack">
        <h4 className="mem-h4">{t("Evidence")}</h4>
        <ul className="mem-list">{detail.evidence.map((e: J, i: number) => <Source key={i} evidence={e} readPage={readPage} />)}</ul>
      </div>
      <div className="mem-stack">
        <h4 className="mem-h4">{t("Correct")}</h4>
        <label htmlFor="mem-fix" className="mem-sr">{t("Corrected content")}</label>
        <textarea ref={correctionInput} id="mem-fix" className="mem-textarea" value={correction} onChange={(e) => setCorrection(e.target.value)}
          placeholder={t("Write the correct content. It becomes a candidate for review; the memory itself is not rewritten.")} />
        <div className="mem-actions">
          <button type="button" className="mem-button" disabled={!correction.trim() || action.busy} onClick={() => { returnFocus(() => correctionInput.current); void action.run(async (key) => {
            if (reads.pending.current || reads.error) return;
            await readPage("correction_propose", { memoryId: id, revision: r.revision, text: correction }, key);
            setCorrection((current) => current === correction ? "" : current);
            setNote(t("Correction proposed. Review it in the candidate inbox."));
          }); }}>{t("Propose correction")}</button>
          <button type="button" className="mem-button" disabled={action.busy}
            onClick={() => { if (!reads.pending.current && !reads.error) { returnFocus(() => readAgain.current); void action.run(async () => setImpact(await readPage("delete_preview", { memoryId: id, withDependents: false }))); } }}>{t("Delete impact")}</button>
          <button type="button" className="mem-button" disabled={action.busy} onClick={() => forget("forget")}>{t("Forget…")}</button>
          <button type="button" className="mem-button mem-danger" disabled={action.busy} onClick={() => forget("purge")}>{t("Purge…")}</button>
        </div>
        {note && <p role="status" className="mem-note">{note}</p>}
        {action.busy && <p role="status" className="mem-muted">Waiting for Memory to return the requested result…</p>}
        <ErrorBox error={action.error} />
        {impact && (
          <p className="mem-card">
            {t("A purge removes {records} and {objects}; {others} would lose a recorded source (cited evidence or read context).", { records: tn(impact.targets.length, "{n} record", "{n} records"), objects: tn(impact.objectCount, "{n} object", "{n} objects"), others: tn(impact.losingProvenance.length, "{n} other memory", "{n} other memories") })}
          </p>
        )}
      </div>
      {plan && <PlanDialog key={plan.planId} plan={plan} returnFocus={planTrigger.current} request={readPage}
        onClose={(done) => {
          setPlan(null);
          void refresh();
          if (done) onChanged(plan.purge === true);
          else setNote(t("Confirmation cancelled. The deletion candidate remains in the candidate inbox."));
        }} />}
    </Inspector>
  );
}

export function Inbox({ readPage = call }: { readPage?: typeof call }) {
  const { refresh } = useStatus();
  const [items, setItems] = useState<J[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [readingMore, setReadingMore] = useState(false);
  const [coreOnly, setCoreOnly] = useState(false);
  const [plan, setPlan] = useState<J>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [claim, setClaim] = useState("");
  const focusAfterCommit = useRef(false);
  const focusAfterRefresh = useRef<HTMLElement | null>(null);
  const planTrigger = useRef<HTMLElement | null>(null);
  const action = useAction();
  const reads = useLatestRead();
  const load = useCallback((cursor: string | null = null) => {
    setReadingMore(cursor != null);
    return reads.run(() => readPage("candidate_list", { cursor, limit: 50 }), (page) => {
      setItems(previous => cursor ? [...previous, ...page.items] : page.items);
      setNext(page.nextCursor);
      setTotal(page.total);
    });
  }, [readPage, reads.run]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    // A preceding render's effect may run after another read has started.
    // Keep its pending focus target until that actual read settles.
    if (reads.busy || reads.pending.current) return;
    const trigger = focusAfterRefresh.current;
    const restoreReadFocus = trigger && (document.activeElement === document.body || document.activeElement === trigger);
    if (focusAfterCommit.current || (restoreReadFocus && !trigger.isConnected)) {
      document.getElementById("mem-center-title")?.focus();
    } else if (restoreReadFocus) trigger.focus();
    focusAfterCommit.current = false;
    focusAfterRefresh.current = null;
  }, [items, reads.busy]);
  const actionsBlocked = action.busy || reads.busy || !!reads.error || !!plan;
  const visibleItems = coreOnly ? items.filter(candidate => candidate.details?.priority === "P0") : items;
  const cannotAct = () => action.busy || reads.pending.current || !!reads.error || !!plan;
  // A held retry keeps its original arguments/key, but admission depends on
  // the current list observation and dialog owner, just like a fresh action.
  const actionError = action.error && {
    ...action.error,
    retry: action.error.retry && !actionsBlocked ? () => { if (!cannotAct()) action.error?.retry?.(); } : undefined,
  };
  const observe = (cursor: string | null) => {
    if (action.busy || plan || reads.pending.current || (cursor && reads.error)) return;
    focusAfterRefresh.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void load(cursor);
  };
  const decide = (c: J, act: string) => {
    const editedContent = act === "edit_accept" ? edits[c.candidateId] ?? c.content : null;
    if (cannotAct() || editedContent === "") return;
    planTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void action.run(async () =>
      setPlan(await readPage("review_plan", { decisions: [{
        candidateId: c.candidateId, revision: c.revision, action: act,
        editedContent, mergeTarget: null,
      }] })),
    );
  };
  return (
    <>
      <Center title={TITLES.inbox} count={reads.error ? t("Candidates unavailable") : total == null ? t("Waiting for candidates") : coreOnly ? t("{total} waiting · {loaded} loaded · {n} P0 shown", { total, loaded: items.length, n: visibleItems.length }) : t("{total} waiting · {n} shown", { total, n: items.length })}
        busy={action.busy || reads.busy || (total == null && !reads.error)}>
        <div className="mem-pad mem-actions"><button type="button" className="mem-button" disabled={action.busy || reads.busy || !!plan}
          onClick={() => observe(null)}>{t("Refresh candidates")}</button>
          <label className="mem-row-meta"><input type="checkbox" aria-label={t("Show P0 core candidates")} checked={coreOnly} disabled={actionsBlocked}
            onChange={event => setCoreOnly(event.target.checked)} />{t("P0 core from loaded candidates")}</label></div>
        {coreOnly && <p className="mem-muted mem-pad">{t("P0 is a saved proposal priority, not approval. Only loaded candidates are filtered.")}</p>}
        <ErrorBox error={actionError} />
        <ErrorBox error={reads.error} />
        {(reads.busy || (total == null && !reads.error)) && <p role="status" className="mem-muted mem-pad">{total == null ? t("Reading candidates…") : readingMore ? t("Reading more candidates…") : t("Refreshing candidates…")}</p>}
        {reads.error && items.length > 0 && <p role="status" className="mem-muted mem-pad">{t("Previous candidate observation. Refresh candidates before reviewing or saving another candidate. Unsent edits are kept.")}</p>}
        {total != null && !reads.busy && !reads.error && items.length === 0 && <div className="qr32">{t("Nothing waiting for review.")}</div>}
        {coreOnly && !reads.busy && !reads.error && items.length > 0 && visibleItems.length === 0 && <p className="mem-muted mem-pad">{t("No P0 core candidates in the loaded rows.")}{next && " " + t("Load more candidates to continue checking.")}</p>}
        {visibleItems.map((c) => {
          const draft = edits[c.candidateId] ?? c.content;
          return (
            <article key={c.candidateId} className="mem-candidate" aria-label={t('Candidate {id}', { id: c.candidateId })}>
              <div className="mem-row-meta">
                <code title={c.candidateId}>{shortId(c.candidateId)}</code><span>r{c.revision}</span>
                <Tag>{c.proposalKind}</Tag><Tag>{c.proposedType}</Tag><Tag>{c.sensitivity}</Tag>
                <span className="mem-muted">{c.originKind} · {when(c.createdAt)}</span>
                {["P0", "P1", "P2"].includes(c.details?.priority) && <Tag>Proposed priority {c.details.priority}</Tag>}
              </div>
              {typeof c.details?.title === "string" && <h3 className="mem-h3">{c.details.title}</h3>}
              {typeof c.reason === "string" && c.reason.length > 0 && <details className="mem-stack mem-reason">
                <summary>{t("Saved proposal reason")}</summary>
                <p className="mem-muted">{t("A recorded explanation for this proposal. Compare it with the source and reported conflicts before deciding.")}</p>
                <p className="mem-content">{c.reason}</p>
              </details>}
              {c.target && <p className="mem-old">Current fact (r{c.target.revision}): {c.target.content}</p>}
              <label htmlFor={`mem-e-${c.candidateId}`} className="mem-sr">{t("Candidate content")}</label>
              <textarea id={`mem-e-${c.candidateId}`} className="mem-textarea" value={draft}
                onChange={(e) => setEdits({ ...edits, [c.candidateId]: e.target.value })} />
              <p className="mem-muted">
                {tn(c.evidence.length, "{n} evidence reference", "{n} evidence references")}
                {c.conflicts.length > 0 && <span className="mem-warn"> · {c.conflicts.length} conflict{c.conflicts.length === 1 ? "" : "s"}</span>}
              </p>
              <ul className="mem-list">{c.evidence.map((e: J, i: number) => <CandidateSource
                key={`${c.revision}:${e.sourceId}:${e.sourceRevision}:${i}`} evidence={e} readPage={readPage} />)}</ul>
              <section className="mem-stack" aria-label="Recorded context dependencies">
                <h3 className="mem-h3">Recorded context dependencies</h3>
                <p className="mem-muted">These sources were recorded as input context. They are not additional citations, corroboration or approval. This list does not establish complete reading history.</p>
                {Array.isArray(c.contextSources) ? c.contextSources.length > 0 ? (
                  <ul className="mem-list">{c.contextSources.map((source: J, i: number) => <CandidateSource
                    key={`context:${c.revision}:${source.sourceId}:${source.sourceRevision}:${i}`}
                    evidence={source} kind="context" readPage={readPage} />)}</ul>
                ) : <p className="mem-muted">No context dependencies were recorded.</p>
                  : <p className="mem-muted">This Core did not report context dependency information.</p>}
              </section>
              {c.conflicts.length > 0 && <div className="mem-stack">
                <h3 className="mem-h3">{t("Reported conflicts")}</h3>
                <p className="mem-muted">{t("Read the current saved records before deciding. Reading does not merge, approve or resolve a conflict.")}</p>
                <ul className="mem-list">{c.conflicts.map((conflict: J, i: number) => <CandidateConflict
                  key={`${c.revision}:${conflict.memory_id}:${conflict.revision}:${i}`} conflict={conflict} readPage={readPage} />)}</ul>
              </div>}
              <div className="mem-actions">
                <button type="button" className="mem-button mem-primary" disabled={actionsBlocked || draft === ""}
                  onClick={() => decide(c, draft !== c.content ? "edit_accept" : "accept")}>{draft !== c.content ? t("Accept with edits…") : t("Accept…")}</button>
                <button type="button" className="mem-button" disabled={actionsBlocked} onClick={() => decide(c, "reject")}>{t("Reject…")}</button>
              </div>
            </article>
          );
        })}
        {next && <div className="mem-pad"><button type="button" className="mem-button" disabled={action.busy || reads.busy || !!plan || !!reads.error}
          onClick={() => observe(next)}>{t("Load more candidates")}</button></div>}
      </Center>
      <Inspector>
        <form className="mem-stack" onSubmit={(e) => {
          e.preventDefault();
          if (cannotAct() || !text.trim() || !claim.trim()) return;
          void action.run(async (key) => {
            await readPage("remember", { text, claimKey: claim }, key);
            setText((current) => current === text ? "" : current);
            setClaim((current) => current === claim ? "" : current);
            await load();
            await refresh();
          });
        }}>
          <h3 className="mem-h3">{t("Remember something")}</h3>
          <p className="mem-muted">{t("Your words are saved as a source first, then proposed as a candidate here. Nothing becomes a memory until you accept it.")}</p>
          <label className="mem-label" htmlFor="mem-remember">{t("Statement")}</label>
          <textarea id="mem-remember" className="mem-textarea" value={text} onChange={(e) => setText(e.target.value)} />
          <label className="mem-label" htmlFor="mem-claim">{t("Topic key")}</label>
          <input id="mem-claim" className="mem-input" value={claim} onChange={(e) => setClaim(e.target.value)} placeholder={t("for example preference.reading")} autoComplete="off" />
          <div className="mem-actions">
            <button type="submit" className="mem-button mem-primary" disabled={!text.trim() || !claim.trim() || actionsBlocked}>{t("Save as candidate")}</button>
          </div>
        </form>
      </Inspector>
      {plan && <PlanDialog key={plan.planId} plan={plan} returnFocus={planTrigger.current} request={readPage} onClose={(committed) => {
        setPlan(null);
        if (committed !== null) focusAfterCommit.current = true;
        else focusAfterRefresh.current = planTrigger.current;
        void load(); void refresh();
      }} />}
    </>
  );
}

// Operations can overlap. Each started one keeps its watcher, Cancel and
// result; a newer run of one kind supersedes only that kind's finished result.
function useStartedOperations() {
  const [ops, setOps] = useState<{ id: string; kind: string; done: boolean }[]>([]);
  const start = useCallback((kind: string, id: string) => setOps((current) => [
    ...current.filter((op) => op.id !== id && !(op.kind === kind && op.done)), { id, kind, done: false },
  ]), []);
  const finish = useCallback((id: string) => setOps((current) => current.map((op) => op.id === id ? { ...op, done: true } : op)), []);
  return { ops, start, finish };
}

// An action disables its own control, which can blur it to the document,
// and may remove it. Once the panel is idle, return to that control if it
// remains usable, otherwise to the action's fallback (by default the panel
// heading), unless focus has moved elsewhere.
const panelHeading = () => document.getElementById("mem-center-title");
function useReturnFocus(idle: boolean) {
  const trigger = useRef<HTMLElement | null>(null);
  const fallback = useRef<() => HTMLElement | null>(panelHeading);
  const pending = useRef(false);
  useEffect(() => {
    if (!idle || !pending.current) return;
    pending.current = false;
    const target = trigger.current;
    trigger.current = null;
    if (document.activeElement !== document.body && document.activeElement !== target) return;
    const usable = target?.isConnected && !(target as HTMLButtonElement).disabled;
    (usable ? target : fallback.current())?.focus();
  });
  return useCallback((otherwise: () => HTMLElement | null = panelHeading) => {
    pending.current = true;
    fallback.current = otherwise;
    trigger.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  }, []);
}

function Import({ openSession }: { openSession?: (vaultId: string, sessionId: string) => void }) {
  const { status } = useStatus();
  const historyTasks = useHistoryTasks(status.vault.vaultId);
  const [inspected, setInspected] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ picked: Picked; preview: J } | null>(null);
  const preview = selection?.preview;
  const [alias, setAlias] = useState("acct-main");
  const aliasValid = validImportAlias(alias);
  const operations = useStartedOperations();
  const [imports, setImports] = useState<J[] | null>(null);
  const [writeAction, setWriteAction] = useState(false);
  const action = useAction();
  const list = useLatestRead();
  const returnFocus = useReturnFocus(!action.busy && !list.busy);
  const refresh = useCallback(() => void list.run(() => call("import_list"), (r) => setImports(r.items)), [list.run]);
  useEffect(refresh, [refresh]);
  const listReady = imports != null && !list.busy && !list.error;
  const cannotWrite = () => action.busy || list.pending.current || !!list.error || imports == null;
  const write = (commit: (key: string) => Promise<void>) => {
    if (cannotWrite()) return;
    returnFocus();
    setWriteAction(true);
    void action.run(commit);
  };
  const actionError = action.error && {
    ...action.error,
    retry: action.error.retry && !action.busy && (!writeAction || listReady) ? () => {
      if (!action.busy && (!writeAction || !cannotWrite())) action.error?.retry?.();
    } : undefined,
  };
  // The Core refuses to start a file again while its earlier import is
  // interrupted (`import.resume_existing`); that import resumes instead.
  const earlier = preview?.duplicateOf ? imports?.find((m) => m.importId === preview.duplicateOf) : undefined;
  const interrupted = earlier?.status === "parsing" || earlier?.status === "archived";
  const duplicateUnknown = !!preview?.duplicateOf && (!listReady || !earlier);
  const report = imports?.find(m => m.importId === inspected);
  const original = listReady && report?.duplicateOf ? imports?.find(m => m.importId === report.duplicateOf) : undefined;
  return (
    <>
      <Center title={TITLES.import} count={list.error ? t("Imports unavailable") : imports == null ? t("Waiting for imports") : t("{n} recorded", { n: imports.length })}
        busy={action.busy || list.busy || (imports == null && !list.error)}>
        <div className="mem-pad mem-stack">
          <p className="mem-muted">Choose an export file. The Core archives the original bytes and parses them; this page sees only the file name and size.</p>
          <div className="mem-actions">
            <button type="button" className="mem-button" disabled={action.busy} onClick={() => {
              returnFocus();
              setWriteAction(false);
              void action.run(async () => {
                const p = await pick("import_file");
                if (!p) return;
                setSelection(null);
                const next = await call("import_preview", { importToken: p.token });
                setSelection({ picked: p, preview: next });
                refresh();
              });
            }}>{t("Choose file…")}</button>
            <button type="button" className="mem-button" disabled={action.busy || list.busy} onClick={() => {
              if (!action.busy && !list.pending.current) { returnFocus(); refresh(); }
            }}>{list.error ? t("Read import list again") : t("Refresh import list")}</button>
          </div>
          <ErrorBox error={actionError} />
          {action.busy && <p role="status" className="mem-muted">Waiting for Memory to return the import result…</p>}
          <ErrorBox error={list.error} />
          {(list.busy || (imports == null && !list.error)) && <p role="status" className="mem-muted">{t("Reading imports…")}</p>}
          {list.error && <p role="status" className="mem-muted">{imports == null ? "The import list could not be read. Its contents are still unknown." : "Previous import observation."} Read import list again before starting or resuming an import. The file preview and account alias are kept.</p>}
          {listReady && imports?.length === 0 && <p className="mem-muted">{t("No recorded imports yet.")}</p>}
          {selection && (
            <div className="mem-card">
              <p><strong>{preview.displayName}</strong> · {t("{n} bytes", { n: preview.bytes })} · {preview.inputKind} · {preview.recognized ? t("recognized, {n} units", { n: preview.units }) : t("unsupported format (still archived as is)")}</p>
              {preview.duplicateOf && (duplicateUnknown
                ? <p className="mem-warn">{t("Identical content was reported, but the earlier import has not been observed in the current list. Read the import list before starting.")}</p>
                : interrupted
                ? <p className="mem-warn">Identical to import {preview.duplicateOf}, which was interrupted. Resume it from the list below instead of starting it again.</p>
                : <p className="mem-warn">Identical to import {preview.duplicateOf}; it will be recorded as a duplicate.</p>)}
              {preview.warnings.length > 0 && <p className="mem-muted">Warnings: {preview.warnings.join(", ")}</p>}
              <label className="mem-label" htmlFor="mem-alias">{t("Account alias")}</label>
              <div className="mem-actions">
                <input id="mem-alias" className="mem-input" value={alias} onChange={(e) => setAlias(e.target.value)} maxLength={64}
                  aria-invalid={!aliasValid} aria-describedby="mem-alias-help" autoComplete="off" />
                <button type="button" className="mem-button mem-primary" disabled={action.busy || !listReady || interrupted || duplicateUnknown || !aliasValid} onClick={() => {
                  if (interrupted || duplicateUnknown || !validImportAlias(alias)) return;
                  write(async (key) => {
                    const started = await call("import_start", { importToken: selection.picked.token, accountAlias: alias }, key);
                    operations.start("import", started.operationId);
                    setSelection(null);
                  });
                }}>{t("Start import")}</button>
              </div>
              <p id="mem-alias-help" className={aliasValid ? "mem-muted" : "mem-warn"}>{t("Use 1–64 lowercase English letters, digits, _ or -. Start with a letter or digit.")}</p>
            </div>
          )}
          {operations.ops.map((op) => <Operation key={op.id} id={op.id} onDone={() => { operations.finish(op.id); refresh(); }} />)}
          <HistoryTasks tasks={historyTasks} openSession={openSession ? sessionId => openSession(status.vault.vaultId, sessionId) : undefined} />
          <div className="mem-table-scroll" role="region" aria-label={t("Recorded imports")} tabIndex={0}>
          <table className="mem-table">
            <thead><tr><th>{t("Status")}</th><th>{t("Format")}</th><th>{t("Sources")}</th><th>{t("Missing attachments")}</th><th>{t("Warnings")}</th><th /></tr></thead>
            <tbody>
              {imports?.map((m) => (
                <tr key={m.importId}>
                  <td>{m.status}{m.duplicateOf ? " " + t("(duplicate)") : ""}</td>
                  <td>{m.inputKind}</td>
                  <td>{m.counts.sources_created}</td>
                  <td>{m.counts.attachments_missing}</td>
                  <td>{m.warnings.join(", ")}</td>
                  <td><button id={`mem-import-report-${m.importId}`} type="button" className="mem-button" disabled={!listReady}
                    aria-label={t("Inspect import {id}", { id: m.importId })} aria-pressed={inspected === m.importId} onClick={(event) => {
                      if (!listReady) return;
                      const trigger = event.currentTarget;
                      setInspected(m.importId);
                      requestAnimationFrame(() => {
                        if (trigger.isConnected && (document.activeElement === trigger || document.activeElement === document.body)) document.getElementById("mem-import-report-title")?.focus();
                      });
                    }}>{t("Inspect")}</button>{(m.status === "parsing" || m.status === "archived") && (
                    <button type="button" className="mem-button" disabled={action.busy || !listReady || !validImportAlias(m.accountScope ?? alias)} onClick={() => {
                      const accountAlias = m.accountScope ?? alias;
                      if (!validImportAlias(accountAlias)) return;
                      write(async (key) => {
                        operations.start("import", (await call("import_resume", { importId: m.importId, accountAlias }, key)).operationId);
                        setSelection(null);
                      });
                    }}>{t("Resume")}</button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </Center>
      <Inspector>
        <h3 className="mem-h3">{t("What an import does")}</h3>
        <p className="mem-muted">The original export is kept byte for byte. Conversations become sources; nothing becomes a memory without your review. An interrupted import can be resumed.</p>
        {inspected && <ImportReport selected={inspected} row={report} current={listReady} vaultId={status?.vault?.vaultId} vaultHead={status?.vault?.headCommitId}
          onCreateHistory={historyTasks.create} historyBusy={!historyTasks.ready}
          inspectOriginal={original ? () => setInspected(original.importId) : undefined} close={() => {
            setInspected(null);
            const trigger = document.getElementById(`mem-import-report-${inspected}`) as HTMLButtonElement | null;
            (trigger && !trigger.disabled ? trigger : document.getElementById("mem-center-title"))?.focus();
          }} />}
      </Inspector>
    </>
  );
}

function VaultPanel() {
  const { status, refresh } = useStatus();
  const operations = useStartedOperations();
  const [restore, setRestore] = useState<J>(null);
  const action = useAction();
  const returnFocus = useReturnFocus(!action.busy);
  const act = (f: () => Promise<unknown>) => { returnFocus(); void action.run(f); };
  const v = status?.vault ?? {};
  const after = (f: () => Promise<unknown>) => act(async () => { await f(); await refresh(); });
  if (!status || v.state !== "open") {
    return (
      <>
        <div className="qr45"><div className="mem-gate">{status ? <VaultConnect /> : <StatusPending />}</div></div>
        <Inspector><ComponentList status={status} /></Inspector>
      </>
    );
  }
  return (
    <>
      <Center title={TITLES.vault} count={v.rootName}>
        <div className="mem-pad mem-stack">
          <dl className="mem-facts">
            <dt>{t("Folder")}</dt><dd>{v.rootName}</dd>
            <dt>{t("Vault health")}</dt><dd>{v.health}</dd>
            <dt>{t("Latest commit")}</dt><dd>#{v.headSequence} · {when(v.lastCommitAt)}</dd>
            <dt>{t("Free space")}</dt><dd>{v.freeBytes != null ? `${(v.freeBytes / 2 ** 30).toFixed(1)} GiB` : "unknown"}</dd>
            <dt>{t("Owner-only access")}</dt><dd>{v.ownerOnlyAcl == null ? t("unknown") : v.ownerOnlyAcl ? t("yes") : t("no (the Memory CLI can protect it)")}</dd>
            <dt>{t("Last backup")}</dt><dd>{status.lastBackup ? `${status.lastBackup.state} ${status.lastBackup.result?.commitId ?? ""}` : t("none in this run; the Vault does not record backups")}</dd>
            <dt>{t("Last verified restore")}</dt><dd>not recorded (restore preview checks the backup only)</dd>
          </dl>
          <div className="mem-actions">
            <button type="button" className="mem-button" disabled={action.busy} onClick={() => act(async () => operations.start("index_rebuild", (await call("index_rebuild")).operationId))}>{t("Rebuild index")}</button>
            <button type="button" className="mem-button" disabled={action.busy} onClick={() => act(async () => operations.start("vault_verify", (await call("vault_verify")).operationId))}>{t("Verify Vault")}</button>
            <button type="button" className="mem-button" disabled={action.busy} onClick={() => act(async () => {
              const p = await pick("backup_destination");
              if (p) operations.start("backup_export", (await call("backup_export", { destinationToken: p.token })).operationId);
            })}>{t("Back up to an empty folder…")}</button>
            <button type="button" className="mem-button" disabled={action.busy} onClick={() => act(async () => {
              const p = await pick("export_folder");
              if (p) {
                setRestore(null);
                setRestore(await call("restore_preview", { exportToken: p.token }));
              }
            })}>{t("Preview a restore…")}</button>
            <button type="button" className="mem-button" disabled={action.busy} onClick={() => after(() => call("vault_lock"))}>{t("Lock Vault")}</button>
          </div>
          {status.operationsRunning > 0 && (
            <p className="mem-muted" role="status">
              {tn(status.operationsRunning, "{n} operation is running.", "{n} operations are running.")} {t("Locking stops model calls locally, cancels import and index work at the next safe point, and waits for verify and backup to finish; progress stays visible meanwhile. The service may have received a model request. After unlocking, read saved session outcomes before sending again.")}
            </p>
          )}
          <ErrorBox error={action.error} />
          {operations.ops.map((op) => <Operation key={op.id} id={op.id} onDone={() => { operations.finish(op.id); void refresh(); }} />)}
          {restore && (
            <div className="mem-card"><p style={{ margin: 0 }}>
              {t("Backup is valid: commit #{seq} ({id}), {n} files, {which}. An actual restore runs in the Memory CLI into an empty folder", { seq: restore.sequence, id: shortId(restore.commitId), n: restore.files, which: restore.sameVaultAsOpen ? t("same Vault as the open one") : t("from another Vault") })} (<code>restore</code>).
            </p></div>
          )}
        </div>
      </Center>
      <Inspector>
        <h3 className="mem-h3">{t("Components")}</h3>
        <ComponentList status={status} />
        <h3 className="mem-h3">{t("Four different stops")}</h3>
        <ul className="mem-list mem-muted">
          <li><strong>{t("Lock Vault")}</strong> stops model calls locally, cancels import and index work, waits for verify and backup (they cannot be cancelled), then releases the Vault and its index. Local stopping does not confirm remote cancellation. After unlocking, read saved session outcomes before sending again. Vault work is unavailable until you unlock. Runtime keeps the folder reserved until you exit or switch Vaults.</li>
          <li><strong>{t("Closing the window")}</strong> {t("only hides it to the tray. Memory keeps running, and so does any operation.")}</li>
          <li><strong>{t("Exit")}</strong> (tray or Settings) does the same release, then ends Runtime.</li>
          <li><strong>{t("Pausing sync")}</strong> {t("does not exist yet: Memory has no sync before its gateway stage.")}</li>
        </ul>
      </Inspector>
    </>
  );
}
