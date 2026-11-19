import { useCallback, useEffect, useRef, useState } from "react";
import { CATALOG_FILTER, catalogRead, catalogSelectionKey, catalogScopeKey, type CatalogCursor, type CatalogPage, type CatalogStats, type CatalogStatus, type CatalogDetail, type CatalogSource, type CatalogEvidence, type CatalogFilter, type CatalogSelection } from "./catalog";
import { describe } from "./client";
import { useLatestRead } from "./hooks";
import { ErrorBox, Tag, shortId } from "./ui";
import { t } from "../i18n";

export function CatalogMemory({ read = catalogRead, onControl }: { read?: typeof catalogRead; onControl?: (next: CatalogStatus | null) => void }) {
  const [status, setStatus] = useState<CatalogStatus | null>(null);
  const [mode, setMode] = useState<CatalogStatus["mode"] | null>(null);
  const [page, setPage] = useState<CatalogPage | null>(null);
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const [filter, setFilter] = useState(CATALOG_FILTER);
  const [observationError, setObservationError] = useState<{ cause: unknown } | null>(null);
  const reads = useLatestRead();
  const observedScope = useRef<string | null>(null);
  const epoch = useRef(0);
  const controlling = useRef(false);
  const clear = useCallback(() => { reads.clear(); setPage(null); setStats(null); setSelectedId(null); }, [reads.clear]);
  const load = useCallback((cursor: CatalogCursor | null = null) => {
    setPage(null); setStats(null); setSelectedId(null);
    return reads.run(async () => {
      const next = await read({ operation: "page", filter, cursor, limit: 2 });
      const counts = await read({ operation: "stats", filter, selection: next.selection });
      if (catalogScopeKey(next.selection) !== observedScope.current || catalogSelectionKey(next.selection) !== catalogSelectionKey(counts.selection) || counts.matched_in_scope !== next.matched_in_scope) throw "catalog_response_unsupported";
      return { next, counts };
    }, ({ next, counts }) => { setPage(next); setStats(counts); }, () => { setPage(null); setStats(null); });
  }, [read, filter, reads.run]);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const current = epoch.current;
      try {
        if (controlling.current) return;
        const next = await read({ operation: "status" });
        if (stopped || controlling.current || current !== epoch.current) return;
        setStatus(next); setMode(next.mode); setObservationError(null);
        const scope = next.state === "open" && next.selection ? catalogScopeKey(next.selection) : null;
        if (scope === null) { observedScope.current = null; clear(); }
        else if (scope !== observedScope.current) { clear(); observedScope.current = scope; await load(); }
      } catch (cause) {
        if (!stopped && !controlling.current && current === epoch.current) {
          setStatus(null); setObservationError({ cause });
          if (cause !== "catalog_busy") { observedScope.current = null; clear(); }
        }
      } finally { if (!stopped) timer = setTimeout(poll, 1500); }
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [read, load, clear]);
  const control = async (operation: "lock" | "unlock") => {
    if (controlling.current) return;
    controlling.current = true; epoch.current += 1; observedScope.current = null;
    onControl?.(null);
    clear(); setStatus(null);
    try { await reads.run(() => read({ operation }), result => { setStatus(result); onControl?.(result); }); }
    finally { controlling.current = false; epoch.current += 1; }
  };
  const open = status?.state === "open";
  const owner = mode === "registered_owner_readonly";
  return <>
    <div className="qr45" aria-busy={reads.busy}>
      <div className="qr31"><h2 ref={heading} tabIndex={-1} className="qr29">{t("Native memory catalog")}</h2><Tag tone="warn">{t(owner ? "Registered library · read only" : mode ? "Isolated synthetic read-2" : "Reading library state…")}</Tag></div>
      <div className="qr44 mem-pad">
        {mode && <p className="mem-content">{t(owner ? "This entry reads the explicitly registered library. It cannot create records, grants or send to a model. Sessions and Context remain unavailable here." : "This library contains fixed fictional records. It does not open Morii's Vault or run continuous formation.")}</p>}
        {observationError && <p role="alert">{describe(observationError.cause)}</p>}
        <ErrorBox error={reads.error} />
        <p role="status">{status ? t("Library: {state}", { state: status.state }) : observationError ? t("Library state is unknown.") : t("Reading library state…")}</p>
        {open && reads.busy && <p role="status">{t("Reading catalog page and statistics…")}</p>}
        {status?.reason && <p role="alert">{describe(status.reason)}</p>}
        {status?.state === "disabled" && <p className="mem-content">{t(owner ? "No registered library was opened at startup." : "No segmented synthetic library is enabled in this session.")}</p>}
        {status?.state === "failed" && <p className="mem-content">{t(owner ? "The registered library could not be opened. No other library was selected." : "The synthetic library is unavailable. Start a new synthetic session to recover.")}</p>}
        {owner && status?.state === "locked" && <p className="mem-content">{t("The library is closed. Exit Runtime and explicitly launch the registered library again to reopen it.")}</p>}
          <form className="mem-stack" role="search" onSubmit={event => { event.preventDefault(); if (!open || reads.pending.current) return; epoch.current += 1; observedScope.current = null; clear(); setFilter({ ...CATALOG_FILTER, text: draft }); }}>
            <label className="mem-label">{t("Literal catalog search")} <input className="mem-input" value={draft} maxLength={512} autoComplete="off" onChange={event => setDraft(event.target.value)} /></label>
            <button className="mem-button" disabled={!open || reads.busy}>{t("Search catalog")}</button>
          </form>
        {open && <button className="mem-button" disabled={reads.busy} onClick={() => void load()}>{t("Refresh catalog")}</button>}
        {(open || (!owner && status?.state === "locked")) && <button className="mem-button" disabled={reads.busy} onClick={event => {
          if (document.activeElement === event.currentTarget) heading.current?.focus();
          void control(open ? "lock" : "unlock");
        }}>{t(owner ? "Lock registered library" : open ? "Lock synthetic library" : "Unlock synthetic library")}</button>}
        {open && page && stats && <>
          <p className="mem-content">{t("{shown} shown · {matched} matching authorized records", { shown: page.items.length, matched: stats.matched_in_scope })}</p>
          <p className="mem-content">{t("Counts cover currently authorized machine revisions for this selection.")}</p>
          <p className="mem-content">{t("{unknown} records have unknown event dates in this filter scope.", { unknown: page.unknown_time_in_scope })}</p>
          <p className="mem-content">{t("State observed at {time}", { time: page.authorized_at })}</p>
          <ul className="mem-list">{page.items.map(item => <li key={`${item.base.memory.memory_id}:${item.base.memory.revision}`}>
            <h3 className="mem-content"><button type="button" className="mem-link" aria-pressed={selectedId === item.base.memory.memory_id} aria-label={t("Read catalog detail: {title}", { title: item.title })} onClick={() => setSelectedId(item.base.memory.memory_id)}>{item.title}</button></h3><p className="mem-content">{item.base.content}</p>
            <p className="mem-content">{t("{kind} · {knowledge} · System {adoption} · validity {validity} · attention {attention}", { kind: item.base.dimensions.kind, knowledge: item.base.knowledge, adoption: item.base.adoption, validity: item.base.validity, attention: item.base.attention })}</p>
            <p className="mem-row-meta">{shortId(item.base.memory.memory_id)} · r{item.base.memory.revision} · {item.content_lang}</p>
          </li>)}</ul>
          {page.items.length === 0 && !page.next && <p className="mem-content">{t(filter.text ? "No authorized record matches this search. Search with an empty field to see the whole catalog." : owner ? "This registered catalog has no records in the current authorized scope." : "This synthetic catalog has no records in the current authorized scope.")}</p>}
          {page.next && <button className="mem-button" disabled={reads.busy} onClick={() => void load(page.next)}>{t("Next catalog page")}</button>}
        </>}
      </div>
    </div>
    <aside className="qr88" aria-label={t("Automatic Memory Inspector")}><div className="qr79"><p className="mem-content">{t(open && page && stats ? "Page statistics were read for the same selection." : "No catalog page is currently observed.")}</p><p className="mem-content">{t(owner ? "Records and source excerpts come from the same registered library. Formed records are not independent verification." : "System formation preserves what the synthetic subject said. It is not independent verification or confirmation by Morii.")}</p>
      {open && page && stats && selectedId && <CatalogDetailPanel key={`${catalogScopeKey(page.selection)}:${selectedId}`} memoryId={selectedId} filter={filter} selection={page.selection} read={read} />}
    </div></aside>
  </>;
}

