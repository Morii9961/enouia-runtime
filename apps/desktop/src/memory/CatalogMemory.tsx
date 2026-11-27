import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CATALOG_FILTER, catalogRead, catalogSelectionKey, catalogScopeKey, type CatalogCursor, type CatalogPage, type CatalogStats, type CatalogStatus, type CatalogDetail, type CatalogSource, type CatalogEvidence, type CatalogFilter, type CatalogSelection, type FacetGroup, type RecordTime } from "./catalog";
import { analystText, recordTimeText, word } from "./catalogWords";
import { CorrectionPanel } from "./CorrectionPanel";
import { RevisionCompare } from "./Compare";

// Filter axes the registered catalog offers; Core returns each axis's values
// and counts under the other active filters (FacetCountScope::OtherFilters).
const AXES = ["form", "knowledge", "adoption", "attention", "entity", "project"] as const;
const PAGE_SIZE = 50;
import { describe } from "./client";
import { useLatestRead } from "./hooks";
import { ErrorBox, Tag, shortId } from "./ui";
import { labels, msg, t, tn } from "../i18n";

export function CatalogMemory({ read = catalogRead, onControl }: { read?: typeof catalogRead; onControl?: (next: CatalogStatus | null) => void }) {
  const [status, setStatus] = useState<CatalogStatus | null>(null);
  const [mode, setMode] = useState<CatalogStatus["mode"] | null>(null);
  const [page, setPage] = useState<CatalogPage | null>(null);
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const [filter, setFilter] = useState(CATALOG_FILTER);
  const [facetGroups, setFacetGroups] = useState<FacetGroup[]>([]);
  const [observationError, setObservationError] = useState<{ cause: unknown } | null>(null);
  const reads = useLatestRead();
  const observedScope = useRef<string | null>(null);
  const epoch = useRef(0);
  const controlling = useRef(false);
  const clear = useCallback(() => { reads.clear(); setPage(null); setStats(null); setSelectedId(null); }, [reads.clear]);
  const load = useCallback((cursor: CatalogCursor | null = null) => {
    setPage(null); setStats(null); setSelectedId(null);
    return reads.run(async () => {
      const next = await read({ operation: "page", filter, cursor, limit: PAGE_SIZE, facets: true });
      const counts = await read({ operation: "stats", filter, selection: next.selection });
      if (catalogScopeKey(next.selection) !== observedScope.current || catalogSelectionKey(next.selection) !== catalogSelectionKey(counts.selection) || counts.matched_in_scope !== next.matched_in_scope) throw "catalog_response_unsupported";
      return { next, counts };
    }, ({ next, counts }) => { setPage(next); setStats(counts); if (next.facets?.length) setFacetGroups(next.facets); setSelectedId(next.items[0]?.base.memory.memory_id ?? null); }, () => { setPage(null); setStats(null); });
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
        if (scope === null) { observedScope.current = null; clear(); setFacetGroups([]); }
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
  const said = useSaidTimes(read, filter, owner ? page : null);
  // UI v2 Memory Vault: a filter rail (search and facet counts), the list with
  // day bands and rows, and the Inspector with the selected record. Class names
  // tests and smokes use (.mem-list, li, the title button) are kept.
  const clock = (at?: string) => at ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(at)) : "—";
  const refilter = (next: CatalogFilter) => {
    if (!open || reads.pending.current) return;
    epoch.current += 1; observedScope.current = null; clear(); setFilter(next);
  };
  const filtered = AXES.filter(axis => filter[axis] !== null);
  const facetLabel = (axis: typeof AXES[number], value: string) => axis === "entity" || axis === "project" ? facetGroups.find(g => g.axis === axis)?.values.find(v => v.value === value)?.label ?? value : word(value);
  const title = filter.text ? t("Search: {text}", { text: filter.text }) : filtered.length ? filtered.map(axis => facetLabel(axis, filter[axis]!)).join(" · ") : t("All records");
  const total = facetGroups.find(g => g.axis === "adoption")?.values.reduce((sum, v) => sum + v.count, 0);
  const items = page?.items ?? [];
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if ((event.target as HTMLElement).closest("input, textarea, select")) return;
    const ids = items.map(item => item.base.memory.memory_id);
    const next = ids[Math.max(0, Math.min(ids.length - 1, ids.indexOf(selectedId ?? "") + (event.key === "ArrowDown" ? 1 : -1)))];
    if (!next) return;
    event.preventDefault(); setSelectedId(next);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-memory-id="${CSS.escape(next)}"] .mem-link`)?.focus());
  };
  return <>
    <aside className="qr28 mem-catalog-rail" aria-label={t("Memory filters")}>
      <div className="qr20">
        <h1 className="qr18">{t("Memory Vault")}</h1>
        <div className="qr19">{t("What I keep, and why.")}</div>
      </div>
      <form className="qr22 mem-catalog-search" role="search" onSubmit={event => { event.preventDefault(); refilter({ ...CATALOG_FILTER, text: draft }); }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ stroke: "var(--ink-2)" }} strokeWidth="1.2" aria-hidden="true"><circle cx="6" cy="6" r="4.2" /><path d="M9.2 9.2L12.5 12.5" /></svg>
        <input className="qr21" value={draft} maxLength={512} autoComplete="off" placeholder={t("Literal search")} aria-label={t("Literal catalog search")} onChange={event => setDraft(event.target.value)} />
        <button className="mem-search-go" disabled={!open || reads.busy} aria-label={t("Search catalog")}>↵</button>
      </form>
      {open && facetGroups.length > 0 && <>
        <div className="qr27">
          <button type="button" className="qr26" aria-pressed={!filtered.length && !filter.text} disabled={reads.busy} onClick={() => { setDraft(""); refilter(CATALOG_FILTER); }}>
            <span className="qr24">{t("All records")}</span>{total != null && <span className="qr25">{total}</span>}
          </button>
        </div>
        {RAIL.map(axis => {
          const group = facetGroups.find(g => g.axis === axis);
          if (!group || (group.values.length === 0 && filter[axis] === null)) return null;
          if (filter[axis] === null && group.values.length === 1 && total != null && group.values[0].count === total) return null;
          return <div className="qr27" key={axis} role="group" aria-label={t(RAIL_TITLE[axis])}>
            <div className="qr23">{t(RAIL_TITLE[axis])}</div>
            {group.values.map(v => {
              const active = filter[axis] === v.value;
              return <button key={v.value} type="button" className="qr26" aria-pressed={active} disabled={reads.busy} onClick={() => refilter({ ...filter, [axis]: active ? null : v.value })}>
                <span className="qr24">{facetLabel(axis, v.value)}</span><span className="qr25" data-waiting={axis === "adoption" && v.value === "staged" && v.count > 0 || undefined}>{v.count}</span>
              </button>;
            })}
            {group.values.length < group.total_values && <p className="mem-row-meta mem-rail-more">{t("First {n} of {total} shown.", { n: group.values.length, total: group.total_values })}</p>}
          </div>;
        })}
      </>}
      <div className="mem-rail-foot">
        {owner && <p className="am-fine mem-catalog-mode">{t("Registered library · confirmed writes")}</p>}
        <p role="status" className="am-fine">{status ? t("Library: {state}", { state: status.state }) : observationError ? t("Library state is unknown.") : t("Reading library state…")}</p>
        {open && <button type="button" className="mem-link" disabled={reads.busy} onClick={() => void load()}>{t("Refresh catalog")}</button>}
        {(open || (!owner && status?.state === "locked")) && <button type="button" className="mem-link" disabled={reads.busy} onClick={event => {
          if (document.activeElement === event.currentTarget) heading.current?.focus();
          void control(open ? "lock" : "unlock");
        }}>{t(owner ? "Lock registered library" : open ? "Lock synthetic library" : "Unlock synthetic library")}</button>}
      </div>
    </aside>
    <div className="qr45" aria-busy={reads.busy}>
      <div className="qr31">
        <h2 ref={heading} tabIndex={-1} className="qr29">{title}</h2>
        {open && page && stats && <div className="qr19">{t("{shown} shown · {matched} matching authorized records", { shown: page.items.length, matched: stats.matched_in_scope })}</div>}
        <div className="qr30" />
        <div className="qr19">{mode ? t("↑ ↓ to move") : t("Reading library state…")}</div>
      </div>
      <div className="qr44" onKeyDown={move}>
        <div className="mem-catalog-head">
          {mode && !owner && <p className="am-fine">{t("This library contains fixed fictional records. It does not open Morii's Vault or run continuous formation.")}</p>}
          {observationError && <p role="alert">{describe(observationError.cause)}</p>}
          <ErrorBox error={reads.error} />
          {open && reads.busy && <p role="status" className="am-fine">{t("Reading catalog page and statistics…")}</p>}
          {status?.reason && <p role="alert">{describe(status.reason)}</p>}
          {status?.state === "disabled" && <p className="am-fine">{t(owner ? "No registered library was opened at startup." : "No segmented synthetic library is enabled in this session.")}</p>}
          {status?.state === "failed" && <p className="am-fine">{t(owner ? "The registered library could not be opened. No other library was selected." : "The synthetic library is unavailable. Start a new synthetic session to recover.")}</p>}
          {owner && status?.state === "locked" && <p className="am-fine">{t("The library is closed. Exit Runtime and explicitly launch the registered library again to reopen it.")}</p>}
          {open && page && stats && (owner
            ? page.unknown_time_in_scope > 0 && <p className="am-fine">{tn(page.unknown_time_in_scope, "{n} record is shown by when it was first mentioned.", "{n} records are shown by when they were first mentioned.")}</p>
            : <p className="am-fine">{t("Counts cover currently authorized machine revisions for this selection.")} · {t("{unknown} records have unknown event dates in this filter scope.", { unknown: page.unknown_time_in_scope })} · {t("State observed at {time}", { time: page.authorized_at })}</p>)}
        </div>
        {open && page && stats && <>
          {dayGroups(page.items).map(([day, items], index) => <section key={`${day ?? "unknown"}:${index}`} className="mem-day-group" aria-label={dayHeading(day)}>
          <h3 className="qr33 mem-day">{dayHeading(day)}</h3>
          <ul className="mem-list mem-catalog-rows">{items.map(item => {
            const id = item.base.memory.memory_id, chosen = selectedId === id;
            const whole = sameText(item.title, item.base.content);
            const when = unknownEvent(item) ? said[id] ? t("Mentioned {time}", { time: recordTimeText(said[id]) }) : null : t("Happened: {time}", { time: recordTimeText(item.event_time) });
            return <li key={`${id}:${item.base.memory.revision}`} data-memory-id={id} className="qr43 mem-catalog-row" data-status={item.base.adoption === "staged" ? "candidate" : "canonical"} data-selected={chosen || undefined} onClick={() => setSelectedId(id)}>
              <span className="qr34">{backfilled(item) ? t("Init.") : clock(item.base.learned_at)}</span>
              <span className="qr42">
                <span className="qr38"><span>{word(item.base.dimensions.kind)}</span>{item.base.adoption !== "adopted" && <span className="qr37" data-status="candidate">{word(item.base.adoption)}</span>}</span>
                <h3 className="mem-catalog-title" data-whole={whole || undefined}><button type="button" className="mem-link" aria-pressed={chosen} aria-label={t("Read catalog detail: {title}", { title: item.title })} onClick={event => { event.stopPropagation(); setSelectedId(id); }}>{whole ? item.base.content : item.title}</button></h3>
                {!whole && <span className="qr39">{item.base.content}</span>}
                <span className="qr41">
                  {when && <span>{when}</span>}
                  {analystText(item.formation_reason) && <span>{analystText(item.formation_reason)}</span>}
                  <span className="qr40">{shortId(id)}</span>
                </span>
              </span>
            </li>;
          })}</ul></section>)}
          {page.items.length === 0 && !page.next && <p className="qr32">{t(filter.text ? "No authorized record matches this search. Search with an empty field to see the whole catalog." : owner ? "This registered catalog has no records in the current authorized scope." : "This synthetic catalog has no records in the current authorized scope.")}</p>}
          {page.next && <div className="mem-catalog-more"><button className="am-chip" disabled={reads.busy} onClick={() => void load(page.next)}>{t("Next catalog page")}</button></div>}
        </>}
      </div>
    </div>
    <aside className="qr88" aria-label={t("Automatic Memory Inspector")}><div className="qr79">
      {!(open && page && stats && selectedId) && <p className="qr46">{t(open && page && stats ? page.items.length ? "Choose a record to read why it is kept." : "Nothing to inspect in this selection." : "No catalog page is currently observed.")}</p>}
      {open && page && stats && selectedId && <CatalogDetailPanel key={`${catalogScopeKey(page.selection)}:${selectedId}`} memoryId={selectedId} filter={filter} selection={page.selection} read={read} entities={facetGroups.find(g => g.axis === "entity")?.values ?? []} corrections={status?.corrections === true} sourceTimes={owner} />}
      <p className="am-fine mem-inspector-note">{t(owner ? "Records and source excerpts come from the same registered library. Formed records are not independent verification." : "System formation preserves what the synthetic subject said. It is not independent verification or confirmation by Morii.")}</p>
    </div></aside>
  </>;
}
// The rail's facet groups, in reading order; Core counts each under the other active filters.
const RAIL = ["adoption", "form", "knowledge", "attention", "project", "entity"] as const;
const RAIL_TITLE: Record<typeof RAIL[number], string> = labels({ adoption: msg("Adoption"), form: msg("Kind"), knowledge: msg("Knowledge"), attention: msg("Attention"), project: msg("Projects"), entity: msg("People and places") });
/** A title that only repeats the start of the text is shown once, as the text. */
const sameText = (title: string, content: string) => { const a = title.trim().replace(/[.。…,，:：]+$/, ""); return a.length > 0 && content.trim().startsWith(a); };
/** Initialization writes are Backfill formations (Memory session, 2026-11-27); daily writes and corrections are Live. */
const backfilled = (item: CatalogPage["items"][number]) => item.formation_reason?.mode === "backfill";
const INITIALIZATION = "initialization";
const dayHeading = (day: string | null) => day === INITIALIZATION ? t("Initialization") : day ? dayText(day) : t("Learned date not recorded");
/** R5 A11: consecutive records learned on the same local day share one divider; initialization writes share one "Initialization" band. */
function dayGroups(items: CatalogPage["items"]): [string | null, CatalogPage["items"]][] {
  const groups: [string | null, CatalogPage["items"]][] = [];
  for (const item of items) {
    const at = item.base.learned_at;
    const day = backfilled(item) ? INITIALIZATION : at ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at)) : null;
    const last = groups.at(-1);
    if (last && last[0] === day) last[1].push(item); else groups.push([day, [item]]);
  }
  return groups;
}
// A record whose event time was not recorded still cites the turns it came
// from, and each turn keeps when it was said. Read each cited source's record
// (one character of text) once per scope; the result is the span of those
// times, shown as source-conversation time, never as event time.
const unknownEvent = (item: CatalogPage["items"][number]) => !item.event_time || item.event_time.precision === "unknown" || !item.event_time.from;
const saidTimes = new Map<string, Promise<RecordTime | null>>();
function saidAt(read: typeof catalogRead, filter: CatalogFilter, selection: CatalogSelection, memoryId: string): Promise<RecordTime | null> {
  const key = `${catalogScopeKey(selection)}:${memoryId}`;
  let found = saidTimes.get(key);
  if (!found) {
    found = (async () => {
      const detail = await read({ operation: "detail", memory_id: memoryId, filter });
      const refs = new Map((detail.fields?.evidence ?? []).map(e => [`${e.reference.source_id}:${e.reference.source_revision}`, e.reference]));
      const times: number[] = [];
      for (const ref of refs.values()) {
        const source = await read({ operation: "source", source: { source_id: ref.source_id, source_revision: ref.source_revision }, start: 0, limit: 1 });
        const at = Date.parse(source.source_record?.occurred_at ?? "");
        if (Number.isFinite(at)) times.push(at);
      }
      if (!times.length) return null;
      const [from, until] = [Math.min(...times), Math.max(...times)];
      return { from: new Date(from).toISOString(), until: until > from ? new Date(until).toISOString() : null, precision: "day", bound: until > from ? "span" : "within", tz: null, basis: "source_time" };
    })();
    found.catch(() => saidTimes.delete(key));
    saidTimes.set(key, found);
  }
  return found;
}
/** Source-conversation times for the page's records whose event time was not recorded. */
function useSaidTimes(read: typeof catalogRead, filter: CatalogFilter, page: CatalogPage | null): Record<string, RecordTime | null> {
  const [said, setSaid] = useState<Record<string, RecordTime | null>>({});
  useEffect(() => {
    setSaid({});
    if (!page) return;
    let live = true;
    void (async () => {
      for (const item of page.items.filter(unknownEvent)) {
        const id = item.base.memory.memory_id;
        const time = await saidAt(read, filter, page.selection, id).catch(() => null);
        if (!live) return;
        setSaid(old => ({ ...old, [id]: time }));
      }
    })();
    return () => { live = false; };
  }, [read, filter, page]);
  return said;
}

const dayText = (day: string) => recordTimeText({ from: `${day}T00:00:00+08:00`, until: null, precision: "day", bound: "within", tz: null, basis: "source_time" });
const minute = (at: string) => recordTimeText({ from: at, until: null, precision: "minute", bound: "within", tz: null, basis: "source_time" });

export function CatalogDetailPanel({ memoryId, filter, selection, read, entities, corrections = false, sourceTimes = false }: { memoryId: string; filter: CatalogFilter; selection: CatalogSelection; read: typeof catalogRead; entities: FacetGroup["values"]; corrections?: boolean; sourceTimes?: boolean }) {
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
  const [said, setSaid] = useState<RecordTime | null>(null);
  useEffect(() => {
    setSaid(null);
    if (!sourceTimes || !detail?.item || !unknownEvent(detail.item)) return;
    let live = true;
    saidAt(read, filter, selection, memoryId).then(time => { if (live) setSaid(time); }, () => undefined);
    return () => { live = false; };
  }, [sourceTimes, detail, read, filter, selection, memoryId]);
  const quoted = (evidence: CatalogEvidence) => {
    setSource(null);
    void sources.run(async () => {
      const result = await read({ operation: "source", source: { source_id: evidence.reference.source_id, source_revision: evidence.reference.source_revision }, start: evidence.start, limit: evidence.end - evidence.start });
      if (catalogScopeKey(result.header.selection) !== catalogScopeKey(selection)) throw "catalog_stale";
      if (result.source && (result.excerpt !== evidence.quote || result.end !== evidence.end || result.source_record?.anchor_hash !== evidence.reference.object_hash)) throw "catalog_response_unsupported";
      return result;
    }, setSource);
  };
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  const copy = (id: string) => { navigator.clipboard.writeText(id).then(() => setCopied("copied"), () => setCopied("failed")); };
  // UI v2 Memory Inspector: status block, kind, Copy ID; the id; the text large;
  // why it is kept (formation and quoted evidence); the record fields; revisions;
  // then the confirmed-change controls.
  const item = detail?.item ?? null;
  const fields = item && detail?.fields ? detail.fields : null;
  return <section className="mem-detail" aria-label={t("Catalog record detail")} aria-busy={details.busy || sources.busy}>
    <div className="qr50 mem-detail-bar">
      {item && fields && <>
        <span className="qr48" data-status={item.base.adoption === "staged" ? "candidate" : "canonical"}>{word(item.base.adoption)}</span>
        <span className="qr9">{word(item.base.dimensions.kind)}</span>
      </>}
      <div className="qr30" />
      {item && fields && <button type="button" className="qr49" onClick={() => copy(item.base.memory.memory_id)}>{copied === "copied" ? t("Copied") : t("Copy ID")}</button>}
      <button type="button" className="qr49 mem-refresh" disabled={details.busy} aria-label={t("Refresh record detail")} title={t("Refresh record detail")} onClick={() => void load()}>↻</button>
    </div>
    {details.busy && <p role="status" className="am-fine">{t("Reading record detail…")}</p>}
    <ErrorBox error={details.error} />
    {detail && !item && <p role="status" className="am-fine">{t("This record is no longer available in the current scope.")}</p>}
    {item && detail?.fields && <>
      <div className="qr54">
        <div className="qr51">{item.base.memory.memory_id}{item.base.memory.revision > 1 ? ` · r${item.base.memory.revision}` : ""}</div>
        {copied === "failed" && <p role="alert" className="am-fine">{t("Could not copy. Select the ID and copy it manually.")}</p>}
        {!sameText(detail.fields.title, item.base.content) && <h4 className="qr52 mem-detail-title">{detail.fields.title}</h4>}
        <p className="qr60 mem-detail-text">{item.base.content}</p>
      </div>
      <section className="qr66" aria-label={t("Why I remember this")}>
        <h4 className="qr55">{t("Why I remember this")}</h4>
        {item.formation_reason && <p className="mem-why">{analystText(item.formation_reason) ? `${analystText(item.formation_reason)} · ` : ""}{word(item.formation_reason.interpretation)}{item.formation_reason.note ? <><br /><span className="mem-content">{item.formation_reason.note}</span>{item.formation_reason.note_is_machine_annotation && <span className="mem-row-meta"> · {t(analystText(item.formation_reason) ? "ChatGPT note, not a fact" : "machine note, not a fact")}</span>}</> : null}</p>}
        <p className="mem-row-meta">{t("Quoted text evidence; attachment content is not read.")}</p>
        <ul className="mem-list mem-detail-list">{detail.fields.evidence.map((evidence, index) => <li key={index}>
          <blockquote className="mem-quote">{evidence.quote}</blockquote>
          <p className="mem-row-meta mem-content">{shortId(evidence.reference.source_id)} · {evidence.start}–{evidence.end}
            <button type="button" className="mem-link mem-quote-read" disabled={sources.busy} aria-label={t("Read quoted source {n}", { n: index + 1 })} onClick={() => quoted(evidence)}>{t("Read quoted source")}</button></p>
        </li>)}</ul>
      </section>
      {sources.busy && <p role="status" className="am-fine">{t("Reading quoted source…")}</p>}
      <ErrorBox error={sources.error} />
      {source && !source.source && <p role="status" className="am-fine">{t("This source revision is no longer available.")}</p>}
      {source?.source && source.source_record && <section className="qr66" aria-label={t("Quoted source excerpt")}>
        <h4 className="qr55">{t("Quoted source excerpt")}</h4><blockquote className="mem-quote">{source.excerpt}</blockquote>
        <p className="mem-row-meta mem-content">{source.source.source_id} · r{source.source.source_revision} · {source.start}–{source.end} / {source.total_characters}</p>
        <p className="mem-row-meta">{source.source_record.speaker} · {source.source_record.evidence_class} · {source.source_record.source_kind}</p>
        <p className="mem-row-meta">{source.source_record.original_conversation_id} {source.source_record.original_message_id}</p>
      </section>}
      <div className="qr66"><div className="qr55">{t("Record")}</div><RecordFields item={item} entities={entities} said={said} /></div>
      {detail.history && detail.history.length > 0 && <section className="qr66" aria-label={t("Revision history")}>
        <h4 className="qr55">{t("Revision history")}</h4>
        <ol className="mem-list mem-detail-list">{detail.history.map(h => <li key={h.memory.memory.revision} className="mem-row-meta">r{h.memory.memory.revision} · {word(h.change)} · {word(h.adoption)} · {backfilled(item) && h.memory.memory.revision === 1 ? t("Initialization") : minute(h.learned_at)}</li>)}</ol>
        {(detail.history_count_in_scope ?? 0) > detail.history.length && <p className="mem-row-meta">{t("{shown} of {total} revisions shown.", { shown: detail.history.length, total: detail.history_count_in_scope ?? 0 })}</p>}
      </section>}
      {detail.history && detail.history.length > 1 && <RevisionCompare key={item.base.memory.memory_id} memoryId={item.base.memory.memory_id} revisions={detail.history.map(h => h.memory.memory.revision)} />}
      {corrections && <CorrectionPanel key={`${item.base.memory.memory_id}:${item.base.memory.revision}`} detail={detail} entities={entities} />}
    </>}
  </section>;
}
function RecordFields({ item, entities, said = null }: { item: NonNullable<CatalogDetail["item"]>; entities: FacetGroup["values"]; said?: RecordTime | null }) {
  const reason = item.formation_reason;
  return <dl className="mem-facts">
    {!unknownEvent(item) ? <><dt>{t("Happened")}</dt><dd>{recordTimeText(item.event_time)}</dd></>
      : said ? <><dt>{t("Mentioned on")}</dt><dd>{recordTimeText(said)}<br /><span className="mem-row-meta">{t("When the cited turns were said, not necessarily when it happened.")}</span></dd></>
      : <><dt>{t("Happened")}</dt><dd>{recordTimeText(item.event_time)}</dd></>}
    <dt>{t("Valid")}</dt><dd>{item.valid_time && item.valid_time.precision !== "unknown" ? recordTimeText(item.valid_time) : t("No window recorded")}</dd>
    {backfilled(item) ? <><dt>{t("Learned")}</dt><dd>{t("Initialization")}</dd></> : item.base.learned_at && <><dt>{t("Learned")}</dt><dd>{minute(item.base.learned_at)}</dd></>}
    {item.effective_sensitivity && <><dt>{t("Sensitivity")}</dt><dd>{word(item.effective_sensitivity)}</dd></>}
    {item.entities && item.entities.length > 0 && <><dt>{t("Involves")}</dt><dd>{item.entities.map(e => `${entities.find(v => v.value === e.entity_id)?.label ?? t("Unnamed entity")} (${word(e.role)})`).join(" · ")}</dd></>}
    {reason && <><dt>{t("Why it formed")}</dt><dd>{analystText(reason) && <strong>{analystText(reason)} · </strong>}{word(reason.interpretation)} · {word(reason.mode)} · {reason.rule_version}
      {reason.note && <><br /><span className="mem-content">{reason.note}</span>{reason.note_is_machine_annotation && <span className="mem-row-meta"> · {t(analystText(reason) ? "ChatGPT note, not a fact" : "machine note, not a fact")}</span>}</>}</dd></>}
  </dl>;
}
