// Registered read-only entry: the Memory workspaces, Sessions and readings
// over the pinned Memory projections (ADR-MEM-100/101/103). Every view reads
// the same registered catalog, renders only what Core returns and withdraws its
// data when the library closes or its scope changes. Nothing here writes.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CATALOG_FILTER, catalogRead, catalogRecall, catalogScopeKey, catalogView, type AttentionSchedule, type ReviewSuggestions, type TargetRef, type RecallPreview, type RecallQuery, type ActivityPage, type CatalogFilter, type CatalogPage, type CatalogSelection, type Conflicts,
  type CatalogSource, type CatalogStats, type ConversationDetail, type Conversations, type GraphPage, type Neighbors, type TimeBuckets } from "./catalog";
import { CatalogDetailPanel } from "./CatalogMemory";
import { TranscriptTimeMap } from "./SessionTranscript";
import type { MapSpec as SessionMapSpec } from "../theme/TimeMap";
import { ConflictCompare } from "./Compare";
import { RegisteredConstellation, RegisteredStarMap } from "./Constellation";
import { CapsuleIndex, SaveCapsule } from "./Capsules";
import { ConnectorStatus } from "./Connector";
import { analystText, recordTimeText, word } from "./catalogWords";
import { useLatestRead } from "./hooks";
import { useStatus, registeredLabel } from "./status";
import { ErrorBox, shortId } from "./ui";
import { describe } from "./client";
import NativeHome from "./NativeHome";
import type { MapSpec } from "../theme/TimeMap";
import { nativeDate } from "../theme/nativeTime";
import { msg, t } from "../i18n";

