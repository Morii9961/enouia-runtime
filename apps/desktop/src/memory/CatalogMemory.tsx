import { useCallback, useEffect, useRef, useState } from "react";
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
    }, ({ next, counts }) => { setPage(next); setStats(counts); if (next.facets?.length) setFacetGroups(next.facets); }, () => { setPage(null); setStats(null); });
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
  // UI v2 Memory Vault list: a header line, a compact filter bar, day bands and
  // rows (time · kind line · title · two-line text · meta); a selected row is the
  // ink block. Class names tests and smokes use (.mem-list, li, the title button)
  // are kept.
  const clock = (at?: string) => at ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(at)) : "—";
  return <>
    <div className="qr45" aria-busy={reads.busy}>
      <div className="qr31">
        <h2 ref={heading} tabIndex={-1} className="qr29">{t("Native memory catalog")}</h2>
        {open && page && stats && <div className="qr19">{t("{shown} shown · {matched} matching authorized records", { shown: page.items.length, matched: stats.matched_in_scope })}</div>}
        <div className="qr30" />
        <div className="qr19 mem-catalog-mode">{t(owner ? "Registered library · confirmed changes only" : mode ? "Isolated synthetic read-2" : "Reading library state…")}</div>
      </div>
      <div className="qr44">
        <div className="mem-catalog-head">
          {mode && <p className="am-fine">{t(owner ? "This entry reads the explicitly registered library. A change is planned first and written only after you confirm it. Nothing is sent to a model." : "This library contains fixed fictional records. It does not open Morii's Vault or run continuous formation.")}</p>}
          {observationError && <p role="alert">{describe(observationError.cause)}</p>}
          <ErrorBox error={reads.error} />
          <p role="status" className="am-fine">{status ? t("Library: {state}", { state: status.state }) : observationError ? t("Library state is unknown.") : t("Reading library state…")}</p>
          {open && reads.busy && <p role="status" className="am-fine">{t("Reading catalog page and statistics…")}</p>}
          {status?.reason && <p role="alert">{describe(status.reason)}</p>}
          {status?.state === "disabled" && <p className="am-fine">{t(owner ? "No registered library was opened at startup." : "No segmented synthetic library is enabled in this session.")}</p>}
          {status?.state === "failed" && <p className="am-fine">{t(owner ? "The registered library could not be opened. No other library was selected." : "The synthetic library is unavailable. Start a new synthetic session to recover.")}</p>}
          {owner && status?.state === "locked" && <p className="am-fine">{t("The library is closed. Exit Runtime and explicitly launch the registered library again to reopen it.")}</p>}
          <div className="am-filters">
            <form className="mem-catalog-search" role="search" onSubmit={event => { event.preventDefault(); if (!open || reads.pending.current) return; epoch.current += 1; observedScope.current = null; clear(); setFilter({ ...CATALOG_FILTER, text: draft }); }}>
              <label className="am-search"><span className="am-lbl">{t("Literal catalog search")}</span><input value={draft} maxLength={512} autoComplete="off" onChange={event => setDraft(event.target.value)} /></label>
              <button className="am-chip" disabled={!open || reads.busy}>{t("Search catalog")}</button>
            </form>
            {open && facetGroups.length > 0 && <fieldset className="mem-catalog-facets" disabled={reads.busy}>
              <legend className="am-lbl">{t("Filter records")}</legend>
              {AXES.map(axis => {
                const group = facetGroups.find(g => g.axis === axis);
                if (!group || (group.values.length === 0 && filter[axis] === null)) return null;
                return <label key={axis} className="am-select-filter"><span className="am-lbl">{word(axis)}</span><select value={filter[axis] ?? ""} onChange={event => {
                  if (reads.pending.current) return;
                  epoch.current += 1; observedScope.current = null; clear();
                  setFilter({ ...filter, [axis]: event.target.value || null });
                }}>
                  <option value="">{t("All")}</option>
                  {group.values.map(v => <option key={v.value} value={v.value}>{`${axis === "entity" || axis === "project" ? v.label : word(v.value)} · ${v.count}`}</option>)}
                </select></label>;
              })}
            </fieldset>}
            <div className="mem-catalog-actions">
              {open && <button className="am-chip" disabled={reads.busy} onClick={() => void load()}>{t("Refresh catalog")}</button>}
              {(open || (!owner && status?.state === "locked")) && <button className="am-chip" disabled={reads.busy} onClick={event => {
                if (document.activeElement === event.currentTarget) heading.current?.focus();
                void control(open ? "lock" : "unlock");
              }}>{t(owner ? "Lock registered library" : open ? "Lock synthetic library" : "Unlock synthetic library")}</button>}
            </div>
          </div>
          {open && facetGroups.length > 0 && <FacetNote groups={facetGroups} />}
          {open && page && stats && <p className="am-fine">{t("Counts cover currently authorized machine revisions for this selection.")} · {t("{unknown} records have unknown event dates in this filter scope.", { unknown: page.unknown_time_in_scope })} · {t("State observed at {time}", { time: page.authorized_at })}</p>}
        </div>
        {open && page && stats && <>
          {dayGroups(page.items).map(([day, items]) => <section key={day ?? "unknown"} className="mem-day-group" aria-label={day ? dayText(day) : t("Learned date not recorded")}>
          <h3 className="qr33 mem-day">{day ? dayText(day) : t("Learned date not recorded")}</h3>
          <ul className="mem-list mem-catalog-rows">{items.map(item => {
            const id = item.base.memory.memory_id, chosen = selectedId === id;
            return <li key={`${id}:${item.base.memory.revision}`} className="qr43 mem-catalog-row" data-status={item.base.adoption === "staged" ? "candidate" : "canonical"} data-selected={chosen || undefined} onClick={() => setSelectedId(id)}>
              <span className="qr34">{clock(item.base.learned_at)}</span>
              <span className="qr42">
                <span className="qr38"><span>{word(item.base.dimensions.kind)}</span><span className="qr35">· {word(item.base.knowledge)}</span>{item.base.adoption !== "adopted" && <span className="qr37" data-status="candidate">{word(item.base.adoption)}</span>}</span>
                <h3 className="mem-catalog-title"><button type="button" className="mem-link" aria-pressed={chosen} aria-label={t("Read catalog detail: {title}", { title: item.title })} onClick={event => { event.stopPropagation(); setSelectedId(id); }}>{item.title}</button></h3>
                <span className="qr39">{item.base.content}</span>
                <span className="qr41">
                  {(item.event_time || said[id]) && <span>{t("Happened: {time}", { time: recordTimeText(item.event_time) })}{unknownEvent(item) && said[id] ? ` · ${t("said in conversation {time}", { time: recordTimeText(said[id]) })}` : ""}</span>}
                  {item.effective_sensitivity && <span>{word(item.effective_sensitivity)}</span>}
                  {analystText(item.formation_reason) && <span>{analystText(item.formation_reason)}</span>}
                  <span className="qr40">{shortId(id)} · r{item.base.memory.revision}</span>
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
      {!(open && page && stats && selectedId) && <p className="qr46">{t(open && page && stats ? "Page statistics were read for the same selection." : "No catalog page is currently observed.")}</p>}
      {open && page && stats && selectedId && <p className="am-fine">{t("Page statistics were read for the same selection.")}</p>}
      <p className="am-fine">{t(owner ? "Records and source excerpts come from the same registered library. Formed records are not independent verification." : "System formation preserves what the synthetic subject said. It is not independent verification or confirmation by Morii.")}</p>
      {open && page && stats && selectedId && <CatalogDetailPanel key={`${catalogScopeKey(page.selection)}:${selectedId}`} memoryId={selectedId} filter={filter} selection={page.selection} read={read} entities={facetGroups.find(g => g.axis === "entity")?.values ?? []} corrections={status?.corrections === true} sourceTimes={owner} />}
    </div></aside>
  </>;
}
function FacetNote({ groups }: { groups: FacetGroup[] }) {
  const truncated = groups.some(g => AXES.includes(g.axis as typeof AXES[number]) && g.values.length < g.total_values);
  return <p className="mem-row-meta">{t(truncated ? "Counts follow the other active filters. Some lists show only their first values." : "Counts follow the other active filters.")}</p>;
}

/** R5 A11: consecutive records learned on the same local day share one divider. */
function dayGroups(items: CatalogPage["items"]): [string | null, CatalogPage["items"]][] {
  const groups: [string | null, CatalogPage["items"]][] = [];
  for (const item of items) {
    const at = item.base.learned_at;
    const day = at ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at)) : null;
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
  // UI v2 Memory Inspector: status block, kind and id, the title large, then
  // labelled sections (record, revisions, quoted evidence) with key/value rows.
  return <section className="mem-detail" aria-label={t("Catalog record detail")} aria-busy={details.busy || sources.busy}>
    <div className="qr50 mem-detail-bar">
      <h3 className="qr55">{t("Catalog record detail")}</h3>
      <div className="qr30" />
      <button type="button" className="qr49" disabled={details.busy} onClick={() => void load()}>{t("Refresh record detail")}</button>
    </div>
    {details.busy && <p role="status" className="am-fine">{t("Reading record detail…")}</p>}
    <ErrorBox error={details.error} />
    {detail && !detail.item && <p role="status" className="am-fine">{t("This record is no longer available in the current scope.")}</p>}
    {detail?.item && detail.fields && <>
      <div className="qr54">
        <div className="qr50">
          <span className="qr48" data-status={detail.item.base.adoption === "staged" ? "candidate" : "canonical"}>{word(detail.item.base.adoption)}</span>
          <span className="qr9">{word(detail.item.base.dimensions.kind)}</span>
        </div>
        <div className="qr51">{detail.item.base.memory.memory_id} · r{detail.item.base.memory.revision}</div>
        <h4 className="qr52 mem-detail-title">{detail.fields.title}</h4>
        <p className="qr60 mem-detail-text">{detail.item.base.content}</p>
      </div>
      <div className="qr66"><div className="qr55">{t("Record")}</div><RecordFields item={detail.item} entities={entities} said={said} /></div>
      {detail.history && detail.history.length > 0 && <section className="qr66" aria-label={t("Revision history")}>
        <h4 className="qr55">{t("Revision history")}</h4>
        <ol className="mem-list mem-detail-list">{detail.history.map(h => <li key={h.memory.memory.revision} className="mem-row-meta">r{h.memory.memory.revision} · {word(h.change)} · {word(h.adoption)} · {minute(h.learned_at)}</li>)}</ol>
        {(detail.history_count_in_scope ?? 0) > detail.history.length && <p className="mem-row-meta">{t("{shown} of {total} revisions shown.", { shown: detail.history.length, total: detail.history_count_in_scope ?? 0 })}</p>}
      </section>}
      {detail.history && detail.history.length > 1 && <RevisionCompare key={detail.item.base.memory.memory_id} memoryId={detail.item.base.memory.memory_id} revisions={detail.history.map(h => h.memory.memory.revision)} />}
      {corrections && <CorrectionPanel key={`${detail.item.base.memory.memory_id}:${detail.item.base.memory.revision}`} detail={detail} entities={entities} />}
      <div className="qr66">
        <div className="qr55">{t("Quoted text evidence; attachment content is not read.")}</div>
        <ul className="mem-list mem-detail-list">{detail.fields.evidence.map((evidence, index) => <li key={index}>
          <blockquote className="mem-quote">{evidence.quote}</blockquote>
          <p className="mem-row-meta mem-content">{evidence.reference.source_id} · r{evidence.reference.source_revision} · {evidence.start}–{evidence.end}</p>
          <button type="button" className="qr63" disabled={sources.busy}
            aria-label={t("Read quoted source {n}", { n: index + 1 })} onClick={() => quoted(evidence)}>{t("Read quoted source")}</button>
        </li>)}</ul>
      </div>
    </>}
    {sources.busy && <p role="status" className="am-fine">{t("Reading quoted source…")}</p>}
    <ErrorBox error={sources.error} />
    {source && !source.source && <p role="status" className="am-fine">{t("This source revision is no longer available.")}</p>}
    {source?.source && source.source_record && <section className="qr66" aria-label={t("Quoted source excerpt")}>
      <h4 className="qr55">{t("Quoted source excerpt")}</h4><blockquote className="mem-quote">{source.excerpt}</blockquote>
      <p className="mem-row-meta mem-content">{source.source.source_id} · r{source.source.source_revision} · {source.start}–{source.end} / {source.total_characters}</p>
      <p className="mem-row-meta">{source.source_record.speaker} · {source.source_record.evidence_class} · {source.source_record.source_kind}</p>
      <p className="mem-row-meta">{source.source_record.original_conversation_id} {source.source_record.original_message_id}</p>
    </section>}
  </section>;
}
function RecordFields({ item, entities, said = null }: { item: NonNullable<CatalogDetail["item"]>; entities: FacetGroup["values"]; said?: RecordTime | null }) {
  const reason = item.formation_reason;
  return <dl className="mem-facts">
    <dt>{t("Happened")}</dt><dd>{recordTimeText(item.event_time)}</dd>
    {said && <><dt>{t("Said in conversation")}</dt><dd>{recordTimeText(said)}<br /><span className="mem-row-meta">{t("When the cited turns were said, not necessarily when it happened.")}</span></dd></>}
    <dt>{t("Valid")}</dt><dd>{item.valid_time && item.valid_time.precision !== "unknown" ? recordTimeText(item.valid_time) : t("No window recorded")}</dd>
    {item.base.learned_at && <><dt>{t("Learned")}</dt><dd>{minute(item.base.learned_at)}</dd></>}
    {item.effective_sensitivity && <><dt>{t("Sensitivity")}</dt><dd>{word(item.effective_sensitivity)}</dd></>}
    {item.entities && item.entities.length > 0 && <><dt>{t("Involves")}</dt><dd>{item.entities.map(e => `${entities.find(v => v.value === e.entity_id)?.label ?? t("Unnamed entity")} (${word(e.role)})`).join(" · ")}</dd></>}
    {reason && <><dt>{t("Why it formed")}</dt><dd>{analystText(reason) && <strong>{analystText(reason)} · </strong>}{word(reason.interpretation)} · {word(reason.mode)} · {reason.rule_version}
      {reason.note && <><br /><span className="mem-content">{reason.note}</span>{reason.note_is_machine_annotation && <span className="mem-row-meta"> · {t(analystText(reason) ? "ChatGPT note, not a fact" : "machine note, not a fact")}</span>}</>}</dd></>}
  </dl>;
}
