// R5 A6: the selected record and its bounded neighbourhood from Memory's
// neighbour projection, plotted on the negative. Every node is the same size;
// each relation kind has its own line style and every line carries its word,
// so line style is never the only signal. Suggestions are marked as such.
import type { Neighbors } from "./catalog";
import { word } from "./catalogWords";
import { t } from "../i18n";

const W = 720, H = 380, NW = 168, NH = 40, MAX = 12;
const STYLE: Record<string, { dash?: string; arrow?: boolean }> = {
  same_conversation: {}, same_entity: { dash: "6 4" }, theme_cooccurrence: { dash: "10 3 2 3" },
  derived_from: { arrow: true }, reversion: { dash: "2 3", arrow: true }, lexical_neighbor: { dash: "1 4" }, semantic_neighbor: { dash: "1 2" }, same_name: { dash: "4 2 1 2" },
};
/** Fit a title in a node: wide (CJK) characters count double against the budget. */
const short = (s: string, budget = 24) => {
  let used = 0, out = "";
  for (const ch of s) {
    const w = /[⺀-￯]/.test(ch) ? 2 : 1;
    if (used + w > budget - 1) return out + "…";
    used += w; out += ch;
  }
  return out;
};

export function RegisteredConstellation({ center, neighbors, pick }: { center: { id: string; title: string }; neighbors: Neighbors; pick: (id: string) => void }) {
  const shown = neighbors.items.slice(0, MAX);
  const cx = W / 2, cy = H / 2;
  const nodes = shown.map((item, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, shown.length);
    return { item, x: cx + (W / 2 - NW / 2 - 8) * Math.cos(angle), y: cy + (H / 2 - NH / 2 - 8) * Math.sin(angle) };
  });
  const kinds = [...new Set(shown.flatMap(i => i.relations.map(r => r.relation)))];
  return <section className="mem-stack" aria-label={t("Constellation")} data-constellation>
    <h3>{t("Constellation")}</h3>
    <p className="mem-row-meta">{t("The chosen record and the records it is connected to. Every record is drawn the same size; each line names its relation.")}</p>
    <div className="mem-table-scroll"><svg className="mem-constellation" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={t("{n} connected records around {title}", { n: shown.length, title: center.title })}>
      <defs><marker id="mem-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor" /></marker></defs>
      {nodes.map(({ item, x, y }) => item.relations.map((r, k) => {
        const s = STYLE[r.relation] ?? {};
        const offset = (k - (item.relations.length - 1) / 2) * 6;
        return <g key={`${item.other.memory.memory.memory_id}:${r.relation}`} data-relation={r.relation}>
          <line x1={cx + offset} y1={cy + offset} x2={x + offset} y2={y + offset} stroke="currentColor" strokeWidth={r.class === "algorithm_suggestion" ? 1 : 1.5}
            strokeDasharray={s.dash} markerEnd={s.arrow && r.direction !== "incoming" ? "url(#mem-arrow)" : undefined} markerStart={s.arrow && r.direction === "incoming" ? "url(#mem-arrow)" : undefined} />
          <text x={(cx + x) / 2 + offset} y={(cy + y) / 2 + offset - 4} className="mem-constellation-word" textAnchor="middle">{word(r.relation)}{r.class === "algorithm_suggestion" ? ` · ${t("suggestion")}` : ""}</text>
        </g>;
      }))}
      <g className="mem-constellation-node is-center"><rect x={cx - NW / 2} y={cy - NH / 2} width={NW} height={NH} /><text x={cx} y={cy + 4} textAnchor="middle">{short(center.title)}</text></g>
      {nodes.map(({ item, x, y }) => <g key={item.other.memory.memory.memory_id} className="mem-constellation-node" role="button" tabIndex={0} aria-label={item.other.title}
        onClick={() => pick(item.other.memory.memory.memory_id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(item.other.memory.memory.memory_id); } }}>
        <rect x={x - NW / 2} y={y - NH / 2} width={NW} height={NH} /><text x={x} y={y + 4} textAnchor="middle">{short(item.other.title)}</text>
      </g>)}
    </svg></div>
    {kinds.length > 0 && <ul className="mem-constellation-legend" aria-label={t("Legend")}>{kinds.map(k => <li key={k}>
      <svg width="40" height="8" aria-hidden="true"><line x1="1" y1="4" x2="39" y2="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray={STYLE[k]?.dash} /></svg> {word(k)}</li>)}</ul>}
    {neighbors.items.length > MAX && <p className="mem-row-meta">{t("The figure shows {shown} of {total} connected records; the list below has the rest.", { shown: MAX, total: neighbors.items.length })}</p>}
  </section>;
}

// R5 A8: every loaded record at once. Records of one kind gather around one
// centre (a golden-angle spiral, so the layout is the same on every read);
// recorded relations are faint lines and suggestions fainter dotted ones.
// Positions mean nothing beyond kind. Up to a few thousand records stay in
// SVG; larger libraries are OPEN_ISSUES #24 (Morii's decision).
export function RegisteredStarMap({ nodes, edges, selected, pick }: {
  nodes: { memory: { memory: { memory_id: string } }; title: string; form: string }[];
  edges: { from: string; to: string; relation: string; class: string }[];
  selected: string | null; pick: (id: string) => void;
}) {
  const SW = 900, SH = 560;
  const forms = [...new Set(nodes.map(n => n.form))].sort();
  const centre = new Map(forms.map((f, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, forms.length);
    const r = forms.length > 1 ? Math.min(SW, SH) * 0.3 : 0;
    return [f, { x: SW / 2 + r * Math.cos(a) * 1.3, y: SH / 2 + r * Math.sin(a) }];
  }));
  const seen = new Map<string, number>();
  const pos = new Map(nodes.map(n => {
    const k = seen.get(n.form) ?? 0; seen.set(n.form, k + 1);
    const c = centre.get(n.form)!, a = k * 2.39996, r = 6 * Math.sqrt(k);
    return [n.memory.memory.memory_id, { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a), n }];
  }));
  return <section className="mem-stack" aria-label={t("Star map")} data-starmap>
    <h3>{t("Star map")}</h3>
    <p className="mem-row-meta">{t("Every loaded record as one dot, gathered by kind. Position means only the kind; lines are relations, dotted ones are suggestions. Choose a dot to read the record and draw its constellation.")}</p>
    <div className="mem-table-scroll"><svg className="mem-starmap" viewBox={`0 0 ${SW} ${SH}`} width={SW} height={SH} role="img" aria-label={t("{n} records in {k} kinds", { n: nodes.length, k: forms.length })}>
      {edges.map((e, i) => { const a = pos.get(e.from), b = pos.get(e.to); return a && b ? <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="mem-star-edge" data-class={e.class} /> : null; })}
      {forms.map(f => <text key={f} x={centre.get(f)!.x} y={centre.get(f)!.y - 6 * Math.sqrt(seen.get(f) ?? 1) - 10} textAnchor="middle" className="mem-star-label">{word(f)} · {seen.get(f)}</text>)}
      {[...pos.values()].map(({ x, y, n }) => <circle key={n.memory.memory.memory_id} cx={x} cy={y} r={selected === n.memory.memory.memory_id ? 6 : 3.5}
        className={selected === n.memory.memory.memory_id ? "mem-star is-selected" : "mem-star"} onClick={() => pick(n.memory.memory.memory_id)}><title>{n.title}</title></circle>)}
    </svg></div>
  </section>;
}
