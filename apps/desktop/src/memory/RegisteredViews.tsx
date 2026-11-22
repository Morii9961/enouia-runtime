// Registered read-only entry: the Memory workspaces, Sessions and readings
// over the pinned Memory projections (ADR-MEM-100/101/103). Every view reads
// the same registered catalog, renders only what Core returns and withdraws its
// data when the library closes or its scope changes. Nothing here writes.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CATALOG_FILTER, catalogRead, catalogRecall, catalogScopeKey, catalogView, type AttentionSchedule, type ReviewSuggestions, type TargetRef, type RecallPreview, type RecallQuery, type ActivityPage, type CatalogFilter, type CatalogPage, type CatalogSelection, type Conflicts,
  type CatalogSource, type CatalogStats, type ConversationDetail, type Conversations, type GraphPage, type Neighbors, type TimeBuckets } from "./catalog";
import { CatalogDetailPanel } from "./CatalogMemory";
import { ConnectorStatus } from "./Connector";
import { analystText, recordTimeText, word } from "./catalogWords";
import { useLatestRead } from "./hooks";
import { useStatus, registeredLabel } from "./status";
import { ErrorBox } from "./ui";
import { describe } from "./client";
import NativeHome from "./NativeHome";
import type { MapSpec } from "../theme/TimeMap";
import { nativeDate } from "../theme/nativeTime";
import { msg, t } from "../i18n";