function CatalogDetailPanel({ memoryId, filter, selection, read }: { memoryId: string; filter: CatalogFilter; selection: CatalogSelection; read: typeof catalogRead }) {
  const [detail, setDetail] = useState<CatalogDetail | null>(null);
  const [source, setSource] = useState<CatalogSource | null>(null);
  const details = useLatestRead();
  const sources = useLatestRead();
  const load = useCallback(() => {
    setDetail(null); setSource(null); sources.clear();
    return details.run(async () => {
      const result = await read({ operation: "detail", memory_id: memoryId, filter });
      if (catalogScopeKey(result.header.selection) !== catalogScopeKey(selection)) throw "catalog_stale";
      return result;
    }, setDetail);
  }, [read, memoryId, filter, selection, details.run, sources.clear]);
  useEffect(() => { void load(); }, [load]);
  const quoted = (evidence: CatalogEvidence) => {
    setSource(null);
    void sources.run(async () => {
      const result = await read({ operation: "source", source: { source_id: evidence.reference.source_id, source_revision: evidence.reference.source_revision }, start: evidence.start, limit: evidence.end - evidence.start });
      if (catalogScopeKey(result.header.selection) !== catalogScopeKey(selection)) throw "catalog_stale";
      if (result.source && (result.excerpt !== evidence.quote || result.end !== evidence.end || result.source_record?.anchor_hash !== evidence.reference.object_hash)) throw "catalog_response_unsupported";
      return result;
    }, setSource);
  };
  return <section className="mem-stack" aria-label={t("Catalog record detail")} aria-busy={details.busy || sources.busy}>
    <h3>{t("Catalog record detail")}</h3>
    <button type="button" className="mem-button" disabled={details.busy} onClick={() => void load()}>{t("Refresh record detail")}</button>
    {details.busy && <p role="status">{t("Reading record detail…")}</p>}
    <ErrorBox error={details.error} />
    {detail && !detail.item && <p role="status">{t("This record is no longer available in the current scope.")}</p>}
    {detail?.item && detail.fields && <>
      <h4 className="mem-content">{detail.fields.title}</h4><p className="mem-content">{detail.item.base.content}</p>
      <p className="mem-row-meta mem-content">{detail.item.base.memory.memory_id} · r{detail.item.base.memory.revision}</p>
      <p>{t("Quoted text evidence; attachment content is not read.")}</p>
      <ul className="mem-list">{detail.fields.evidence.map((evidence, index) => <li key={index}>
        <blockquote className="mem-content">{evidence.quote}</blockquote>
        <p className="mem-row-meta mem-content">{evidence.reference.source_id} · r{evidence.reference.source_revision} · {evidence.start}–{evidence.end}</p>
        <button type="button" className="mem-link" disabled={sources.busy}
          aria-label={t("Read quoted source {n}", { n: index + 1 })} onClick={() => quoted(evidence)}>{t("Read quoted source")}</button>
      </li>)}</ul>
    </>}
    {sources.busy && <p role="status">{t("Reading quoted source…")}</p>}
    <ErrorBox error={sources.error} />
    {source && !source.source && <p role="status">{t("This source revision is no longer available.")}</p>}
    {source?.source && source.source_record && <section aria-label={t("Quoted source excerpt")}>
      <h4>{t("Quoted source excerpt")}</h4><blockquote className="mem-content">{source.excerpt}</blockquote>
      <p className="mem-row-meta mem-content">{source.source.source_id} · r{source.source.source_revision} · {source.start}–{source.end} / {source.total_characters}</p>
      <p className="mem-content">{source.source_record.speaker} · {source.source_record.evidence_class} · {source.source_record.source_kind}</p>
      <p className="mem-content">{source.source_record.original_conversation_id} {source.source_record.original_message_id}</p>
    </section>}
  </section>;
}
