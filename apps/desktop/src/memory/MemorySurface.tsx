// Memory Vault surface backed by the pinned Enouia Memory Core (ADR-025).
// Layout follows the Quiet Runtime Memory Vault: collections on the left,
// the selected collection in the middle, an inspector on the right. The
// behaviour is ported from Memory's reference workspace: stale-read guards,
// one idempotency key per submission, drafts kept across retries, plan
// dialogs that confirm only the shown diff.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { call, pick, type J } from "./client";
import { useAction, useLatestRead } from "./hooks";
import { ComponentList, StatusPending, VaultConnect, useStatus } from "./status";
import { ErrorBox, Operation, PlanDialog, Source, Tag, shortId, when } from "./ui";

type Collection = "inbox" | "current" | "history" | "import" | "vault";

const TITLES: Record<Collection, string> = {
  inbox: "Candidate inbox",
  current: "Current memories",
  history: "Including history",
  import: "Import",
  vault: "Vault & recovery",
};

function dayOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function MemorySurface() {
  const { status } = useStatus();
  const [collection, setCollection] = useState<Collection>("current");
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState({ text: "", seq: 0 });
  const open = status?.vault?.state === "open";
  const pending: number | null = status?.pendingCandidates ?? null;
  const groups: { label: string; items: [Collection, string, ReactNode?][] }[] = [
    { label: "Review", items: [["inbox", TITLES.inbox, open && pending != null ? pending : "—"]] },
    { label: "Canonical", items: [["current", TITLES.current], ["history", TITLES.history]] },
    { label: "Vault", items: [["import", TITLES.import], ["vault", TITLES.vault, status?.vault?.state ?? "—"]] },
  ];
  const explorer = collection === "current" || collection === "history";
  return (
    <section data-screen-label="Memory Vault" className="qr89">
      <aside className="qr28">
        <div className="qr20">
          <h1 className="qr18">Memory Vault</h1>
          <div className="qr19">What I keep, and why.</div>
        </div>
        <form role="search" className="qr22" onSubmit={(e) => {
          e.preventDefault();
          if (!explorer) setCollection("current");
          setSubmitted((s) => ({ text: query, seq: s.seq + 1 }));
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#7F8D9A" strokeWidth="1.2" aria-hidden="true">
            <circle cx="6" cy="6" r="4.2" /><path d="M9.2 9.2L12.5 12.5" />
          </svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Literal search · Enter" aria-label="Search memories" className="qr21" autoComplete="off" />
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
      {collection === "vault" ? (
        <VaultPanel />
      ) : !open ? (
        <>
          <div className="qr45"><div className="mem-gate">{status ? <VaultConnect /> : <StatusPending />}</div></div>
          <aside aria-label="Memory Inspector" className="qr88"><div className="qr46">Open a Vault to see its memories.</div></aside>
        </>
      ) : explorer ? (
        <Explorer key={collection} history={collection === "history"} submitted={submitted} />
      ) : collection === "inbox" ? (
        <Inbox />
      ) : (
        <Import />
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
  return <aside aria-label="Memory Inspector" className="qr88"><div className="qr79">{children}</div></aside>;
}

function Explorer({ history, submitted, readPage = call }: { history: boolean; submitted: { text: string; seq: number }; readPage?: typeof call }) {
  const [rows, setRows] = useState<J[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const read = useLatestRead();
  const query = submitted.text.trim() ? submitted.text : "";
  const load = useCallback((cursor: string | null) =>
    void read.run(() => query
      ? readPage("memory_search", { query, includeHistorical: history, cursor, limit: 25 })
      : readPage("memory_list", { includeInactive: history, cursor, limit: 25 }), (page) => {
      setRows((current) => cursor ? [...current, ...page.items] : page.items);
      setNext(page.nextCursor);
      setTotal(page.total ?? null);
    }), [query, history, readPage, read.run]);
  useEffect(() => { load(null); }, [load, submitted.seq]);
  const ids = rows.map((r) => r.memoryId);
  const move = (e: KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const i = selected ? ids.indexOf(selected) : -1;
    const n = ids[Math.max(0, Math.min(ids.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
    if (n) { e.preventDefault(); setSelected(n); }
  };
  // A list is sorted by update time, so it groups into days. Search results
  // are ranked by relevance and stay one flat group in rank order.
  const days: { label: string; items: J[] }[] = [];
  if (query) {
    if (rows.length) days.push({ label: "Ranked by relevance", items: rows });
  } else {
    for (const row of rows) {
      const label = row.updatedAt ? dayOf(row.updatedAt) : "Undated";
      const last = days[days.length - 1];
      if (last && last.label === label) last.items.push(row); else days.push({ label, items: [row] });
    }
  }
  const title = query ? `“${query}”${history ? " · with history" : ""}` : history ? TITLES.history : TITLES.current;
  const count = `${rows.length}${total != null ? ` of ${total}` : ""} ${rows.length === 1 ? "record" : "records"}`;
  return (
    <>
      <Center title={title} count={count} busy={read.busy}>
        <ErrorBox error={read.error} />
        {read.busy && <p role="status" className="mem-muted mem-pad">Reading memories…</p>}
        {!read.busy && rows.length === 0 && <div className="qr32">{query ? "Nothing matches this search." : "No approved memories here yet."}</div>}
        <div onKeyDown={move}>
          {days.map((d, i) => (
            <div key={`${i}:${d.label}`}>
              <div className="qr33">{d.label}</div>
              {d.items.map((m) => (
                <button key={m.memoryId} type="button" className="qr43" aria-pressed={selected === m.memoryId}
                  style={{ background: selected === m.memoryId ? "#17212B" : "transparent" }} onClick={() => setSelected(m.memoryId)}>
                  <span className="qr34">{!query && m.updatedAt ? when(m.updatedAt).slice(11) : ""}</span>
                  <span className="qr42">
                    <span className="qr38">
                      <span>{m.type}</span>
                      {m.status && m.status !== "active" && <Tag>{m.status}</Tag>}
                      {m.currency && m.currency !== "current" && <Tag>{m.currency}</Tag>}
                      {m.expired && <Tag tone="warn">expired</Tag>}
                      {m.conflicted && <Tag tone="warn">conflict</Tag>}
                      {m.sourceMissing && <Tag tone="warn">source missing</Tag>}
                    </span>
                    <span className="qr39">{m.snippet}</span>
                    <span className="qr41"><span className="qr25">{shortId(m.memoryId)}</span>{m.revision != null && <span>r{m.revision}</span>}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
        {next && <div className="mem-pad"><button type="button" className="mem-button" onClick={() => load(next)} disabled={read.busy}>Load more</button></div>}
      </Center>
      {selected
        ? <MemoryDetail key={selected} id={selected} onChanged={() => { setSelected(null); load(null); }} />
        : <aside aria-label="Memory Inspector" className="qr88"><div className="qr46">Select a memory to see where it came from.</div></aside>}
    </>
  );
}

export function MemoryDetail({ id, onChanged, readPage = call }: { id: string; onChanged: () => void; readPage?: typeof call }) {
  const [detail, setDetail] = useState<J>(null);
  const [correction, setCorrection] = useState("");
  const [impact, setImpact] = useState<J>(null);
  const [plan, setPlan] = useState<J>(null);
  const [note, setNote] = useState("");
  const planTrigger = useRef<HTMLElement | null>(null);
  const action = useAction();
  const load = useCallback(() => void action.run(async () => setDetail(await readPage("memory_read", { memoryId: id }))), [id, readPage]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  const forget = (mode: "forget" | "purge") => {
    planTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void action.run(async (key) => setPlan(await readPage("forget_plan", { memoryId: id, mode, withDependents: false }, key)));
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(id); setNote("ID copied."); }
    catch { setNote("Could not copy. Select the ID and copy it manually."); }
  };
  if (!detail) return <Inspector><ErrorBox error={action.error} />{action.busy && <p role="status" className="mem-muted">Reading the memory…</p>}</Inspector>;
  const r = detail.record;
  const s = detail.summary;
  return (
    <Inspector>
      <div className="mem-stack">
        <div className="mem-row-meta">
          <Tag tone={s.status === "active" ? "ok" : "muted"}>{s.status}</Tag>
          <Tag>{s.type}</Tag>
          {s.expired && <Tag tone="warn">expired</Tag>}
          {s.conflicted && <Tag tone="warn">conflict</Tag>}
          {s.sourceMissing && <Tag tone="warn">source missing</Tag>}
        </div>
        {r.title && <h3 className="mem-h3">{r.title}</h3>}
        <p className="mem-content">{r.content}</p>
        <dl className="mem-facts">
          <dt>Memory</dt><dd><code title={r.memory_id}>{shortId(r.memory_id)}</code> <button type="button" className="mem-link" onClick={() => void copy()}>Copy ID</button></dd>
          <dt>Revision</dt><dd>r{r.revision}</dd>
          <dt>Approved</dt><dd>{when(r.approved_at)}</dd>
          {r.supersedes.length > 0 && <><dt>Supersedes</dt><dd>{r.supersedes.map((x: J) => `${shortId(x.memory_id)} r${x.revision}`).join(", ")}</dd></>}
          {detail.supersededBy.length > 0 && <><dt>Superseded by</dt><dd>{detail.supersededBy.map(shortId).join(", ")}</dd></>}
        </dl>
      </div>
      <div className="mem-stack">
        <h4 className="mem-h4">Evidence</h4>
        <ul className="mem-list">{detail.evidence.map((e: J, i: number) => <Source key={i} evidence={e} readPage={readPage} />)}</ul>
      </div>
      <div className="mem-stack">
        <h4 className="mem-h4">Correct</h4>
        <label htmlFor="mem-fix" className="mem-sr">Corrected content</label>
        <textarea id="mem-fix" className="mem-textarea" value={correction} onChange={(e) => setCorrection(e.target.value)}
          placeholder="Write the correct content. It becomes a candidate for review; the memory itself is not rewritten." />
        <div className="mem-actions">
          <button type="button" className="mem-button" disabled={!correction.trim() || action.busy} onClick={() => void action.run(async (key) => {
            await readPage("correction_propose", { memoryId: id, revision: r.revision, text: correction }, key);
            setCorrection((current) => current === correction ? "" : current);
            setNote("Correction proposed. Review it in the candidate inbox.");
          })}>Propose correction</button>
          <button type="button" className="mem-button" disabled={action.busy}
            onClick={() => void action.run(async () => setImpact(await readPage("delete_preview", { memoryId: id, withDependents: false })))}>Delete impact</button>
          <button type="button" className="mem-button" disabled={action.busy} onClick={() => forget("forget")}>Forget…</button>
          <button type="button" className="mem-button mem-danger" disabled={action.busy} onClick={() => forget("purge")}>Purge…</button>
        </div>
        {note && <p role="status" className="mem-note">{note}</p>}
        <ErrorBox error={action.error} />
        {impact && (
          <p className="mem-card">
            A purge removes {impact.targets.length} record{impact.targets.length === 1 ? "" : "s"} and {impact.objectCount} object{impact.objectCount === 1 ? "" : "s"}; {impact.losingProvenance.length} other memor{impact.losingProvenance.length === 1 ? "y" : "ies"} would lose evidence.
          </p>
        )}
      </div>
      {plan && <PlanDialog key={plan.planId} plan={plan} returnFocus={planTrigger.current} request={readPage}
        onClose={(done) => { setPlan(null); if (done) onChanged(); }} />}
    </Inspector>
  );
}

export function Inbox({ readPage = call }: { readPage?: typeof call }) {
  const { refresh } = useStatus();
  const [items, setItems] = useState<J[]>([]);
  const [total, setTotal] = useState(0);
  const [plan, setPlan] = useState<J>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [claim, setClaim] = useState("");
  const focusAfterCommit = useRef(false);
  const planTrigger = useRef<HTMLElement | null>(null);
  const action = useAction();
  const reads = useLatestRead();
  const load = useCallback(() => reads.run(() => readPage("candidate_list", { cursor: null, limit: 50 }), (page) => {
    setItems(page.items);
    setTotal(page.total);
  }), [readPage, reads.run]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (focusAfterCommit.current) {
      focusAfterCommit.current = false;
      document.getElementById("mem-center-title")?.focus();
    }
  }, [items]);
  const decide = (c: J, act: string) => {
    if (action.busy || reads.pending.current) return;
    planTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void action.run(async () =>
      setPlan(await readPage("review_plan", { decisions: [{
        candidateId: c.candidateId, revision: c.revision, action: act,
        editedContent: act === "edit_accept" ? edits[c.candidateId] ?? c.content : null, mergeTarget: null,
      }] })),
    );
  };
  return (
    <>
      <Center title={TITLES.inbox} count={`${total} waiting`} busy={action.busy || reads.busy}>
        <ErrorBox error={action.error} />
        <ErrorBox error={reads.error} />
        {reads.busy && <p role="status" className="mem-muted mem-pad">Refreshing candidates…</p>}
        {!reads.busy && items.length === 0 && <div className="qr32">Nothing waiting for review.</div>}
        {items.map((c) => {
          const draft = edits[c.candidateId] ?? c.content;
          return (
            <article key={c.candidateId} className="mem-candidate" aria-label={`Candidate ${c.candidateId}`}>
              <div className="mem-row-meta">
                <Tag>{c.proposalKind}</Tag><Tag>{c.proposedType}</Tag><Tag>{c.sensitivity}</Tag>
                <span className="mem-muted">{c.originKind} · {when(c.createdAt)}</span>
              </div>
              {c.target && <p className="mem-old">Current fact (r{c.target.revision}): {c.target.content}</p>}
              <label htmlFor={`mem-e-${c.candidateId}`} className="mem-sr">Candidate content</label>
              <textarea id={`mem-e-${c.candidateId}`} className="mem-textarea" value={draft}
                onChange={(e) => setEdits({ ...edits, [c.candidateId]: e.target.value })} />
              <p className="mem-muted">
                Evidence: {c.evidence.map((e: J) => `${shortId(e.sourceId)} r${e.sourceRevision}`).join(", ")}
                {c.conflicts.length > 0 && <span className="mem-warn"> · {c.conflicts.length} conflict{c.conflicts.length === 1 ? "" : "s"}</span>}
              </p>
              <div className="mem-actions">
                <button type="button" className="mem-button mem-primary" disabled={action.busy || reads.busy}
                  onClick={() => decide(c, draft !== c.content ? "edit_accept" : "accept")}>{draft !== c.content ? "Accept with edits…" : "Accept…"}</button>
                <button type="button" className="mem-button" disabled={action.busy || reads.busy} onClick={() => decide(c, "reject")}>Reject…</button>
              </div>
            </article>
          );
        })}
      </Center>
      <Inspector>
        <form className="mem-stack" onSubmit={(e) => {
          e.preventDefault();
          if (action.busy || reads.pending.current || !text.trim() || !claim.trim()) return;
          void action.run(async (key) => {
            await readPage("remember", { text, claimKey: claim }, key);
            setText((current) => current === text ? "" : current);
            setClaim((current) => current === claim ? "" : current);
            await load();
            await refresh();
          });
        }}>
          <h3 className="mem-h3">Remember something</h3>
          <p className="mem-muted">Your words are saved as a source first, then proposed as a candidate here. Nothing becomes a memory until you accept it.</p>
          <label className="mem-label" htmlFor="mem-remember">Statement</label>
          <textarea id="mem-remember" className="mem-textarea" value={text} onChange={(e) => setText(e.target.value)} />
          <label className="mem-label" htmlFor="mem-claim">Topic key</label>
          <input id="mem-claim" className="mem-input" value={claim} onChange={(e) => setClaim(e.target.value)} placeholder="for example preference.reading" autoComplete="off" />
          <div className="mem-actions">
            <button type="submit" className="mem-button mem-primary" disabled={!text.trim() || !claim.trim() || action.busy || reads.busy}>Save as candidate</button>
          </div>
        </form>
      </Inspector>
      {plan && <PlanDialog key={plan.planId} plan={plan} returnFocus={planTrigger.current} request={readPage} onClose={(committed) => {
        setPlan(null);
        if (committed !== null) { focusAfterCommit.current = true; void load(); void refresh(); }
      }} />}
    </>
  );
}

function Import() {
  const [picked, setPicked] = useState<J>(null);
  const [preview, setPreview] = useState<J>(null);
  const [alias, setAlias] = useState("acct-main");
  const [op, setOp] = useState<string | null>(null);
  const [imports, setImports] = useState<J[]>([]);
  const action = useAction();
  const list = useLatestRead();
  const refresh = useCallback(() => void list.run(() => call("import_list"), (r) => setImports(r.items)), [list.run]);
  useEffect(refresh, [refresh]);
  return (
    <>
      <Center title={TITLES.import} count={`${imports.length} recorded`} busy={action.busy}>
        <div className="mem-pad mem-stack">
          <p className="mem-muted">Choose an export file. The Core archives the original bytes and parses them; this page sees only the file name and size.</p>
          <div className="mem-actions">
            <button type="button" className="mem-button" disabled={action.busy} onClick={() => void action.run(async () => {
              const p = await pick("import_file");
              if (!p) return;
              setPicked(p);
              setPreview(await call("import_preview", { importToken: p.token }));
            })}>Choose file…</button>
          </div>
          <ErrorBox error={action.error} />
          {preview && (
            <div className="mem-card">
              <p><strong>{preview.displayName}</strong> · {preview.bytes} bytes · {preview.inputKind} · {preview.recognized ? `recognized, ${preview.units} units` : "unsupported format (still archived as is)"}</p>
              {preview.duplicateOf && <p className="mem-warn">Identical to import {preview.duplicateOf}; it will be recorded as a duplicate.</p>}
              {preview.warnings.length > 0 && <p className="mem-muted">Warnings: {preview.warnings.join(", ")}</p>}
              <label className="mem-label" htmlFor="mem-alias">Account alias</label>
              <div className="mem-actions">
                <input id="mem-alias" className="mem-input" value={alias} onChange={(e) => setAlias(e.target.value)} pattern="[a-z0-9][a-z0-9_-]*" autoComplete="off" />
                <button type="button" className="mem-button mem-primary" disabled={!picked || action.busy} onClick={() => void action.run(async (key) => {
                  const started = await call("import_start", { importToken: picked.token, accountAlias: alias }, key);
                  setOp(started.operationId);
                  setPicked(null);
                  setPreview(null);
                })}>Start import</button>
              </div>
            </div>
          )}
          {op && <Operation id={op} onDone={refresh} />}
          <ErrorBox error={list.error} />
          <table className="mem-table">
            <thead><tr><th>Status</th><th>Format</th><th>Sources</th><th>Missing attachments</th><th>Warnings</th><th /></tr></thead>
            <tbody>
              {imports.map((m) => (
                <tr key={m.importId}>
                  <td>{m.status}{m.duplicateOf ? " (duplicate)" : ""}</td>
                  <td>{m.inputKind}</td>
                  <td>{m.counts.sources_created}</td>
                  <td>{m.counts.attachments_missing}</td>
                  <td>{m.warnings.join(", ")}</td>
                  <td>{m.status === "parsing" && (
                    <button type="button" className="mem-button" disabled={action.busy} onClick={() => void action.run(async (key) =>
                      setOp((await call("import_resume", { importId: m.importId, accountAlias: m.accountScope ?? alias }, key)).operationId))}>Resume</button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Center>
      <Inspector>
        <h3 className="mem-h3">What an import does</h3>
        <p className="mem-muted">The original export is kept byte for byte. Conversations become sources; nothing becomes a memory without your review. An interrupted import can be resumed.</p>
      </Inspector>
    </>
  );
}

function VaultPanel() {
  const { status, refresh } = useStatus();
  const [op, setOp] = useState<string | null>(null);
  const [restore, setRestore] = useState<J>(null);
  const action = useAction();
  const v = status?.vault ?? {};
  const after = (f: () => Promise<unknown>) => void action.run(async () => { await f(); await refresh(); });
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
            <dt>Folder</dt><dd>{v.rootName}</dd>
            <dt>Vault health</dt><dd>{v.health}</dd>
            <dt>Latest commit</dt><dd>#{v.headSequence} · {when(v.lastCommitAt)}</dd>
            <dt>Free space</dt><dd>{v.freeBytes != null ? `${(v.freeBytes / 2 ** 30).toFixed(1)} GiB` : "unknown"}</dd>
            <dt>Owner-only access</dt><dd>{v.ownerOnlyAcl == null ? "unknown" : v.ownerOnlyAcl ? "yes" : "no (the Memory CLI can protect it)"}</dd>
            <dt>Last backup</dt><dd>{status.lastBackup ? `${status.lastBackup.state} ${status.lastBackup.result?.commitId ?? ""}` : "none in this run; the Vault does not record backups"}</dd>
            <dt>Last verified restore</dt><dd>not recorded (restore preview checks the backup only)</dd>
          </dl>
          <div className="mem-actions">
            <button type="button" className="mem-button" disabled={action.busy} onClick={() => void action.run(async () => setOp((await call("index_rebuild")).operationId))}>Rebuild index</button>
            <button type="button" className="mem-button" disabled={action.busy} onClick={() => void action.run(async () => setOp((await call("vault_verify")).operationId))}>Verify Vault</button>
            <button type="button" className="mem-button" disabled={action.busy} onClick={() => void action.run(async () => {
              const p = await pick("backup_destination");
              if (p) setOp((await call("backup_export", { destinationToken: p.token })).operationId);
            })}>Back up to an empty folder…</button>
            <button type="button" className="mem-button" disabled={action.busy} onClick={() => void action.run(async () => {
              const p = await pick("export_folder");
              if (p) setRestore(await call("restore_preview", { exportToken: p.token }));
            })}>Preview a restore…</button>
            <button type="button" className="mem-button" disabled={action.busy} onClick={() => after(() => call("vault_lock"))}>Lock Vault</button>
          </div>
          {status.operationsRunning > 0 && (
            <p className="mem-muted" role="status">
              {status.operationsRunning} operation{status.operationsRunning === 1 ? " is" : "s are"} running. Locking cancels import and index work at the next safe point and waits for verify and backup to finish; progress stays visible meanwhile.
            </p>
          )}
          <ErrorBox error={action.error} />
          {op && <Operation id={op} onDone={() => void refresh()} />}
          {restore && (
            <p className="mem-card">
              Backup is valid: commit #{restore.sequence} ({shortId(restore.commitId)}), {restore.files} files, {restore.sameVaultAsOpen ? "same Vault as the open one" : "from another Vault"}. An actual restore runs in the Memory CLI into an empty folder (<code>restore</code>).
            </p>
          )}
        </div>
      </Center>
      <Inspector>
        <h3 className="mem-h3">Components</h3>
        <ComponentList status={status} />
        <h3 className="mem-h3">Three different stops</h3>
        <ul className="mem-list mem-muted">
          <li><strong>Lock Vault</strong> cancels import and index work, waits for verify and backup (they cannot be cancelled), then releases the Vault and its index. Everything is refused until you unlock.</li>
          <li><strong>Closing the window</strong> does the same release, keeps the window until it finishes, then exits Runtime. The Activity producer keeps its own schedule.</li>
          <li><strong>Pausing sync</strong> does not exist yet: Memory has no sync before its gateway stage.</li>
        </ul>
      </Inspector>
    </>
  );
}