/** Renders children only while the registered library is open, keyed by its scope. */
function Open({ children, title }: { children: (selection: CatalogSelection) => ReactNode; title: string }) {
  const { nativeStatus } = useStatus();
  const selection = nativeStatus?.state === "open" ? nativeStatus.selection ?? null : null;
  if (!selection) return <div className="qr45"><div className="mem-gate"><div className="mem-card mem-stack">
    <h2 className="mem-h2">{title}</h2><p role="status">{registeredLabel(nativeStatus)}</p>
  </div></div></div>;
  return <div key={catalogScopeKey(selection)} style={{ display: "contents" }}>{children(selection)}</div>;
}
const stamp = (at: string) => nativeDate(Date.parse(at), { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function Observed({ at }: { at: string }) { return <p className="mem-row-meta">{t("State observed at {time}", { time: stamp(at) })}</p>; }

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
  const [page, setPage] = useState<CatalogPage | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const reads = useLatestRead(), records = useLatestRead();
  const load = useCallback(() => {
    setMonths(null); setChosen(null); setPage(null); setSelected(null); records.clear();
    const until = `${new Date().getFullYear() + 1}-01-01`;
    return reads.run(() => catalogView({ operation: "time_buckets", filter: CATALOG_FILTER, selection: null,
      query: { axis, timezone: "Asia/Shanghai", granularity: "month", from_date: "2000-01-01", until_date: until } }), setMonths);
  }, [axis, reads.run, records.clear]);
  useEffect(() => { void load(); }, [load]);
  const choose = (bucket: TimeBuckets["buckets"][number]) => {
    setChosen(bucket); setPage(null); setSelected(null);
    const filter: CatalogFilter = { ...CATALOG_FILTER, time_axis: axis, time_window: { from: bucket.from, until: bucket.until } };
    void records.run(() => catalogRead({ operation: "page", filter, cursor: null, limit: 50 }), setPage);
  };
  const years = useMemo(() => {
    const byYear = new Map<string, TimeBuckets["buckets"]>();
    for (const b of months?.buckets ?? []) { const y = b.local_start.slice(0, 4); byYear.set(y, [...(byYear.get(y) ?? []), b]); }
    return [...byYear].filter(([, list]) => list.some(b => b.possible_records > 0)).reverse();
  }, [months]);
  const max = Math.max(1, ...(months?.buckets ?? []).map(b => b.possible_records));
  return <>
    <div className="qr45" aria-busy={reads.busy}><div className="qr44 mem-pad mem-stack">
      <h2 className="qr29">{t("Time")}</h2>
      <label className="mem-label">{t("Time axis")} <select className="mem-input" value={axis} onChange={e => setAxis(e.target.value as Axis)}>
        {AXES.map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}</select></label>
      <button type="button" className="mem-button" disabled={reads.busy} onClick={() => void load()}>{t("Read again")}</button>
      {reads.busy && <p role="status">{t("Reading time buckets…")}</p>}
      <ErrorBox error={reads.error} />
      {months && <>
        <Observed at={months.header.authorized_at} />
        <p className="mem-content">{t("{n} records have no recorded time on this axis.", { n: months.unknown_time_in_scope })}</p>
        <p className="mem-row-meta">{t("A record whose time spans several months is counted in each of them, so month counts do not add up to the total.")}</p>
        {years.length === 0 && <p className="mem-content">{t("No dated records on this axis.")}</p>}
        <table className="mem-time-grid"><thead><tr><td />{Array.from({ length: 12 }, (_, i) => <th key={i} scope="col">{i + 1}</th>)}</tr></thead><tbody>{years.map(([year, list]) => <tr key={year}><th scope="row">{year}</th>
          {list.map(b => <td key={b.local_start}>{b.possible_records > 0 ? <button type="button" className="mem-time-cell" aria-pressed={chosen?.local_start === b.local_start}
            style={{ ["--fill" as string]: String(0.18 + 0.82 * b.possible_records / max) }} aria-label={t("{month}: {n} records", { month: b.local_start.slice(0, 7), n: b.possible_records })}
            onClick={() => choose(b)}>{b.possible_records}</button> : <span className="mem-time-empty" aria-hidden="true">·</span>}</td>)}</tr>)}</tbody></table>
      </>}
      {chosen && <section className="mem-stack" aria-label={t("Records in {month}", { month: chosen.local_start.slice(0, 7) })} aria-busy={records.busy}>
        <h3>{t("Records in {month}", { month: chosen.local_start.slice(0, 7) })}</h3>
        <p className="mem-row-meta">{t("{adopted} adopted · {staged} staged · {material} captured sources", { adopted: chosen.adopted, staged: chosen.staged, material: chosen.captured_material })}</p>
        {records.busy && <p role="status">{t("Reading records…")}</p>}
        <ErrorBox error={records.error} />
        {page && <><p className="mem-row-meta">{t("{shown} shown · {matched} matching authorized records", { shown: page.items.length, matched: page.matched_in_scope })}</p>
          <ul className="mem-list">{page.items.map(item => <li key={item.base.memory.memory_id}>
            <button type="button" className="mem-link" aria-pressed={selected === item.base.memory.memory_id} onClick={() => setSelected(item.base.memory.memory_id)}>{item.title}</button>
            <span className="mem-row-meta"> · {recordTimeText(axis === "event" ? item.event_time : { from: axis === "learned" ? item.base.learned_at ?? null : item.base.source_captured_at ?? null, until: null, precision: "day", bound: "within", tz: null, basis: "source_time" })} · {word(item.base.dimensions.kind)}</span>
          </li>)}</ul></>}
      </section>}
    </div></div>
    <aside className="qr88" aria-label={t("Automatic Memory Inspector")}><div className="qr79">
      {page && selected ? <CatalogDetailPanel key={selected} memoryId={selected} filter={CATALOG_FILTER} selection={page.selection} read={catalogRead} entities={[]} />
        : <p className="mem-content">{t("Choose a month, then a record, to read its detail and quoted sources.")}</p>}
    </div></aside>
  </>;
}

// ---- Connections -------------------------------------------------------------
export function RegisteredConnections() {
  return <Open title={t("Connections")}>{() => <ConnectionsView />}</Open>;
}
type Graph = { nodes: GraphPage["nodes"]; edges: GraphPage["edges"]; first: GraphPage };
function ConnectionsView() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [neighbors, setNeighbors] = useState<Neighbors | null>(null);
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
  const lexicalOf = selected ? lexical.filter(e => e.from === selected || e.to === selected) : [];
  const ranked = [...degree].sort((a, b) => b[1] - a[1]).slice(0, 40);
  const selectedTitle = selected ? title.get(selected) ?? selected : null;
  return <>
    <div className="qr45" aria-busy={reads.busy}><div className="qr44 mem-pad mem-stack">
      <h2 className="qr29">{t("Connections")}</h2>
      <button type="button" className="mem-button" disabled={reads.busy} onClick={() => void load()}>{t("Read again")}</button>
      {reads.busy && <p role="status">{t("Reading the relation graph…")}</p>}
      <ErrorBox error={reads.error} />
      {graph && <>
        <Observed at={graph.first.header.authorized_at} />
        <p className="mem-content">{t("{nodes} records and {edges} relations loaded.", { nodes: graph.nodes.length, edges: graph.edges.length })}</p>
        {graph.first.header.matched_inputs != null && graph.first.header.matched_inputs > graph.nodes.length && <p role="status">{t("Only the first {n} records are in this graph.", { n: graph.nodes.length })}</p>}
        <table className="mem-table"><thead><tr><th>{t("Relation")}</th><th>{t("Candidates")}</th><th>{t("Shown")}</th></tr></thead>
          <tbody>{graph.first.edge_coverage.map(c => <tr key={c.relation}><td>{word(c.relation)}</td><td>{c.candidates}</td><td>{byRelation.get(c.relation) ?? 0}</td></tr>)}</tbody></table>
        <p className="mem-row-meta">{t("Same entity and same conversation are recorded mentions, not independent verification.")}{graph.first.semantic_neighbors_available ? "" : ` ${t("Semantic neighbours are not available yet.")}`}</p>
        {lexical.length > 0 && <section className="mem-stack" aria-label={t("Shared-word suggestions")}>
          <h3>{t("Shared-word suggestions")}</h3>
          <p className="mem-row-meta">{t("Records that use several of the same words. A suggestion to look at, not a recorded or semantic relation.")}</p>
          <ul className="mem-list">{lexical.slice(0, 40).map(e => <li key={`${e.from}|${e.to}`}>
            <button type="button" className="mem-link" onClick={() => pick(e.from)}>{title.get(e.from) ?? e.from}</button> ↔ <button type="button" className="mem-link" onClick={() => pick(e.to)}>{title.get(e.to) ?? e.to}</button>
            <span className="mem-row-meta mem-content"> · {t("shared: {terms} · score {score}", { terms: terms(e.witness), score: score(e) })}</span></li>)}</ul>
        </section>}
        {ranked.length === 0 ? <p className="mem-content">{t("No relations between the loaded records.")}</p> : <>
          <h3>{t("Most connected records")}</h3>
          <ul className="mem-list">{ranked.map(([id, n]) => <li key={id}><button type="button" className="mem-link" aria-pressed={selected === id} onClick={() => pick(id)}>{title.get(id) ?? id}</button><span className="mem-row-meta"> · {t("{n} relations", { n })}</span></li>)}</ul>
        </>}
        <details><summary>{t("All loaded records")}</summary>
          <ul className="mem-list">{graph.nodes.map(n => <li key={n.memory.memory.memory_id}><button type="button" className="mem-link" aria-pressed={selected === n.memory.memory.memory_id} onClick={() => pick(n.memory.memory.memory_id)}>{n.title}</button><span className="mem-row-meta"> · {word(n.form)}</span></li>)}</ul>
        </details>
      </>}
    </div></div>
    <aside className="qr88" aria-label={t("Automatic Memory Inspector")}><div className="qr79" aria-busy={near.busy}>
      {!selected && <p className="mem-content">{t("Choose a record to read what it is connected to.")}</p>}
      {selectedTitle && <h3 className="mem-content">{selectedTitle}</h3>}
      {near.busy && <p role="status">{t("Reading connected records…")}</p>}
      <ErrorBox error={near.error} />
      {lexicalOf.length > 0 && <section aria-label={t("Shared-word suggestions")}>
        <h4>{t("Shared-word suggestions")}</h4>
        <ul className="mem-list">{lexicalOf.map(e => { const other = e.from === selected ? e.to : e.from; return <li key={other}>
          <button type="button" className="mem-link" onClick={() => pick(other)}>{title.get(other) ?? other}</button>
          <p className="mem-row-meta mem-content">{t("shared: {terms} · score {score}", { terms: terms(e.witness), score: score(e) })}</p></li>; })}</ul>
      </section>}
      {neighbors && <>
        <p className="mem-row-meta">{t("{n} connected records", { n: neighbors.matched_in_scope })}</p>
        <ul className="mem-list">{neighbors.items.map(item => <li key={item.other.memory.memory.memory_id}>
          <button type="button" className="mem-link" onClick={() => pick(item.other.memory.memory.memory_id)}>{item.other.title}</button>
          <p className="mem-row-meta">{item.relations.map(r => `${word(r.relation)} · ${word(r.class)}`).join(" / ")}</p>
        </li>)}</ul>
      </>}
    </div></aside>
  </>;
}