/** Renders children only while the registered library is open, keyed by its scope. */
export function Open({ children, title }: { children: (selection: CatalogSelection) => ReactNode; title: string }) {
  const { nativeStatus } = useStatus();
  const selection = nativeStatus?.state === "open" ? nativeStatus.selection ?? null : null;
  if (!selection) return <div className="qr45"><div className="mem-gate"><div className="mem-card mem-stack">
    <h2 className="mem-h2">{title}</h2><p role="status">{registeredLabel(nativeStatus)}</p>
  </div></div></div>;
  return <div key={catalogScopeKey(selection)} style={{ display: "contents" }}>{children(selection)}</div>;
}
const stamp = (at: string) => nativeDate(Date.parse(at), { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function Observed({ at }: { at: string }) { return <p className="mem-row-meta">{t("State observed at {time}", { time: stamp(at) })}</p>; }

// ---- Shared workspace pieces (UI v2) --------------------------------------------
/** A workspace's header line: title, a short reading, then its own controls. */
function WorkspaceHead({ title, reading, children }: { title: string; reading?: ReactNode; children?: ReactNode }) {
  return <div className="qr31 mem-ws-head"><h2 className="qr29">{title}</h2>{reading != null && <div className="qr19">{reading}</div>}<div className="qr30" />{children}</div>;
}
/** A button group in the design's bordered view-button style. */
function Views<K extends string>({ label, items, value, onChange, disabled }: { label: string; items: readonly (readonly [K, string])[]; value: K; onChange: (k: K) => void; disabled?: boolean }) {
  return <div className="am-views mem-ws-views" role="group" aria-label={label}>
    {items.map(([k, text]) => <button key={k} type="button" className="am-view" aria-pressed={value === k} disabled={disabled} onClick={() => onChange(k)}><span className="am-vn">{text}</span></button>)}
  </div>;
}
/** One record row in the design's list style: time column, kind line, title, meta. */
function RecordRow({ time, kind, status, title, meta, selected, onPick }: { time: ReactNode; kind: ReactNode; status?: string | null; title: string; meta?: ReactNode; selected: boolean; onPick: () => void }) {
  return <li className="qr43 mem-catalog-row" data-status={status === "staged" ? "candidate" : "canonical"} data-selected={selected || undefined} onClick={onPick}>
    <span className="qr34">{time}</span>
    <span className="qr42">
      <span className="qr38">{kind}{status && status !== "adopted" && <span className="qr37" data-status="candidate">{word(status)}</span>}</span>
      <h3 className="mem-catalog-title"><button type="button" className="mem-link" aria-pressed={selected} onClick={event => { event.stopPropagation(); onPick(); }}>{title}</button></h3>
      {meta != null && <span className="qr41">{meta}</span>}
    </span>
  </li>;
}
const hhmm = (at: string | number) => nativeDate(typeof at === "number" ? at : Date.parse(at), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const localDay = (at: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
const dayBand = (day: string) => nativeDate(Date.parse(`${day}T12:00:00+08:00`), { weekday: "long", day: "numeric", month: "long" });
/** Consecutive items on the same local day share one band. */
function byDay<T>(items: T[], at: (item: T) => string | null | undefined): [string | null, T[]][] {
  const groups: [string | null, T[]][] = [];
  for (const item of items) { const when = at(item); const day = when ? localDay(when) : null; const last = groups.at(-1); if (last && last[0] === day) last[1].push(item); else groups.push([day, [item]]); }
  return groups;
}

// ---- Time --------------------------------------------------------------------
const AXES = [["event", msg("When it happened")], ["learned", msg("When it was learned")], ["source_captured", msg("When the source was captured")]] as const;
type Axis = typeof AXES[number][0];

export function RegisteredTime() {
  return <Open title={t("Time")}>{() => <TimeView />}</Open>;
}
function TimeView() {
  const [axis, setAxis] = useState<Axis>("event");
  const [months, setMonths] = useState<TimeBuckets | null>(null);
  const [chosen, setChosen] = useState<TimeBuckets["buckets"][number] | null>(null);
  // R5 A4/A5: the chosen month's days, with material / staged / adopted layers.
  const [days, setDays] = useState<TimeBuckets | null>(null);
  const [day, setDay] = useState<TimeBuckets["buckets"][number] | null>(null);
  const dayReads = useLatestRead();
  const [page, setPage] = useState<CatalogPage | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const reads = useLatestRead(), records = useLatestRead();
  const load = useCallback(() => {
    setMonths(null); setChosen(null); setPage(null); setSelected(null); setDays(null); setDay(null); records.clear(); dayReads.clear();
    const until = `${new Date().getFullYear() + 1}-01-01`;
    return reads.run(() => catalogView({ operation: "time_buckets", filter: CATALOG_FILTER, selection: null,
      query: { axis, timezone: "Asia/Shanghai", granularity: "month", from_date: "2000-01-01", until_date: until } }), setMonths);
  }, [axis, reads.run, records.clear, dayReads.clear]);
  useEffect(() => { void load(); }, [load]);
  const list = (bucket: TimeBuckets["buckets"][number]) => {
    setPage(null); setSelected(null);
    const filter: CatalogFilter = { ...CATALOG_FILTER, time_axis: axis, time_window: { from: bucket.from, until: bucket.until } };
    void records.run(() => catalogRead({ operation: "page", filter, cursor: null, limit: 50 }), next => { setPage(next); setSelected(next.items[0]?.base.memory.memory_id ?? null); });
  };
  const choose = (bucket: TimeBuckets["buckets"][number]) => {
    setChosen(bucket); setDay(null); setDays(null);
    list(bucket);
    const [y, m] = bucket.local_start.slice(0, 7).split("-").map(Number);
    const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
    void dayReads.run(() => catalogView({ operation: "time_buckets", filter: CATALOG_FILTER, selection: null,
      query: { axis, timezone: "Asia/Shanghai", granularity: "day", from_date: bucket.local_start.slice(0, 10), until_date: next } }), setDays);
  };
  const pickDay = (bucket: TimeBuckets["buckets"][number]) => { setDay(bucket); list(bucket); };
  const cell = (n: number) => n > 0 ? n : <span className="mem-time-empty" aria-hidden="true">·</span>;
  const years = useMemo(() => {
    const byYear = new Map<string, TimeBuckets["buckets"]>();
    for (const b of months?.buckets ?? []) if (b.possible_records > 0) { const y = b.local_start.slice(0, 4); byYear.set(y, [...(byYear.get(y) ?? []), b]); }
    return [...byYear].reverse();
  }, [months]);
  // Open on the newest month with records, as the design opens on the newest month.
  useEffect(() => { const newest = years[0]?.[1].at(-1); if (months && newest && !chosen) choose(newest); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months]);
  const monthName = (b: TimeBuckets["buckets"][number]) => nativeDate(Date.parse(`${b.local_start.slice(0, 7)}-15T12:00:00+08:00`), { month: "short" });
  const monthTitle = (b: TimeBuckets["buckets"][number]) => nativeDate(Date.parse(`${b.local_start.slice(0, 7)}-15T12:00:00+08:00`), { month: "long", year: "numeric" });
  const axisTime = (item: CatalogPage["items"][number]) => axis === "event" ? item.event_time?.from ?? null : axis === "learned" ? item.base.learned_at ?? null : item.base.source_captured_at ?? null;
  return <>
    <div className="qr45" aria-busy={reads.busy}>
      <WorkspaceHead title={t("Timeline")} reading={months ? t("{n} records have no recorded time on this axis.", { n: months.unknown_time_in_scope }) : reads.busy ? t("Reading time buckets…") : undefined}>
        <Views label={t("Time axis")} items={AXES.map(([id, label]) => [id, t(label)] as const)} value={axis} onChange={setAxis} disabled={reads.busy} />
        <button type="button" className="mem-link mem-ws-reload" disabled={reads.busy} onClick={() => void load()}>{t("Read again")}</button>
      </WorkspaceHead>
      <div className="qr44 mem-time-body">
        <ErrorBox error={reads.error} />
        {months && <div className="mem-time-layout">
          <nav className="mem-time-rail" aria-label={t("Months with records")}>
            {years.length === 0 && <p className="mem-row-meta">{t("No dated records on this axis.")}</p>}
            {years.map(([year, list]) => <div key={year} className="mem-time-year"><div className="qr23">{year}</div>
              {list.map(b => <button key={b.local_start} type="button" className="mem-time-cell" aria-pressed={chosen?.local_start === b.local_start}
                aria-label={t("{month}: {n} records", { month: b.local_start.slice(0, 7), n: b.possible_records })} onClick={() => choose(b)}>
                <span>{monthName(b)}</span><span className="qr25">{b.possible_records}</span></button>)}
            </div>)}
          </nav>
          <div className="mem-time-main">
            {chosen ? <section className="mem-stack" aria-label={t("Records in {month}", { month: chosen.local_start.slice(0, 7) })} aria-busy={records.busy}>
              <h3 className="mem-time-title">{monthTitle(chosen)}</h3>
              <p className="mem-row-meta">{t("{adopted} adopted · {staged} staged · {material} captured sources", { adopted: chosen.adopted, staged: chosen.staged, material: chosen.captured_material })} · {t("A record whose time spans several months is counted in each of them, so month counts do not add up to the total.")}</p>
              {dayReads.busy && <p role="status">{t("Reading days…")}</p>}
              <ErrorBox error={dayReads.error} />
              {days && <div className="mem-table-scroll"><table className="mem-coverage" data-coverage-calendar aria-label={t("Coverage by day")}>
                <thead><tr><th scope="col">{t("Day")}</th>{days.buckets.map(b => <th key={b.local_start} scope="col">{b.possible_records > 0
                  ? <button type="button" className="mem-link" aria-pressed={day?.local_start === b.local_start} aria-label={t("{day}: {n} records", { day: b.local_start.slice(0, 10), n: b.possible_records })} onClick={() => pickDay(b)}>{Number(b.local_start.slice(8, 10))}</button>
                  : Number(b.local_start.slice(8, 10))}</th>)}</tr></thead>
                <tbody>
                  <tr><th scope="row">{t("Captured sources")}</th>{days.buckets.map(b => <td key={b.local_start}>{cell(b.captured_material)}</td>)}</tr>
                  <tr><th scope="row">{t("Staged")}</th>{days.buckets.map(b => <td key={b.local_start}>{cell(b.staged)}</td>)}</tr>
                  <tr><th scope="row">{t("Adopted")}</th>{days.buckets.map(b => <td key={b.local_start}>{cell(b.adopted)}</td>)}</tr>
                </tbody></table></div>}
              {days && <p className="mem-row-meta">{t("Captured sources are material, not records. A day with no material shows a dot, not a zero claim about what happened.")}</p>}
              {day && <p className="mem-content" role="status">{t("Showing records on {day}.", { day: day.local_start.slice(0, 10) })} <button type="button" className="mem-link" onClick={() => { setDay(null); list(chosen); }}>{t("Show the whole month")}</button></p>}
              {records.busy && <p role="status">{t("Reading records…")}</p>}
              <ErrorBox error={records.error} />
              {page && <><p className="mem-row-meta">{t("{shown} shown · {matched} matching authorized records", { shown: page.items.length, matched: page.matched_in_scope })}</p>
                {byDay(page.items, axisTime).map(([d, items], i) => <section key={`${d}:${i}`} className="mem-day-group">
                  <h4 className="qr33 mem-day">{d ? dayBand(d) : monthTitle(chosen)}</h4>
                  <ul className="mem-list mem-catalog-rows">{items.map(item => { const at = axisTime(item); return <RecordRow key={item.base.memory.memory_id}
                    time={at && (axis !== "event" || item.event_time?.precision === "instant" || item.event_time?.precision === "minute") ? hhmm(at) : "—"}
                    kind={word(item.base.dimensions.kind)} status={item.base.adoption} title={item.title}
                    meta={<span>{recordTimeText(axis === "event" ? item.event_time : { from: at, until: null, precision: "day", bound: "within", tz: null, basis: "source_time" })}</span>}
                    selected={selected === item.base.memory.memory_id} onPick={() => setSelected(item.base.memory.memory_id)} />; })}</ul>
                </section>)}</>}
            </section> : months && years.length > 0 && <p className="qr32">{t("Choose a month, then a record, to read its detail and quoted sources.")}</p>}
            <section className="mem-time-unknown" aria-label={t("Time not recorded")}>
              <h3 className="mem-time-title">{t("Time not recorded")}</h3>
              <p className="mem-row-meta">{t("{n} records have no recorded time on this axis.", { n: months.unknown_time_in_scope })}</p>
            </section>
          </div>
        </div>}
      </div>
    </div>
    <aside className="qr88" aria-label={t("Automatic Memory Inspector")}><div className="qr79 mem-v2">
      {page && selected ? <CatalogDetailPanel key={selected} memoryId={selected} filter={CATALOG_FILTER} selection={page.selection} read={catalogRead} entities={[]} sourceTimes />
        : <p className="qr46">{t("Choose a month, then a record, to read its detail and quoted sources.")}</p>}
    </div></aside>
  </>;
}

// ---- Connections -------------------------------------------------------------
export function RegisteredConnections() {
  return <Open title={t("Connections")}>{() => <ConnectionsView />}</Open>;
}
type Graph = { nodes: GraphPage["nodes"]; edges: GraphPage["edges"]; first: GraphPage };
const CONNECTION_VIEWS = [["constellation", msg("Constellation")], ["starmap", msg("Star map")], ["chains", msg("Chains and suggestions")]] as const;
type ConnectionView = typeof CONNECTION_VIEWS[number][0];
function ConnectionsView() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [neighbors, setNeighbors] = useState<Neighbors | null>(null);
  const [view, setView] = useState<ConnectionView>("constellation");
  const reads = useLatestRead(), near = useLatestRead();
  const load = useCallback(() => {
    setGraph(null); setSelected(null); setNeighbors(null); near.clear();
    return reads.run(async () => {
      const query = { node_limit: 5000, edge_limit_per_kind: 20000 };
      const first = await catalogView({ operation: "graph", filter: CATALOG_FILTER, query, cursor: null });
      const nodes = [...first.nodes], edges = [...first.edges];
      let next = first.next;
      for (let n = 0; next && n < 80; n++) {
        const more = await catalogView({ operation: "graph", filter: CATALOG_FILTER, query, cursor: next });
        nodes.push(...more.nodes); edges.push(...more.edges); next = more.next;
      }
      if (next) throw "catalog_response_unsupported";
      return { nodes, edges, first };
    }, setGraph);
  }, [reads.run, near.clear]);
  useEffect(() => { void load(); }, [load]);
  const pick = (id: string) => {
    setSelected(id); setNeighbors(null);
    void near.run(() => catalogView({ operation: "neighbors", filter: CATALOG_FILTER, memory_id: id, include_suggestions: true, cursor: null, limit: 32 }), setNeighbors);
  };
  const degree = useMemo(() => {
    const count = new Map<string, number>();
    for (const e of graph?.edges ?? []) { count.set(e.from, (count.get(e.from) ?? 0) + 1); count.set(e.to, (count.get(e.to) ?? 0) + 1); }
    return count;
  }, [graph]);
  const byRelation = useMemo(() => {
    const count = new Map<string, number>();
    for (const e of graph?.edges ?? []) count.set(e.relation, (count.get(e.relation) ?? 0) + 1);
    return count;
  }, [graph]);
  const title = new Map(graph?.nodes.map(n => [n.memory.memory.memory_id, n.title]) ?? []);
  // Memory ADR-MEM-162: term-overlap suggestions, never recorded or semantic relations.
  const lexical = useMemo(() => (graph?.edges ?? []).filter(e => e.relation === "lexical_neighbor").sort((a, b) => (b.score_milli ?? 0) - (a.score_milli ?? 0)), [graph]);
  const terms = (witness: string) => witness.startsWith("shared_terms:") ? witness.slice("shared_terms:".length).split(",").map(s => s.trim()).filter(Boolean).join(", ") : witness;
  const score = (e: { score_milli: number | null }) => e.score_milli == null ? "—" : (e.score_milli / 1000).toFixed(2);
  const chains = useMemo(() => (graph?.edges ?? []).filter(e => e.relation === "derived_from" || e.relation === "reversion"), [graph]);
  const lexicalOf = selected ? lexical.filter(e => e.from === selected || e.to === selected) : [];
  const ranked = [...degree].sort((a, b) => b[1] - a[1]).slice(0, 40);
  // Open on the most connected record, as the design opens on a selected record's neighbourhood.
  useEffect(() => { if (graph && !selected && ranked[0]) pick(ranked[0][0]); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);
  const selectedTitle = selected ? title.get(selected) ?? selected : null;
  return <>
    <div className="qr45" aria-busy={reads.busy}>
      <WorkspaceHead title={t("Connections")} reading={graph ? t("{nodes} records and {edges} relations loaded.", { nodes: graph.nodes.length, edges: graph.edges.length }) : reads.busy ? t("Reading the relation graph…") : undefined}>
        <Views label={t("Connection views")} items={CONNECTION_VIEWS.map(([k, label]) => [k, t(label)] as const)} value={view} onChange={setView} />
        <button type="button" className="mem-link mem-ws-reload" disabled={reads.busy} onClick={() => void load()}>{t("Read again")}</button>
      </WorkspaceHead>
      <div className="qr44 mem-pad mem-stack mem-v2">
        <ErrorBox error={reads.error} />
        {graph && graph.first.header.matched_inputs != null && graph.first.header.matched_inputs > graph.nodes.length && <p role="status">{t("Only the first {n} records are in this graph.", { n: graph.nodes.length })}</p>}
        {graph && view === "constellation" && <>
          {selectedTitle ? <p className="mem-row-meta">{t("{title} and what touches it, one step out. A line is a link, never a cause.", { title: selectedTitle })}</p> : null}
          {selected && neighbors && <RegisteredConstellation key={selected} center={{ id: selected, title: selectedTitle ?? selected }} neighbors={neighbors} pick={pick} />}
          {ranked.length === 0 ? <p className="mem-content">{t("No relations between the loaded records.")}</p> : <section className="mem-stack" aria-label={t("Most connected records")}>
            <h3 className="qr55">{t("Most connected records")}</h3>
            <ul className="mem-list mem-ws-list">{ranked.map(([id, n]) => <li key={id}><button type="button" className="mem-link" aria-pressed={selected === id} onClick={() => pick(id)}>{title.get(id) ?? id}</button><span className="mem-row-meta"> · {t("{n} relations", { n })}</span></li>)}</ul>
          </section>}
        </>}
        {graph && view === "starmap" && <RegisteredStarMap nodes={graph.nodes} edges={graph.edges} selected={selected} pick={pick} />}
        {graph && view === "chains" && <>
          <section className="mem-stack" aria-label={t("Derivation and reversion chains")} data-chains>
            <h3 className="qr55">{t("Derivation and reversion chains")}</h3>
            {chains.length === 0 ? <p className="mem-row-meta">{t("No record in this library is derived from or reverts to another yet. Themes and corrections will show here once they exist.")}</p> :
              <ul className="mem-list mem-ws-list">{chains.map(e => <li key={`${e.relation}|${e.from}|${e.to}`}>
                <button type="button" className="mem-link" onClick={() => pick(e.from)}>{title.get(e.from) ?? e.from}</button>
                <span className="mem-row-meta"> {e.relation === "reversion" ? "↺" : "←"} {word(e.relation)} {e.relation === "reversion" ? "↺" : "←"} </span>
                <button type="button" className="mem-link" onClick={() => pick(e.to)}>{title.get(e.to) ?? e.to}</button>
              </li>)}</ul>}
          </section>
          {lexical.length > 0 && <section className="mem-stack" aria-label={t("Shared-word suggestions")}>
            <h3 className="qr55">{t("Shared-word suggestions")}</h3>
            <p className="mem-row-meta">{t("Records that use several of the same words. A suggestion to look at, not a recorded or semantic relation.")}</p>
            <ul className="mem-list mem-ws-list">{lexical.slice(0, 40).map(e => <li key={`${e.from}|${e.to}`}>
              <button type="button" className="mem-link" onClick={() => pick(e.from)}>{title.get(e.from) ?? e.from}</button> ↔ <button type="button" className="mem-link" onClick={() => pick(e.to)}>{title.get(e.to) ?? e.to}</button>
              <span className="mem-row-meta mem-content"> · {t("shared: {terms} · score {score}", { terms: terms(e.witness), score: score(e) })}</span></li>)}</ul>
          </section>}
        </>}
        {graph && <section className="mem-stack" aria-label={t("Relations")}>
          <h3 className="qr55">{t("Relations")}</h3>
          <table className="mem-table"><thead><tr><th>{t("Relation")}</th><th>{t("Candidates")}</th><th>{t("Shown")}</th></tr></thead>
            <tbody>{graph.first.edge_coverage.map(c => <tr key={c.relation}><td>{word(c.relation)}</td><td>{c.candidates}</td><td>{byRelation.get(c.relation) ?? 0}</td></tr>)}</tbody></table>
          <p className="mem-row-meta">{t("Same entity and same conversation are recorded mentions, not independent verification.")}{graph.first.semantic_neighbors_available ? "" : ` ${t("Semantic neighbours are not available yet.")}`}</p>
          <Observed at={graph.first.header.authorized_at} />
        </section>}
      </div>
    </div>
    <aside className="qr88" aria-label={t("Automatic Memory Inspector")}><div className="qr79 mem-v2" aria-busy={near.busy}>
      {!selected && <p className="qr46">{t("Choose a record to read what it is connected to.")}</p>}
      {selected && graph && <CatalogDetailPanel key={selected} memoryId={selected} filter={CATALOG_FILTER} selection={graph.first.header.selection} read={catalogRead} entities={[]} sourceTimes />}
      {near.busy && <p role="status">{t("Reading connected records…")}</p>}
      <ErrorBox error={near.error} />
      {lexicalOf.length > 0 && <section className="qr66" aria-label={t("Shared-word suggestions")}>
        <h4 className="qr55">{t("Shared-word suggestions")}</h4>
        <ul className="mem-list">{lexicalOf.map(e => { const other = e.from === selected ? e.to : e.from; return <li key={other}>
          <button type="button" className="mem-link" onClick={() => pick(other)}>{title.get(other) ?? other}</button>
          <p className="mem-row-meta mem-content">{t("shared: {terms} · score {score}", { terms: terms(e.witness), score: score(e) })}</p></li>; })}</ul>
      </section>}
      {neighbors && <section className="qr66" aria-label={t("Connected records")}>
        <h4 className="qr55">{t("Connected records")}</h4>
        <p className="mem-row-meta">{t("{n} connected records", { n: neighbors.matched_in_scope })}</p>
        <ul className="mem-list">{neighbors.items.map(item => <li key={item.other.memory.memory.memory_id}>
          <button type="button" className="mem-link" onClick={() => pick(item.other.memory.memory.memory_id)}>{item.other.title}</button>
          <p className="mem-row-meta">{item.relations.map(r => `${word(r.relation)} · ${word(r.class)}`).join(" / ")}</p>
        </li>)}</ul>
      </section>}
    </div></aside>
  </>;
}

// ---- Formation ---------------------------------------------------------------
const KINDS = ["material_captured", "formation", "reevaluation", "synthesis", "correction", "reversion", "state_change"];
export function RegisteredFormation() {
  return <Open title={t("Formation")}>{() => <FormationView />}</Open>;
}
function FormationView() {
  const [tab, setTab] = useState<"events" | "held">("events");
  const [kind, setKind] = useState<string | null>(null);
  const [pages, setPages] = useState<ActivityPage[]>([]);
  const [selected, setSelected] = useState<{ id: string; selection: CatalogSelection } | null>(null);
  const reads = useLatestRead();
  const read = useCallback((cursor: unknown | null) => reads.run(
    () => catalogView({ operation: "activity", filter: CATALOG_FILTER, query: { memory: null, event_kind: kind, include_sources: false }, cursor, limit: 50 }),
    page => {
      setPages(old => cursor ? [...old, page] : [page]);
      // Open on the newest event's record, as the design opens with the Inspector filled.
      const first = page.items.find(e => e.memory)?.memory;
      if (!cursor && first) setSelected(old => old ?? { id: first.memory_id, selection: page.header.selection });
    }), [kind, reads.run]);
  useEffect(() => { setPages([]); setSelected(null); void read(null); }, [read]);
  const last = pages.at(-1);
  const events = pages.flatMap(p => p.items);
  const reading = tab === "held" ? t("Statements kept as hypotheses") : pages[0] ? t("{shown} of {matched} events shown, newest first.", { shown: events.length, matched: pages[0].matched_in_scope }) : reads.busy ? t("Reading what the system did…") : undefined;
  return <>
    <div className="qr45" aria-busy={reads.busy}>
      <WorkspaceHead title={t("Formation")} reading={reading}>
        <Views label={t("Formation views")} items={[["events", t("What the system did")], ["held", t("Held hypotheses")]] as const} value={tab} onChange={setTab} />
        {tab === "events" && <button type="button" className="mem-link mem-ws-reload" disabled={reads.busy} onClick={() => { setPages([]); setSelected(null); void read(null); }}>{t("Read again")}</button>}
      </WorkspaceHead>
      <div className="qr44">
        {tab === "held" ? <div className="mem-pad"><HeldHypotheses selected={selected?.id ?? null} pick={setSelected} /></div> : <>
          <div className="mem-ws-filters">
            <Views label={t("Event kind")} items={[["", t("All")], ...KINDS.map(k => [k, word(k)] as const)] as const} value={kind ?? ""} onChange={k => setKind(k || null)} disabled={reads.busy} />
            {pages[0] && !pages[0].time_derived_events_available && <p className="mem-row-meta">{t("Fading and archiving by time are not recorded as events yet.")}</p>}
          </div>
          <ErrorBox error={reads.error} />
          {byDay(events, e => e.proof.written_at).map(([d, items], i) => <section key={`${d}:${i}`} className="mem-day-group">
            <h3 className="qr33 mem-day">{d ? dayBand(d) : t("Time not recorded")}</h3>
            <ul className="mem-list mem-catalog-rows">{items.map(e => e.memory
              ? <RecordRow key={e.event_id} time={hhmm(e.proof.written_at)} status={e.adoption}
                kind={<span>{word(e.event_kind)}{e.change && e.change !== e.event_kind ? ` · ${word(e.change)}` : ""}</span>} title={e.title ?? e.memory.memory_id}
                meta={<>{analystText(e.formation_reason) && <span>{analystText(e.formation_reason)}</span>}<span className="qr40">{shortId(e.memory.memory_id)}</span></>}
                selected={selected?.id === e.memory.memory_id} onPick={() => setSelected({ id: e.memory!.memory_id, selection: pages[0].header.selection })} />
              : <li key={e.event_id} className="qr43 mem-catalog-row"><span className="qr34">{hhmm(e.proof.written_at)}</span><span className="qr42"><span className="qr38">{word(e.event_kind)}</span><span className="qr39">{e.title ?? t("Source material")}</span></span></li>)}</ul>
          </section>)}
          {last?.next != null && <div className="mem-catalog-more"><button type="button" className="am-chip" disabled={reads.busy} onClick={() => void read(last.next)}>{t("Show older events")}</button></div>}
        </>}
      </div>
    </div>
    <aside className="qr88" aria-label={t("Automatic Memory Inspector")}><div className="qr79 mem-v2">
      {selected ? <><CatalogDetailPanel key={selected.id} memoryId={selected.id} filter={CATALOG_FILTER} selection={selected.selection} read={catalogRead} entities={[]} sourceTimes />
        <ConflictGroup key={`c:${selected.id}`} memoryId={selected.id} open={id => setSelected({ id, selection: selected.selection })} /></>
        : <p className="qr46">{t("Choose an event to read its record, quoted sources and any held contradiction.")}</p>}
    </div></aside>
  </>;
}
// ---- Worth a look (Memory ADR-MEM-164) ------------------------------------------
const HORIZONS = [7, 14, 30, 90];
const REASONS: Record<string, string> = { archives_soon: msg("Archived soon"), validity_ends_soon: msg("Validity ends soon") };
const TRANSITIONS: Record<string, string> = { fading: msg("Starts fading"), archived: msg("Archived") };
// R5 A10: "remind me later" / "don't remind me" are marks on this computer only,
// keyed by record revision; the library is not changed. A newer revision of the
// record is a new suggestion.
const MARKS_KEY = "enouia.review-marks.v1";
type Marks = Record<string, number | null>;
const readMarks = (): Marks => { try { return JSON.parse(localStorage.getItem(MARKS_KEY) ?? "{}") as Marks; } catch { return {}; } };
const writeMarks = (marks: Marks) => { try { localStorage.setItem(MARKS_KEY, JSON.stringify(marks)); } catch { /* marks are a convenience */ } };
const markKey = (m: TargetRef) => `${m.memory.memory_id}:${m.memory.revision}`;
export function RegisteredReview() {
  return <Open title={t("Worth a look")}>{() => <ReviewView />}</Open>;
}
function ReviewView() {
  const [horizon, setHorizon] = useState(30);
  const [review, setReview] = useState<ReviewSuggestions | null>(null);
  const [schedule, setSchedule] = useState<AttentionSchedule[]>([]);
  const [selected, setSelected] = useState<{ id: string; selection: CatalogSelection } | null>(null);
  const [marks, setMarks] = useState<Marks>(readMarks);
  const [showHidden, setShowHidden] = useState(false);
  const mark = (m: TargetRef, until: number | null | undefined) => setMarks(old => {
    const next = { ...old };
    if (until === undefined) delete next[markKey(m)]; else next[markKey(m)] = until;
    writeMarks(next); return next;
  });
  const hidden = (m: TargetRef) => { const v = marks[markKey(m)]; return v === null || (typeof v === "number" && v > Date.now()); };
  const reads = useLatestRead(), plans = useLatestRead();
  const load = useCallback(() => reads.run(() => catalogView({ operation: "review_suggestions", filter: CATALOG_FILTER, query: { horizon_days: horizon }, limit: 50 }), setReview), [horizon, reads.run]);
  const more = useCallback((cursor: unknown | null) => plans.run(() => {
    const from = new Date(), until = new Date(from.getTime() + 90 * 86_400_000);
    return catalogView({ operation: "attention_schedule", filter: CATALOG_FILTER, query: { from: from.toISOString(), until: until.toISOString() }, cursor, limit: 50 });
  }, page => setSchedule(old => cursor ? [...old, page] : [page])), [plans.run]);
  useEffect(() => { setSelected(null); void load(); }, [load]);
  useEffect(() => { void more(null); }, [more]);
  const day = (at: string) => recordTimeText({ from: at, until: null, precision: "day", bound: "within", tz: null, basis: "source_time" });
  const events = schedule.flatMap(p => p.events);
  const first = schedule[0], last = schedule.at(-1);
  const pick = (memory: TargetRef, selection: CatalogSelection) => setSelected({ id: memory.memory.memory_id, selection });
  return <>
    <div className="qr45" aria-busy={reads.busy || plans.busy}><div className="qr44 mem-pad mem-stack mem-v2">
      <h2 className="qr29">{t("Worth a look")}</h2>
      <p className="mem-row-meta">{t("Suggestions come from time alone: records about to be archived and recorded validity that is about to end. They say nothing about whether a record is right; protecting, correcting or leaving it is your choice.")}</p>
      <label className="mem-label">{t("Look ahead")} <select className="mem-input" value={horizon} disabled={reads.busy} onChange={e => setHorizon(Number(e.target.value))}>
        {HORIZONS.map(h => <option key={h} value={h}>{t("{n} days", { n: h })}</option>)}</select></label>
      {reads.busy && <p role="status">{t("Reading suggestions…")}</p>}
      <ErrorBox error={reads.error} />
      {review && <>
        <Observed at={review.header.authorized_at} />
        <p className="mem-content">{t("{shown} of {total} records worth a look in the next {n} days.", { shown: review.items.length, total: review.total_in_horizon, n: horizon })}</p>
        <ol className="mem-list">{review.items.filter(item => showHidden || !hidden(item.memory)).map(item => <li key={item.memory.memory.memory_id}>
          <button type="button" className="mem-link" aria-pressed={selected?.id === item.memory.memory.memory_id} onClick={() => pick(item.memory, review.header.selection)}>{item.title}</button>
          <span className="mem-row-meta"> · {day(item.due)} · {item.reasons.map(r => t(REASONS[r] ?? r)).join(" / ")} · {word(item.attention)}</span>
          <span className="mem-actions">{hidden(item.memory)
            ? <button type="button" className="mem-link" onClick={() => mark(item.memory, undefined)}>{t("Show again")}</button>
            : <><button type="button" className="mem-link" onClick={() => mark(item.memory, Date.now() + 7 * 86_400_000)}>{t("Remind me in a week")}</button>
              <button type="button" className="mem-link" onClick={() => mark(item.memory, null)}>{t("Don't remind me")}</button></>}</span>
        </li>)}</ol>
        {review.items.some(item => hidden(item.memory)) && <button type="button" className="mem-link" aria-expanded={showHidden} onClick={() => setShowHidden(!showHidden)}>{t(showHidden ? "Hide postponed suggestions" : "Show postponed suggestions")}</button>}
        <p className="mem-row-meta">{t("Postponing only hides a suggestion on this computer; the record and the library do not change.")}</p>
      </>}
      <section className="mem-stack" aria-label={t("Attention schedule")}>
        <h3>{t("Attention schedule")}</h3>
        <ErrorBox error={plans.error} />
        {first && <p className="mem-row-meta">{t("Computed from each record's capture time: it starts fading after {fade} days and is archived after {archive} days. These moments are derived, not recorded. {protected} protected records never fade.", { fade: first.fade_after_days, archive: first.archive_after_days, protected: first.protected_in_scope })}</p>}
        {first && events.length === 0 && <p className="mem-content">{t("No fading or archiving in the next 90 days.")}</p>}
        <ol className="mem-list">{events.map(e => <li key={`${e.memory.memory.memory_id}:${e.transition}`}>
          <span className="mem-row-meta">{day(e.at)} · {t(TRANSITIONS[e.transition] ?? e.transition)}</span> <button type="button" className="mem-link" onClick={() => pick(e.memory, first!.header.selection)}>{e.title}</button>
        </li>)}</ol>
        {last?.next != null && <button type="button" className="mem-button" disabled={plans.busy} onClick={() => void more(last.next)}>{t("Show later moments")}</button>}
      </section>
    </div></div>
    <aside className="qr88" aria-label={t("Automatic Memory Inspector")}><div className="qr79 mem-v2">
      {selected ? <CatalogDetailPanel key={selected.id} memoryId={selected.id} filter={CATALOG_FILTER} selection={selected.selection} read={catalogRead} entities={[]} />
        : <p className="mem-content">{t("Choose a record to read it and its quoted sources.")}</p>}
    </div></aside>
  </>;
}
// R5 A3: records Memory keeps as hypotheses, with the reason it formed them.
function HeldHypotheses({ selected, pick }: { selected: string | null; pick: (s: { id: string; selection: CatalogSelection }) => void }) {
  const [pages, setPages] = useState<CatalogPage[]>([]);
  const reads = useLatestRead();
  const filter = useMemo(() => ({ ...CATALOG_FILTER, knowledge: "hypothesis" }), []);
  const read = useCallback((cursor: CatalogPage["next"] | null) => reads.run(() => catalogRead({ operation: "page", filter, cursor, limit: 50 }),
    page => setPages(old => cursor ? [...old, page] : [page])), [filter, reads.run]);
  useEffect(() => { void read(null); }, [read]);
  const items = pages.flatMap(p => p.items), last = pages.at(-1);
  return <section className="mem-stack" aria-label={t("Held hypotheses")} aria-busy={reads.busy}>
    <p className="mem-row-meta">{t("Statements Memory keeps as hypotheses rather than attributed facts, each with why it formed them. Keeping one is not confirming it.")}</p>
    {reads.busy && <p role="status">{t("Reading records…")}</p>}
    <ErrorBox error={reads.error} />
    {pages[0] && <p className="mem-content">{t("{shown} of {matched} held hypotheses shown.", { shown: items.length, matched: pages[0].matched_in_scope })}</p>}
    {pages[0] && items.length === 0 && <p className="mem-content">{t("No held hypotheses.")}</p>}
    <ol className="mem-list">{items.map(item => <li key={item.base.memory.memory_id}>
      <button type="button" className="mem-link" aria-pressed={selected === item.base.memory.memory_id} onClick={() => pick({ id: item.base.memory.memory_id, selection: pages[0].selection })}>{item.title}</button>
      <span className="mem-row-meta"> · {word(item.base.adoption)} · {word(item.formation_reason?.interpretation)}{analystText(item.formation_reason) ? ` · ${analystText(item.formation_reason)}` : ""}</span>
      {item.formation_reason?.note && <p className="mem-row-meta mem-content">{t("Model note, not a fact")}: {item.formation_reason.note}</p>}
    </li>)}</ol>
    {last?.next != null && <button type="button" className="mem-button" disabled={reads.busy} onClick={() => void read(last.next)}>{t("Show more")}</button>}
  </section>;
}
function ConflictGroup({ memoryId, open }: { memoryId: string; open: (memoryId: string) => void }) {
  const reads = useLatestRead();
  const [group, setGroup] = useState<Conflicts | null>(null);
  useEffect(() => { void reads.run(() => catalogView({ operation: "conflicts", filter: CATALOG_FILTER, memory_id: memoryId, cursor: null, limit: 16 }), setGroup); }, [memoryId, reads.run]);
  return <section className="mem-stack" aria-label={t("Contradicting records")}>
    <h4>{t("Contradicting records")}</h4>
    {reads.busy && <p role="status">{t("Reading records…")}</p>}
    <ErrorBox error={reads.error} />
    {group && (group.items.length === 0 ? <p className="mem-row-meta">{t("No contradicting record is held.")}</p> :
      <><ConflictCompare items={group.items} open={open} />
      <ul className="mem-list">{group.items.map(item => <li key={item.base.memory.memory_id}><span className="mem-content">{item.title}</span><p className="mem-row-meta">{item.base.content}</p></li>)}</ul></>)}
  </section>;
}

// ---- Context (recall preview; D2: the only place recall is previewed) --------------
/** Context in the registered entry: the same recall an Agent would receive, previewed without saving. */
export function RegisteredContext() {
  return <section data-screen-label="Context Surface" className="mem-registered-context mem-ctx"><Open title={t("Context")}>{() => <RecallView />}</Open></section>;
}
const INTENTS = [["current", msg("Current memories")], ["historical", msg("Including history")], ["browse", msg("Browse without a cue")]] as const;
function RecallView() {
  const { nativeStatus } = useStatus();
  const limits = nativeStatus?.recall_limits;
  const [text, setText] = useState("");
  const [intent, setIntent] = useState<RecallQuery["intent"]>("current");
  const [preview, setPreview] = useState<RecallPreview | null>(null);
  const [asked, setAsked] = useState("");
  const [savedTick, setSavedTick] = useState(0);
  const reads = useLatestRead();
  const main = useRef<HTMLDivElement>(null);
  const run = (cue = text) => {
    if (!limits || (intent !== "browse" && !cue.trim())) return;
    setPreview(null); setAsked(cue);
    void reads.run(() => catalogRecall({ text: cue, conditions: [], event_window: null, at: new Date().toISOString(), intent, limit: limits.max_items, max_bytes: limits.max_bytes }), setPreview);
  };
  const jump = (id: string) => { const el = main.current?.querySelector<HTMLElement>(`#${id}`); if (el && main.current) main.current.scrollTo({ top: el.offsetTop - 8 }); };
  const reasons = preview ? Object.entries(preview.trace_coverage.reason_counts) : [];
  const max = limits?.max_bytes ?? 0;
  const used = preview?.trace.rendered_bytes ?? 0;
  const fmt = (n: number) => new Intl.NumberFormat("en-GB").format(n);
  return <>
    <header className="mem-ctx-head">
      <div className="mem-ctx-title">
        <h1 className="qr18">{t("Context Surface")}</h1>
        <span className="mem-ctx-tag">{t("Recall preview · read only. Nothing is saved or sent.")}</span>
      </div>
      <form className="mem-ctx-form" onSubmit={event => { event.preventDefault(); run(); }}>
        <label className="qr22 mem-ctx-cue"><span className="am-lbl">{t("Cue")}</span><input className="qr21" value={text} maxLength={2048} autoComplete="off" placeholder={t("What the Agent is asked")} onChange={event => setText(event.target.value)} /></label>
        <div className="am-views mem-ws-views" role="group" aria-label={t("Scope")}>
          {INTENTS.map(([id, label]) => <button key={id} type="button" className="am-view" aria-pressed={intent === id} onClick={() => setIntent(id)}><span className="am-vn">{t(label)}</span></button>)}
        </div>
        <button className="mem-primary mem-ctx-go" disabled={reads.busy || !limits || (intent !== "browse" && !text.trim())}>{t("Preview recall")}</button>
      </form>
      <p className="mem-row-meta">{t("Preview the context an Agent would receive for a cue. It uses the same recall as the Agent and saves nothing.")}{limits ? ` ${t("Up to {items} records and {bytes} bytes, the limits of this entry.", { items: limits.max_items, bytes: limits.max_bytes })}` : ""}</p>
    </header>
    {max > 0 && <div className="mem-ctx-budget" role="img" aria-label={preview ? t("{used} of {max} bytes used", { used: fmt(used), max: fmt(max) }) : t("Byte budget {max}", { max: fmt(max) })}>
      <div className="mem-ctx-scale">{[0, 0.25, 0.5, 0.75, 1].map(f => <span key={f} style={{ left: `${f * 100}%` }}>{fmt(Math.round(max * f))}</span>)}</div>
      <div className="mem-ctx-bar"><span style={{ width: `${Math.min(100, used / max * 100)}%` }} /></div>
      <div className="mem-ctx-reading"><b>{preview ? fmt(used) : "—"}</b> {t("of {max} bytes", { max: fmt(max) })}{preview && <span className="mem-row-meta"> · {t("{considered} considered · {selected} selected · {excluded} excluded · {bytes} bytes", { considered: preview.trace.considered, selected: preview.trace.selected.length, excluded: preview.trace_coverage.excluded_in_scope, bytes: preview.trace.rendered_bytes })}</span>}</div>
    </div>}
    <div className="mem-ctx-body">
      <nav className="mem-ctx-nav" aria-label={t("Context sections")}>
        <button type="button" className="qr26" disabled={!preview} onClick={() => jump("ctx-selected")}><span className="qr24">{t("Selected")}</span><span className="qr25">{preview ? preview.trace.selected.length : "—"}</span></button>
        <button type="button" className="qr26" disabled={!preview} onClick={() => jump("ctx-excluded")}><span className="qr24">{t("Left out")}</span><span className="qr25">{preview ? preview.trace_coverage.excluded_in_scope : "—"}</span></button>
        <button type="button" className="qr26" disabled={!preview} onClick={() => jump("ctx-rendered")}><span className="qr24">{t("Rendered context")}</span><span className="qr25">{preview ? fmt(used) : "—"}</span></button>
        <p className="am-fine mem-ctx-note">{t("A preview writes nothing and enrols no Agent. Selection order and reasons come from Memory's recall algorithm.")}</p>
        <div className="mem-ctx-capsules">{nativeStatus?.corrections && <CapsuleIndex refresh={savedTick} use={cue => { setText(cue); run(cue); }} />}</div>
      </nav>
      <div className="mem-ctx-main" ref={main} aria-busy={reads.busy}>
        {reads.busy && <p role="status">{t("Previewing recall…")}</p>}
        <ErrorBox error={reads.error} />
        {!preview && !reads.busy && <p className="qr32">{t("Enter a cue, or browse without one, to see what an Agent would be given.")}</p>}
        {preview && <>
          {!preview.complete_in_scope && <p role="status">{t("The byte budget ran out; more records matched than were included.")}</p>}
          <section id="ctx-selected" className="mem-ctx-section" aria-label={t("Selected")}>
            <div className="mem-ctx-section-head"><h2>{t("Selected")}</h2><span className="mem-row-meta">{asked ? `“${asked}”` : t(INTENTS.find(i => i[0] === intent)![1])}</span></div>
            {preview.trace.selected.length === 0 ? <p className="mem-content">{t("Nothing was selected for this cue.")}</p> :
              <ol className="mem-list mem-ctx-items">{preview.trace.selected.map((s, i) => <li key={s.memory.memory_id}>
                <div><span className="mem-content">{preview.items[i].record.fields.title}</span>
                  <p className="mem-row-meta">{preview.items[i].base.content !== preview.items[i].record.fields.title ? preview.items[i].base.content : null}</p>
                  <p className="mem-row-meta">{word(s.attention)} · {s.reasons.map(word).join(" · ")} · <span className="mem-mono">{shortId(s.memory.memory_id)}</span></p></div>
                <span className="mem-ctx-rank">#{i + 1}</span><span className="mem-ctx-score">{t("score {score}", { score: s.score })}</span>
              </li>)}</ol>}
          </section>
          <section id="ctx-excluded" className="mem-ctx-section" aria-label={t("Why others were left out")}>
            <div className="mem-ctx-section-head"><h2>{t("Why others were left out")}</h2><span className="mem-row-meta">{preview.trace_coverage.excluded_in_scope}</span></div>
            {reasons.length === 0 ? <p className="mem-row-meta">{t("Nothing was left out.")}</p> :
              <ul className="mem-list">{reasons.map(([reason, n]) => <li key={reason} className="mem-row-meta">{word(reason)} · {n}</li>)}</ul>}
          </section>
          <section id="ctx-rendered" className="mem-ctx-section" aria-label={t("Rendered context")}>
            <div className="mem-ctx-section-head"><h2>{t("Rendered context")}</h2><Observed at={preview.trace.authorized_at} /></div>
            <pre className="mem-content mem-rendered">{preview.rendered_context}</pre>
          </section>
          {nativeStatus?.corrections && preview.trace.selected.length > 0 && <SaveCapsule key={`${asked}:${preview.trace.authorized_at}`} query={asked} preview={preview} saved={() => setSavedTick(n => n + 1)} />}
        </>}
      </div>
    </div>
  </>;
}

/** D3 (2026-11-27): the assistant side of a captured conversation is named by its platform; only Enouia's own conversations say Enouia. */
const PLATFORMS: Record<string, string> = { chatgpt: "ChatGPT", claude: "Claude", enouia: "Enouia", codex: "Codex" };
const platformName = (platform: string) => PLATFORMS[platform.toLowerCase()] ?? platform;
// ---- Sessions ----------------------------------------------------------------
export function RegisteredSessions() {
  return <section data-screen-label="Sessions" className="qr171 mem-registered-sessions"><Open title={t("Sessions")}>{() => <SessionsView />}</Open></section>;
}
function SessionsView() {
  const [pages, setPages] = useState<Conversations[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [texts, setTexts] = useState<Record<string, CatalogSource>>({});
  const reads = useLatestRead(), turns = useLatestRead();
  const read = useCallback((cursor: unknown | null) => reads.run(() => catalogView({ operation: "conversations", cursor, limit: 50 }),
    page => setPages(old => cursor ? [...old, page] : [page])), [reads.run]);
  useEffect(() => { void read(null); }, [read]);
  const scroller = useRef<HTMLDivElement>(null), track = useRef<HTMLOListElement>(null);
  const open = (id: string) => {
    if (id === chosen && (detail || turns.busy)) return;
    setChosen(id); setDetail(null); setTexts({});
    void turns.run(async () => {
      const read = await catalogView({ operation: "conversation_detail", conversation_id: id, cursor: null, limit: 50 });
      const found = { ...read, turns: [...read.turns].sort((a, b) => a.turn.sequence - b.turn.sequence) };
      const bodies: Record<string, CatalogSource> = {};
      for (const turn of found.turns) {
        const ref = turn.turn.source;
        bodies[`${ref.source_id}:${ref.source_revision}`] = await catalogRead({ operation: "source", source: ref, start: 0, limit: 4000 });
      }
      return { found, bodies };
    }, ({ found, bodies }) => { setDetail(found); setTexts(bodies); });
  };
  const [scope, setScope] = useState("");
  const loaded = pages.flatMap(p => p.items);
  const scopes = [...new Set(loaded.map(c => c.conversation.account_scope).filter((v): v is string => !!v))];
  const items = scope ? loaded.filter(c => c.conversation.account_scope === scope) : loaded;
  // Parts of one platform conversation share its original ID: an import may split
  // a long thread, and Memory ADR-MEM-185 captures a thread continued after its
  // capture window rotated with `#pol_…` appended. Show the parts together, earliest first.
  const threads: (typeof items)[] = [];
  const byOriginal = new Map<string, typeof items>();
  for (const c of items) {
    const original = c.conversation.original_conversation_id;
    const base = original ? original.split("#pol_")[0] : null;
    const thread = base ? byOriginal.get(base) : undefined;
    if (thread) thread.push(c);
    else { threads.push([c]); if (base) byOriginal.set(base, threads.at(-1)!); }
  }
  for (const thread of threads) thread.sort((a, b) => (a.conversation.started_at.from ?? "").localeCompare(b.conversation.started_at.from ?? ""));
  const chosenParts = threads.find(thread => thread.length > 1 && thread.some(c => c.conversation.conversation_id === chosen));
  const last = pages.at(-1);
  const chosenMeta = loaded.find(c => c.conversation.conversation_id === chosen);
  const clock = (at: string) => nativeDate(Date.parse(at), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  // Open the conversation that ended last, as the design opens on the latest session.
  useEffect(() => {
    if (chosen || !pages[0]) return;
    const newest = [...loaded].sort((a, b) => (b.conversation.ended_at.from ?? b.conversation.started_at.from ?? "").localeCompare(a.conversation.ended_at.from ?? a.conversation.started_at.from ?? ""))[0];
    if (newest) open(newest.conversation.conversation_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);
  // The session's time map: every turn with a known time, in recorded order.
  const turnTimes = useMemo(() => (detail?.turns ?? []).map(turn => Date.parse(turn.source_record.occurred_at ?? turn.source_record.captured_at ?? "")), [detail]);
  const ordered = turnTimes.length > 0 && turnTimes.every((at, i) => Number.isFinite(at) && (i === 0 || at >= turnTimes[i - 1]));
  const sessionSpec = useMemo<SessionMapSpec | null>(() => {
    if (!detail?.conversation || !ordered) return null;
    const lo = turnTimes[0] - 60_000, hi = turnTimes[turnTimes.length - 1] + 60_000, len = hi - lo;
    const time = (at: number) => nativeDate(at, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    return { key: `native-session:${detail.conversation.conversation_id}`, label: msg("Time map of loaded session events"), cells: Math.max(8, Math.min(60, Math.ceil(len / 60_000))),
      ticks: turnTimes.map(at => ({ at: (at - lo) / len, tall: false })),
      labels: [0, 0.25, 0.5, 0.75].map(f => ({ at: f, text: nativeDate(lo + f * len, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) })),
      step: Math.max(60_000, Math.round(len / 8 / 60_000) * 60_000), unit: msg("few minutes"),
      readout: (start, span) => `${time(start)} – ${time(start + span)} · UTC+8`, init: () => ({ start: lo, span: len, domain: [lo, hi] }) };
  }, [detail, ordered, turnTimes]);
  // UI v2 Sessions: the list on the left (an inverted row when chosen), the
  // transcript in the middle spaced by real time, the session's facts on the right.
  return <>
    <aside className="qr136" aria-busy={reads.busy}>
      <div className="qr20"><h1 className="qr18">{t("Sessions")}</h1>
        <div className="qr19">{pages[0] ? t("{shown} of {matched} conversations", { shown: items.length, matched: pages[0].matched_in_scope }) : t("Reading conversations…")}</div></div>
      <ErrorBox error={reads.error} />
      {scopes.length > 1 && <label className="am-select-filter"><span className="am-lbl">{t("Captured by")}</span><select value={scope} onChange={e => setScope(e.target.value)}>
        <option value="">{t("All")}</option>{scopes.map(v => <option key={v} value={v}>{v}</option>)}</select></label>}
      <ul className="mem-list qr135 mem-session-list">{threads.map(([c, ...later]) => <li key={c.conversation.conversation_id} data-thread-parts={later.length + 1}>
        <button type="button" className="qr134" aria-pressed={chosen === c.conversation.conversation_id} aria-label={c.conversation.title ?? t("Untitled conversation")} onClick={() => open(c.conversation.conversation_id)}>
          <span className="qr133">{c.conversation.title ?? t("Untitled conversation")}</span>
          <span className="qr19">{recordTimeText({ ...c.conversation.started_at, precision: "day" })} · {t("{n} captured turns", { n: c.visible_captured_turns })} · {platformName(c.conversation.platform)}</span>
        </button>
        {later.length > 0 && <div className="mem-session-parts"><span className="qr19">{t("Later parts of the same platform conversation:")}</span> {later.map((part, index) =>
          <button key={part.conversation.conversation_id} type="button" className="am-chip" aria-pressed={chosen === part.conversation.conversation_id} onClick={() => open(part.conversation.conversation_id)}>
            {t("Part {n}", { n: index + 2 })} · {recordTimeText(part.conversation.started_at)} · {t("{n} captured turns", { n: part.visible_captured_turns })}</button>)}</div>}
      </li>)}</ul>
      {last?.next != null && <button type="button" className="am-chip" disabled={reads.busy} onClick={() => void read(last.next)}>{t("Show more conversations")}</button>}
    </aside>
    <div className="qr161" aria-busy={turns.busy} ref={scroller}>
      {!chosen && pages[0] && <p className="qr32">{t(pages[0].matched_in_scope === 0 ? "This library has no captured conversations in the current scope." : "Choose a conversation to read its captured turns.")}</p>}
      {turns.busy && <p role="status" className="am-fine">{t("Reading captured turns…")}</p>}
      <ErrorBox error={turns.error} />
      {detail && (detail.conversation ? <>
        <div className="qr137">
          <h2 className="qr29">{detail.conversation.title ?? t("Untitled conversation")}</h2>
          <div className="qr19">{detail.conversation.started_at.from ? nativeDate(Date.parse(detail.conversation.started_at.from), { weekday: "long", day: "numeric", month: "long" }) : recordTimeText(detail.conversation.started_at)} · {platformName(detail.conversation.platform)}</div>
          <div className="qr30" />
          <div className="bg-ruler-note">{t("Spacing = real time · 2 px per minute, capped")}</div>
        </div>
        <p className="am-fine">{t("Only captured turns are shown; this is not the whole platform conversation.")}</p>
        {chosenParts && <p className="am-fine" data-thread-part>{t("Part {n} of {total} loaded parts of one platform conversation (same original conversation ID).", { n: chosenParts.findIndex(c => c.conversation.conversation_id === chosen) + 1, total: chosenParts.length })}</p>}
        {sessionSpec && <TranscriptTimeMap spec={sessionSpec} times={turnTimes} scroller={scroller} track={track} />}
        <ol className="mem-list qr160 mem-turns" ref={track}>{detail.turns.map((turn, index) => {
          const body = texts[`${turn.turn.source.source_id}:${turn.turn.source.source_revision}`];
          // Memory ADR-MEM-175 note: each turn's source record carries its time.
          // Space turns by the real gap (2px a minute, at most 48px); unknown
          // or out-of-order times get no extra space.
          const at = turn.source_record.occurred_at ?? turn.source_record.captured_at ?? null;
          const before = index > 0 ? detail.turns[index - 1].source_record.occurred_at ?? detail.turns[index - 1].source_record.captured_at ?? null : null;
          const gap = at && before ? (Date.parse(at) - Date.parse(before)) / 60000 : 0;
          const you = turn.source_record.speaker === "user";
          return <li key={turn.turn.turn_id} className="qr159 bg-turn" style={{ "--gap": `${gap > 0 ? Math.min(48, Math.round(gap * 2)) : 0}px` } as React.CSSProperties} data-turn-gap={gap > 0 ? Math.round(gap) : 0}>
            {gap >= 4 && <span className="bg-gap" aria-hidden="true">{t("+{n} min", { n: Math.round(gap) })}</span>}
            <span className="qr138">{turn.turn.sequence}</span>
            <span className="qr139">{at ? clock(at) : "—"}</span>
            <span className="qr142"><span className="qr140" /><span className="qr141" /></span>
            <div className="qr158"><div className="qr149">
              <div className="qr145"><span className="qr143" data-speaker={you ? "you" : "agent"}>{you ? t("You") : turn.source_record.speaker === "assistant" ? platformName(detail.conversation?.platform ?? turn.source_record.speaker) : turn.source_record.speaker}</span><span className="qr144" title={at ? stamp(at) : undefined}>{t("turn {n}", { n: turn.turn.sequence })} · {shortId(turn.turn.turn_id)}</span></div>
              {body?.source ? <div className="qr146" data-speaker={you ? "you" : "agent"}>{body.excerpt}{body.complete_in_scope ? "" : " …"}</div> : <p className="mem-row-meta">{t("This source revision is no longer available.")}</p>}
            </div></div>
          </li>;
        })}</ol>
        {detail.next != null && <p className="am-fine">{t("{shown} of {total} captured turns shown.", { shown: detail.turns.length, total: detail.visible_captured_turns })}</p>}
      </> : <p role="status" className="am-fine">{t("This conversation is no longer available in the current scope.")}</p>)}
    </div>
    <aside className="qr170" aria-label={t("Session details")}>
      {chosenMeta ? <section className="qr66"><h3 className="qr55">{t("Session")}</h3><dl className="mem-facts">
        <dt>{t("Started")}</dt><dd>{recordTimeText(chosenMeta.conversation.started_at)}</dd>
        <dt>{t("Ended")}</dt><dd>{recordTimeText(chosenMeta.conversation.ended_at)}</dd>
        <dt>{t("Platform")}</dt><dd>{platformName(chosenMeta.conversation.platform)}</dd>
        {chosenMeta.conversation.account_scope && <><dt>{t("Captured by")}</dt><dd>{chosenMeta.conversation.account_scope}</dd></>}
        <dt>{t("Turns")}</dt><dd>{t("{n} captured turns", { n: chosenMeta.visible_captured_turns })}</dd>
        <dt>{t("Sensitivity")}</dt><dd>{word(chosenMeta.effective_sensitivity)}</dd>
      </dl></section> : <p className="qr19">{t("No session selected.")}</p>}
      {chosenMeta && <section className="qr66"><h3 className="qr55">{t("Memory writes")}</h3>
        <p className="mem-row-meta">{t("Memory does not list the records formed from one conversation yet. Open a record in Memory to read the turns it quotes.")}</p></section>}
    </aside>
  </>;
}

// ---- Readings for Home and the Runtime Inspector ------------------------------
export type Readings = { stats: CatalogStats; latest: ActivityPage["items"][number] | null; conversations: number; observedAt: string };
/** One explicit read of totals, the newest event and the conversation count. */
export function useRegisteredReadings(): { readings: Readings | null; busy: boolean; error: ReturnType<typeof useLatestRead>["error"]; reload: () => void } {
  const { nativeStatus } = useStatus();
  const selection = nativeStatus?.state === "open" ? nativeStatus.selection ?? null : null;
  const scope = selection ? catalogScopeKey(selection) : null;
  const [readings, setReadings] = useState<Readings | null>(null);
  const reads = useLatestRead();
  const reload = useCallback(() => {
    setReadings(null);
    if (!selection) { reads.clear(); return; }
    void reads.run(async () => {
      const page = await catalogRead({ operation: "page", filter: CATALOG_FILTER, cursor: null, limit: 1 });
      const stats = await catalogRead({ operation: "stats", filter: CATALOG_FILTER, selection: page.selection });
      const activity = await catalogView({ operation: "activity", filter: CATALOG_FILTER, query: { memory: null, event_kind: null, include_sources: false }, cursor: null, limit: 1 });
      const conversations = await catalogView({ operation: "conversations", cursor: null, limit: 1 });
      return { stats, latest: activity.items[0] ?? null, conversations: conversations.matched_in_scope, observedAt: stats.authorized_at };
    }, setReadings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, reads.run, reads.clear]);
  useEffect(() => { reload(); }, [reload]);
  return { readings: scope ? readings : null, busy: reads.busy, error: reads.error, reload };
}
export const count = (stats: CatalogStats, axis: string, value: string) => stats.groups?.find(g => g.axis === axis)?.values.find(v => v.value === value)?.count ?? 0;
export const readingStamp = stamp;

// ---- Home ---------------------------------------------------------------------
type Note = { title: string; line: string; route: { go: () => void }; detail: string; time: string; idle?: boolean };
export function RegisteredHome({ nav, timeline, now, phase }: { nav: { memory: { go: () => void }; sessions: { go: () => void }; context: { go: () => void } }; timeline: MapSpec; now: number; phase: string }) {
  const { nativeStatus, nativeError, error, recorded } = useStatus();
  const { readings, error: readError } = useRegisteredReadings();
  const clock = (at: string | number) => nativeDate(typeof at === "number" ? at : Date.parse(at), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const latestTurn = recorded?.trace?.latestTurn ?? null;
  const fallback = nativeError?.text ?? error?.text ?? (nativeStatus?.reason ? describe(nativeStatus.reason) : readError?.text ?? registeredLabel(nativeStatus));
  const short = (id: string) => id.length > 14 ? `${id.slice(0, 10)}…${id.slice(-4)}` : id;
  const left = recorded?.latest ?? null;
  const notes: Note[] = [
    { title: t("Memory Vault"), route: nav.memory, time: readings ? clock(readings.observedAt) : "—",
      detail: readings ? short(readings.stats.selection.snapshot.base_commit_id) : "—",
      line: readings ? t("{total} records · {adopted} adopted · {staged} staged", { total: readings.stats.matched_in_scope, adopted: count(readings.stats, "adoption", "adopted"), staged: count(readings.stats, "adoption", "staged") }) : fallback },
    { title: t("Formation"), route: nav.memory, time: readings?.latest ? clock(readings.latest.proof.written_at) : "—",
      detail: readings?.latest?.memory ? short(readings.latest.memory.memory_id) : "—",
      line: readings ? readings.latest ? t("Latest: {title}", { title: readings.latest.title ?? t("Source material") }) : t("No recorded events.") : fallback },
    { title: t("Current session"), route: nav.sessions, time: latestTurn != null ? clock(latestTurn) : "—",
      detail: left ? short(left.id) : "—", idle: !left,
      line: left ? t("{title} · {n} turns, last at {time}", { title: left.title ?? t("Untitled conversation"), n: left.turns, time: clock(left.at) })
        : readings ? t("{n} captured conversations", { n: readings.conversations }) : fallback },
    { title: t("Context"), route: nav.context, detail: "—", time: "—", idle: true, line: t("Preview the context an Agent would receive") },
  ];
  const recording = readings ? t("{total} records, {adopted} adopted, {staged} staged.", { total: readings.stats.matched_in_scope, adopted: count(readings.stats, "adoption", "adopted"), staged: count(readings.stats, "adoption", "staged") }) : undefined;
  const margin = left ? { title: t("Left off"), lines: [left.title ?? t("Untitled conversation"), `${nativeDate(left.at, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} · UTC+8`] } : undefined;
  return <NativeHome nav={nav} timeline={timeline} now={now} open={false} vault={null} readonlyEntry readonlyNotes={notes} recorded={recorded} recording={recording} margin={margin}
    label={registeredLabel(nativeStatus)} phase={phase} reviewLine={fallback} />;
}

// ---- Runtime Inspector ----------------------------------------------------------
export function RegisteredInspectorFacts() {
  const { nativeStatus } = useStatus();
  const { readings, busy, error, reload } = useRegisteredReadings();
  const selection = nativeStatus?.state === "open" ? nativeStatus.selection : undefined;
  if (!selection) return null;
  const semantic = nativeStatus?.state === "open" ? nativeStatus.semantic : undefined;
  const health: [string, "ok" | "pending" | "failed", string][] = [
    [t("Registered library"), "ok", registeredLabel(nativeStatus)],
    [t("Semantic recall"), !semantic ? "pending" : semantic.state === "ready" ? "ok" : semantic.state === "unavailable" ? "failed" : "pending",
      !semantic ? t("unknown") : semantic.state === "ready" ? t("Ready · {n} memories · {model}", { n: semantic.indexed, model: semantic.model }) : semantic.state === "indexing" ? t("Indexing {n} of {total} memories · {model}", { n: semantic.indexed, total: semantic.total, model: semantic.model }) : semantic.state === "unavailable" ? t("Local model not running; recall uses words only") : t("Checking the local model…")],
    [t("Confirmed changes"), nativeStatus?.corrections ? "ok" : "pending", nativeStatus?.corrections ? t("Available") : t("Unavailable in this read-only entry")],
  ];
  return <section className="mem-stack" aria-label={t("Registered library readings")} aria-busy={busy}>
    <div className="runtime-panel-head"><h3 className="qr55">{t("State")}</h3><button type="button" className="mem-link runtime-reread" disabled={busy} onClick={reload}>{t("Read library totals again")}</button></div>
    {busy && <p role="status">{t("Reading library totals…")}</p>}
    <ErrorBox error={error} />
    <dl className="mem-facts">
      <dt>{t("Read capability")}</dt><dd><code>memory-native-read-2</code> · {selection.algorithm}</dd>
      <dt>{t("Snapshot")}</dt><dd>{t("commit {commit} · epoch {epoch}", { commit: selection.snapshot.base_commit_id, epoch: selection.snapshot.primary_epoch })}</dd>
      <dt>{t("Watermarks")}</dt><dd>{t("policy {policy} · deletion {deletion} · withdrawal {withdrawal}", { policy: selection.snapshot.policy_watermark, deletion: selection.snapshot.deletion_watermark, withdrawal: selection.withdrawal_watermark })}</dd>
      {readings && <>
        <dt>{t("Authorized records")}</dt><dd>{readings.stats.matched_in_scope}</dd>
        <dt>{t("Adoption")}</dt><dd>{t("{adopted} adopted · {staged} staged", { adopted: count(readings.stats, "adoption", "adopted"), staged: count(readings.stats, "adoption", "staged") })}</dd>
        <dt>{t("Attention")}</dt><dd>{t("{active} active · {protected} protected", { active: count(readings.stats, "attention", "active"), protected: count(readings.stats, "attention", "protected") })}</dd>
        <dt>{t("Captured conversations")}</dt><dd>{readings.conversations}</dd>
        <dt>{t("Latest event")}</dt><dd>{readings.latest ? `${stamp(readings.latest.proof.written_at)} · ${word(readings.latest.event_kind)}` : "—"}</dd>
        <dt>{t("Observed")}</dt><dd>{stamp(readings.observedAt)}</dd>
      </>}
    </dl>
    <h3 className="qr55">{t("Health")}</h3>
    <ul className="runtime-health">{health.map(([name, state, text]) => <li key={name} data-state={state}><span className="runtime-mark" aria-hidden="true" /><span className="runtime-health-name">{name}</span><span className="runtime-health-text">{text}</span></li>)}</ul>
    {nativeStatus?.corrections && <ConnectorStatus />}
  </section>;
}