// ---- Formation ---------------------------------------------------------------
const KINDS = ["material_captured", "formation", "reevaluation", "synthesis", "correction", "reversion", "state_change"];
export function RegisteredFormation() {
  return <Open title={t("Formation")}>{() => <FormationView />}</Open>;
}
function FormationView() {
  const [kind, setKind] = useState<string | null>(null);
  const [pages, setPages] = useState<ActivityPage[]>([]);
  const [selected, setSelected] = useState<{ id: string; selection: CatalogSelection } | null>(null);
  const reads = useLatestRead();
  const read = useCallback((cursor: unknown | null) => reads.run(
    () => catalogView({ operation: "activity", filter: CATALOG_FILTER, query: { memory: null, event_kind: kind, include_sources: false }, cursor, limit: 50 }),
    page => setPages(old => cursor ? [...old, page] : [page])), [kind, reads.run]);
  useEffect(() => { setPages([]); setSelected(null); void read(null); }, [read]);
  const last = pages.at(-1);
  const events = pages.flatMap(p => p.items);
  return <>
    <div className="qr45" aria-busy={reads.busy}><div className="qr44 mem-pad mem-stack">
      <h2 className="qr29">{t("Formation")}</h2>
      <label className="mem-label">{t("Event kind")} <select className="mem-input" value={kind ?? ""} disabled={reads.busy} onChange={e => setKind(e.target.value || null)}>
        <option value="">{t("All")}</option>{KINDS.map(k => <option key={k} value={k}>{word(k)}</option>)}</select></label>
      <button type="button" className="mem-button" disabled={reads.busy} onClick={() => { setPages([]); setSelected(null); void read(null); }}>{t("Read again")}</button>
      {reads.busy && <p role="status">{t("Reading what the system did…")}</p>}
      <ErrorBox error={reads.error} />
      {pages[0] && <>
        <Observed at={pages[0].header.authorized_at} />
        <p className="mem-content">{t("{shown} of {matched} events shown, newest first.", { shown: events.length, matched: pages[0].matched_in_scope })}</p>
        {!pages[0].time_derived_events_available && <p className="mem-row-meta">{t("Fading and archiving by time are not recorded as events yet.")}</p>}
        <ol className="mem-list">{events.map(e => <li key={e.event_id}>
          <span className="mem-row-meta">{stamp(e.proof.written_at)} · {word(e.event_kind)}{e.change ? ` · ${word(e.change)}` : ""}{e.adoption ? ` · ${word(e.adoption)}` : ""}{analystText(e.formation_reason) ? ` · ${analystText(e.formation_reason)}` : ""}</span><br />
          {e.memory ? <button type="button" className="mem-link" aria-pressed={selected?.id === e.memory.memory_id} onClick={() => setSelected({ id: e.memory!.memory_id, selection: pages[0].header.selection })}>{e.title ?? e.memory.memory_id}</button>
            : <span className="mem-content">{e.title ?? t("Source material")}</span>}
        </li>)}</ol>
        {last?.next != null && <button type="button" className="mem-button" disabled={reads.busy} onClick={() => void read(last.next)}>{t("Show older events")}</button>}
      </>}
    </div></div>
    <aside className="qr88" aria-label={t("Automatic Memory Inspector")}><div className="qr79">
      {selected ? <><CatalogDetailPanel key={selected.id} memoryId={selected.id} filter={CATALOG_FILTER} selection={selected.selection} read={catalogRead} entities={[]} />
        <ConflictGroup key={`c:${selected.id}`} memoryId={selected.id} /></>
        : <p className="mem-content">{t("Choose an event to read its record, quoted sources and any held contradiction.")}</p>}
    </div></aside>
  </>;
}
// ---- Worth a look (Memory ADR-MEM-164) ------------------------------------------
const HORIZONS = [7, 14, 30, 90];
const REASONS: Record<string, string> = { archives_soon: msg("Archived soon"), validity_ends_soon: msg("Validity ends soon") };
const TRANSITIONS: Record<string, string> = { fading: msg("Starts fading"), archived: msg("Archived") };
export function RegisteredReview() {
  return <Open title={t("Worth a look")}>{() => <ReviewView />}</Open>;
}
function ReviewView() {
  const [horizon, setHorizon] = useState(30);
  const [review, setReview] = useState<ReviewSuggestions | null>(null);
  const [schedule, setSchedule] = useState<AttentionSchedule[]>([]);
  const [selected, setSelected] = useState<{ id: string; selection: CatalogSelection } | null>(null);
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
    <div className="qr45" aria-busy={reads.busy || plans.busy}><div className="qr44 mem-pad mem-stack">
      <h2 className="qr29">{t("Worth a look")}</h2>
      <p className="mem-row-meta">{t("Suggestions come from time alone: records about to be archived and recorded validity that is about to end. They say nothing about whether a record is right; protecting, correcting or leaving it is your choice.")}</p>
      <label className="mem-label">{t("Look ahead")} <select className="mem-input" value={horizon} disabled={reads.busy} onChange={e => setHorizon(Number(e.target.value))}>
        {HORIZONS.map(h => <option key={h} value={h}>{t("{n} days", { n: h })}</option>)}</select></label>
      {reads.busy && <p role="status">{t("Reading suggestions…")}</p>}
      <ErrorBox error={reads.error} />
      {review && <>
        <Observed at={review.header.authorized_at} />
        <p className="mem-content">{t("{shown} of {total} records worth a look in the next {n} days.", { shown: review.items.length, total: review.total_in_horizon, n: horizon })}</p>
        <ol className="mem-list">{review.items.map(item => <li key={item.memory.memory.memory_id}>
          <button type="button" className="mem-link" aria-pressed={selected?.id === item.memory.memory.memory_id} onClick={() => pick(item.memory, review.header.selection)}>{item.title}</button>
          <span className="mem-row-meta"> · {day(item.due)} · {item.reasons.map(r => t(REASONS[r] ?? r)).join(" / ")} · {word(item.attention)}</span>
        </li>)}</ol>
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
    <aside className="qr88" aria-label={t("Automatic Memory Inspector")}><div className="qr79">
      {selected ? <CatalogDetailPanel key={selected.id} memoryId={selected.id} filter={CATALOG_FILTER} selection={selected.selection} read={catalogRead} entities={[]} />
        : <p className="mem-content">{t("Choose a record to read it and its quoted sources.")}</p>}
    </div></aside>
  </>;
}
function ConflictGroup({ memoryId }: { memoryId: string }) {
  const reads = useLatestRead();
  const [group, setGroup] = useState<Conflicts | null>(null);
  useEffect(() => { void reads.run(() => catalogView({ operation: "conflicts", filter: CATALOG_FILTER, memory_id: memoryId, cursor: null, limit: 16 }), setGroup); }, [memoryId, reads.run]);
  return <section className="mem-stack" aria-label={t("Contradicting records")}>
    <h4>{t("Contradicting records")}</h4>
    {reads.busy && <p role="status">{t("Reading records…")}</p>}
    <ErrorBox error={reads.error} />
    {group && (group.items.length === 0 ? <p className="mem-row-meta">{t("No contradicting record is held.")}</p> :
      <ul className="mem-list">{group.items.map(item => <li key={item.base.memory.memory_id}><span className="mem-content">{item.title}</span><p className="mem-row-meta">{item.base.content}</p></li>)}</ul>)}
  </section>;
}

// ---- Recall ------------------------------------------------------------------
export function RegisteredRecall() {
  return <Open title={t("Recall")}>{() => <RecallView mode="recall" />}</Open>;
}
/** Context in the registered entry: the same recall an Agent would receive, previewed without saving. */
export function RegisteredContext() {
  return <section data-screen-label="Context Surface" className="qr89 mem-registered-context"><Open title={t("Context")}>{() => <RecallView mode="context" />}</Open></section>;
}
const INTENTS = [["current", msg("Current memories")], ["historical", msg("Including history")], ["browse", msg("Browse without a cue")]] as const;
function RecallView({ mode }: { mode: "recall" | "context" }) {
  const { nativeStatus } = useStatus();
  const limits = nativeStatus?.recall_limits;
  const [text, setText] = useState("");
  const [intent, setIntent] = useState<RecallQuery["intent"]>("current");
  const [preview, setPreview] = useState<RecallPreview | null>(null);
  const reads = useLatestRead();
  const run = () => {
    if (!limits || (intent !== "browse" && !text.trim())) return;
    setPreview(null);
    void reads.run(() => catalogRecall({ text, conditions: [], event_window: null, at: new Date().toISOString(), intent, limit: limits.max_items, max_bytes: limits.max_bytes }), setPreview);
  };
  const reasons = preview ? Object.entries(preview.trace_coverage.reason_counts) : [];
  return <>
    <div className="qr45" aria-busy={reads.busy}><div className="qr44 mem-pad mem-stack">
      <h2 className="qr29">{t(mode === "context" ? "Context" : "Recall")}</h2>
      <p className="mem-content">{t(mode === "context" ? "Preview the context an Agent would receive for a cue. It uses the same recall as the Agent and saves nothing." : "Why these records come to mind for a cue: the same recall an Agent uses, previewed without saving.")}</p>
      <form className="mem-stack" onSubmit={event => { event.preventDefault(); run(); }}>
        <label className="mem-label">{t("Cue")} <input className="mem-input" value={text} maxLength={2048} autoComplete="off" onChange={event => setText(event.target.value)} /></label>
        <label className="mem-label">{t("Scope")} <select className="mem-input" value={intent} onChange={event => setIntent(event.target.value as RecallQuery["intent"])}>
          {INTENTS.map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}</select></label>
        <button className="mem-button" disabled={reads.busy || !limits || (intent !== "browse" && !text.trim())}>{t("Preview recall")}</button>
      </form>
      {limits && <p className="mem-row-meta">{t("Up to {items} records and {bytes} bytes, the limits of this entry.", { items: limits.max_items, bytes: limits.max_bytes })}</p>}
      {reads.busy && <p role="status">{t("Previewing recall…")}</p>}
      <ErrorBox error={reads.error} />
      {preview && <>
        <Observed at={preview.trace.authorized_at} />
        <p className="mem-content">{t("{considered} considered · {selected} selected · {excluded} excluded · {bytes} bytes", { considered: preview.trace.considered, selected: preview.trace.selected.length, excluded: preview.trace_coverage.excluded_in_scope, bytes: preview.trace.rendered_bytes })}</p>
        {!preview.complete_in_scope && <p role="status">{t("The byte budget ran out; more records matched than were included.")}</p>}
        {preview.trace.selected.length === 0 ? <p className="mem-content">{t("Nothing was selected for this cue.")}</p> :
          <ol className="mem-list">{preview.trace.selected.map((s, i) => <li key={s.memory.memory_id}>
            <span className="mem-content">{preview.items[i].record.fields.title}</span>
            <p className="mem-row-meta">{t("score {score}", { score: s.score })} · {word(s.attention)} · {s.reasons.map(word).join(" · ")}</p>
          </li>)}</ol>}
        {reasons.length > 0 && <><h3>{t("Why others were left out")}</h3>
          <ul className="mem-list">{reasons.map(([reason, n]) => <li key={reason} className="mem-row-meta">{word(reason)} · {n}</li>)}</ul></>}
        <details open={mode === "context"}><summary>{t("Rendered context")}</summary><pre className="mem-content mem-rendered">{preview.rendered_context}</pre></details>
      </>}
    </div></div>
    <aside className="qr88" aria-label={t("Automatic Memory Inspector")}><div className="qr79">
      <p className="mem-content">{t("Nothing is written: no Capsule is saved and no Agent is enrolled. Selection order and reasons come from Memory's recall algorithm.")}</p>
    </div></aside>
  </>;
}

// ---- Sessions ----------------------------------------------------------------
export function RegisteredSessions() {
  return <section data-screen-label="Sessions" className="qr89 mem-registered-sessions"><Open title={t("Sessions")}>{() => <SessionsView />}</Open></section>;
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
  const open = (id: string) => {
    setChosen(id); setDetail(null); setTexts({});
    void turns.run(async () => {
      const found = await catalogView({ operation: "conversation_detail", conversation_id: id, cursor: null, limit: 50 });
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
  const last = pages.at(-1);
  return <>
    <aside className="qr28" aria-busy={reads.busy}><div className="qr20"><h1 className="qr18">{t("Sessions")}</h1>
      <div className="qr19">{pages[0] ? t("{shown} of {matched} conversations", { shown: items.length, matched: pages[0].matched_in_scope }) : t("Reading conversations…")}</div></div>
      <ErrorBox error={reads.error} />
      {scopes.length > 1 && <label className="mem-label mem-pad">{t("Captured by")} <select className="mem-input" value={scope} onChange={e => setScope(e.target.value)}>
        <option value="">{t("All")}</option>{scopes.map(v => <option key={v} value={v}>{v}</option>)}</select></label>}
      <ul className="mem-list mem-pad">{items.map(c => <li key={c.conversation.conversation_id}>
        <button type="button" className="mem-link" aria-pressed={chosen === c.conversation.conversation_id} onClick={() => open(c.conversation.conversation_id)}>{c.conversation.title ?? t("Untitled conversation")}</button>
        <p className="mem-row-meta">{recordTimeText(c.conversation.started_at)} · {c.conversation.platform}{c.conversation.account_scope ? ` · ${c.conversation.account_scope}` : ""} · {t("{n} captured turns", { n: c.visible_captured_turns })}</p>
      </li>)}</ul>
      {last?.next != null && <button type="button" className="mem-button" disabled={reads.busy} onClick={() => void read(last.next)}>{t("Show more conversations")}</button>}
    </aside>
    <div className="qr45" aria-busy={turns.busy}><div className="qr44 mem-pad mem-stack">
      {!chosen && pages[0] && <p className="mem-content">{t(pages[0].matched_in_scope === 0 ? "This library has no captured conversations in the current scope." : "Choose a conversation to read its captured turns.")}</p>}
      {turns.busy && <p role="status">{t("Reading captured turns…")}</p>}
      <ErrorBox error={turns.error} />
      {detail && (detail.conversation ? <>
        <h2 className="qr29">{detail.conversation.title ?? t("Untitled conversation")}</h2>
        <p className="mem-row-meta">{recordTimeText(detail.conversation.started_at)} – {recordTimeText(detail.conversation.ended_at)} · {detail.conversation.platform}</p>
        <p className="mem-row-meta">{t("Only captured turns are shown; this is not the whole platform conversation.")}</p>
        <ol className="mem-list">{detail.turns.map(turn => {
          const body = texts[`${turn.turn.source.source_id}:${turn.turn.source.source_revision}`];
          return <li key={turn.turn.turn_id}><p className="mem-row-meta">{turn.source_record.speaker} · #{turn.turn.sequence}</p>
            {body?.source ? <p className="mem-content">{body.excerpt}{body.complete_in_scope ? "" : " …"}</p> : <p className="mem-row-meta">{t("This source revision is no longer available.")}</p>}</li>;
        })}</ol>
        {detail.next != null && <p className="mem-row-meta">{t("{shown} of {total} captured turns shown.", { shown: detail.turns.length, total: detail.visible_captured_turns })}</p>}
      </> : <p role="status">{t("This conversation is no longer available in the current scope.")}</p>)}
    </div></div>
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
type Note = { title: string; line: string; route: { go: () => void }; detail: string; time: string };
export function RegisteredHome({ nav, timeline, now, phase }: { nav: { memory: { go: () => void }; sessions: { go: () => void }; context: { go: () => void } }; timeline: MapSpec; now: number; phase: string }) {
  const { nativeStatus, nativeError, error } = useStatus();
  const { readings, error: readError } = useRegisteredReadings();
  const clock = (at: string) => nativeDate(Date.parse(at), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const fallback = nativeError?.text ?? error?.text ?? (nativeStatus?.reason ? describe(nativeStatus.reason) : readError?.text ?? registeredLabel(nativeStatus));
  const notes: Note[] = [
    { title: t("Native memory catalog"), route: nav.memory, detail: phase, time: readings ? clock(readings.observedAt) : "—",
      line: readings ? t("{total} records · {adopted} adopted · {staged} staged", { total: readings.stats.matched_in_scope, adopted: count(readings.stats, "adoption", "adopted"), staged: count(readings.stats, "adoption", "staged") }) : fallback },
    { title: t("Formation"), route: nav.memory, detail: readings?.latest ? word(readings.latest.event_kind) : "—", time: readings?.latest ? clock(readings.latest.proof.written_at) : "—",
      line: readings ? readings.latest ? t("Latest: {title}", { title: readings.latest.title ?? t("Source material") }) : t("No recorded events.") : fallback },
    { title: t("Sessions"), route: nav.sessions, detail: "—", time: "—",
      line: readings ? t("{n} captured conversations", { n: readings.conversations }) : fallback },
    { title: t("Context"), route: nav.context, detail: "—", time: "—", line: t("Preview the context an Agent would receive") },
  ];
  return <NativeHome nav={nav} timeline={timeline} now={now} open={false} vault={null} readonlyEntry readonlyNotes={notes}
    label={readings ? t("{label} · {n} records", { label: registeredLabel(nativeStatus), n: readings.stats.matched_in_scope }) : registeredLabel(nativeStatus)} phase={phase} reviewLine={fallback} />;
}

// ---- Runtime Inspector ----------------------------------------------------------
export function RegisteredInspectorFacts() {
  const { nativeStatus } = useStatus();
  const { readings, busy, error, reload } = useRegisteredReadings();
  const selection = nativeStatus?.state === "open" ? nativeStatus.selection : undefined;
  if (!selection) return null;
  return <section className="mem-stack" aria-label={t("Registered library readings")} aria-busy={busy}>
    <button type="button" className="mem-button" disabled={busy} onClick={reload}>{t("Read library totals again")}</button>
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
    {nativeStatus?.corrections && <ConnectorStatus />}
  </section>;
}
