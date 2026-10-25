import React, { useEffect, useRef, useState } from 'react';
import { AUTO_MEMORIES, STATE_LABEL, THEMES, THEME_NOTE, type AutoMemory } from './fixture';
import { D0, D1, MONDAYS, MONTHS, WEEK, WEEK0, byId, dayStart, daysBetween, fmtClock, fmtDayShort, fmtStamp, occurredText, pack, spanOf, toMs, xOf, type Span } from './model';
import { Glyph, StateKey } from './parts';
import type { ViewProps } from './types';
import { lendMap, type MapSpec } from '../../theme/TimeMap';
import { clearViews, panTo, peekView, useTimeView } from '../../theme/timeview';

// Timeline, the signature view. The whole sample (1 Jul to 31 Oct) is the time
// map in the strip above the page; the chart shows six weeks of it, and the
// amber frame in the map moves them. Each theme is a pen lane (model
// suggestions); the lower pen records when the material was received, which is a
// different time and never stands in for the occurred one. The lane at the
// bottom is the pen's remark trail for the selected memory: how it formed.
const FALLBACK_W = 760;     // visible width (px) used until the real width is measured
const ROW = 16;
const LABEL_PX = 6.4;       // average width of one title character in the lane labels (px, Geist 13)
const DAY = 24 * 36e5;
const TL_SPAN = 42 * DAY;   // the chart shows six weeks
const TL_START = dayStart('2026-08-31');
const pct = (x: number) => (x * 100).toFixed(3) + '%';

const SPEC: MapSpec = {
  key: 'timeline',
  label: 'Time map of the sample, 1 July to 31 October 2026, one cell per day. The amber frame is the six weeks the Timeline shows.',
  cells: Math.round((D1 - D0) / DAY),
  ticks: [],
  bars: (() => { const n = Math.round((D1 - D0) / DAY); const c = Array.from({ length: n }, () => 0); AUTO_MEMORIES.forEach((m) => { const sp = spanOf(m.occurred); if (!sp) return; const a = Math.max(0, Math.floor(sp.a * n)), b = Math.min(n, Math.max(a + 1, Math.ceil(sp.b * n))); for (let i = a; i < b; i++) c[i]++; }); const mx = Math.max(...c, 1); return c.map((x) => x / mx); })(),
  labels: MONTHS.map((mo) => ({ at: mo.a, text: mo.name })),
  step: 7 * DAY,
  unit: 'week',
  readout: (start, span) => fmtDayShort(start) + ' – ' + fmtDayShort(start + span - 1) + ' 2026',
  init: () => ({ start: TL_START, span: TL_SPAN, domain: [D0, D1] as const }),
};

// Only the coarse grid: a rule at each month and one at each Monday. Nothing finer.
const GRID: React.CSSProperties = (() => {
  const month = MONTHS.slice(1).map((m) => { const p = (m.a * 100).toFixed(3) + '%'; return `linear-gradient(to right,transparent calc(${p} - 0.5px),var(--grid-major) calc(${p} - 0.5px),var(--grid-major) calc(${p} + 0.5px),transparent calc(${p} + 0.5px))`; });
  return {
    backgroundImage: [...month, 'linear-gradient(to right,var(--grid-minor) 1px,transparent 1px)'].join(','),
    backgroundSize: [...month.map(() => '100% 100%'), `${(WEEK * 100).toFixed(4)}% 100%`].join(','),
    backgroundPosition: [...month.map(() => '0 0'), `${((WEEK0 / (1 - WEEK)) * 100).toFixed(4)}% 0`].join(','),
    backgroundRepeat: [...month.map(() => 'no-repeat'), 'repeat-x'].join(','),
  };
})();

interface Placed { m: AutoMemory; span: Span; side: 'r' | 'l' }
const LANES = [...THEMES.map((t) => ({ id: t.id, name: t.name })), { id: '', name: 'No theme suggested' }];
const laneItems = (id: string): Placed[] => AUTO_MEMORIES
  .filter((m) => (id ? m.themes.includes(id) : m.themes.length === 0))
  .flatMap((m) => { const span = spanOf(m.occurred); return span ? [{ m, span, side: 'r' as const }] : []; });

const markerW = (s: Span, EST: number) => Math.max(s.b - s.a, (s.shape === 'dot' ? 10 : 9) / EST);
function layoutLane(id: string, EST: number) {
  const items = laneItems(id).map((p) => {
    const w = (p.m.title.length * LABEL_PX + 16) / EST;
    const a0 = p.span.shape === 'dot' ? p.span.a - 5 / EST : p.span.a;
    const mk = markerW(p.span, EST) + (p.span.open ? 44 / EST : 0);
    const side: 'r' | 'l' = a0 + mk + w > 0.985 ? 'l' : 'r';
    return { ...p, side, ext: (side === 'r' ? [a0 - 6 / EST, a0 + mk + w + 6 / EST] : [a0 - w - 6 / EST, a0 + mk + 6 / EST]) as [number, number] };
  });
  const packed = pack(items, (t) => t.ext);
  return { packed, rows: packed.rows ?? 1, height: Math.max(id === '' ? 38 : 30, (packed.rows ?? 1) * ROW + 12) };
}
const FORMATION_H = 50;

function markerStyle(s: Span, row: number): React.CSSProperties {
  const top = 6 + row * ROW;
  if (s.shape === 'dot') return { left: `calc(${pct(s.a)} - 5px)`, width: 10, top };
  if (s.shape === 'cell') return { left: pct(s.a), width: `max(${pct(s.b - s.a)}, 9px)`, top };
  return { left: pct(s.a), width: s.open ? 9 : `max(${pct(s.b - s.a)}, 8px)`, top };
}

const K = (D1 - D0) / TL_SPAN;   // how many times wider the whole sample is than the visible chart

export default function Timeline({ sel, select }: ViewProps) {
  // The time map in the strip owns which six weeks are showing; this chart lays the whole sample out at that scale and slides it.
  const v = useTimeView('timeline', SPEC.init);
  React.useEffect(() => { lendMap(SPEC); return () => { lendMap(null); clearViews('timeline'); }; }, []);
  // Labels are packed against the laid-out paper's real width, so a wide window gets fewer rows.
  const [visible, setW] = useState(FALLBACK_W);
  const EST = visible * K;
  const col = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = col.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setW(Math.max(420, Math.round(el.clientWidth)));
    const ro = new ResizeObserver(measure); ro.observe(el); measure();
    return () => ro.disconnect();
  }, []);
  const startF = (v.start - D0) / (D1 - D0), endF = (v.start + v.span - D0) / (D1 - D0);
  // A memory chosen elsewhere (another view, a link in the Inspector) that sits outside the six weeks pulls the frame to it.
  useEffect(() => {
    const sp = spanOf(byId.get(sel)!.occurred); const cur = peekView('timeline'); if (!sp || !cur) return;
    const a = D0 + sp.a * (D1 - D0), b = D0 + sp.b * (D1 - D0);
    if (b < cur.start + 2 * DAY || a > cur.start + cur.span - 2 * DAY) panTo('timeline', (a + b) / 2 - cur.span / 2);
  }, [sel]);
  const off = (id: string) => laneItems(id).reduce((n, p) => ({ before: n.before + (p.span.b < startF ? 1 : 0), after: n.after + (p.span.a > endF ? 1 : 0) }), { before: 0, after: 0 });
  const LAYOUT = LANES.map((l) => ({ ...l, ...layoutLane(l.id, EST) }));
  const m = byId.get(sel)!;
  const span = spanOf(m.occurred);
  const rx = xOf(toMs(m.received));
  const recv = pack(AUTO_MEMORIES.map((x) => ({ x, at: xOf(toMs(x.received)) })), (t) => [t.at - 7 / EST, t.at + 7 / EST]);
  const recvRows = recv.rows ?? 1;
  const recvH = recvRows * 11 + 32;
  const unknown = AUTO_MEMORIES.filter((x) => x.occurred.precision === 'unknown');
  const lag = span ? daysBetween(D0 + span.b * (D1 - D0), toMs(m.received)) : null;
  // Pen notes for the selected memory: ordinal marks, nudged apart so they never overlap.
  const trail = m.trail.map((t, i) => ({ ...t, n: i + 1, x: xOf(toMs(t.at)) }));
  let last = -1;
  const notes = trail.map((t) => { const cx = Math.max(t.x, last + 26 / EST); last = cx; return { ...t, cx }; });
  return (
    <div className="am-timeline">
      <div className="am-view-head am-tl-head">
        <h2 className="am-vh">Timeline <span>when it happened · {fmtDayShort(v.start)} – {fmtDayShort(v.start + v.span - 1)} of 1 Jul – 31 Oct</span></h2>
        <p className="am-fine am-tl-fine">{THEME_NOTE} Occurred time is the axis, in Asia/Shanghai (UTC+8). Received time is the lower pen, a different time. Move the amber frame in the time map above to see other weeks.</p>
      </div>

      <div className="am-tl" role="group" aria-label="Timeline, 1 July to 31 October 2026">
        <div className="am-tl-gut" aria-hidden="false">
          <div className="am-tl-corner"><b>Theme pens</b><span>model suggestion</span></div>
          {LAYOUT.map((l) => { const o = off(l.id); return <div key={l.id || 'none'} className="am-lane-label" style={{ height: l.height }}><span>{l.name}</span>{l.packed.length === 0 ? <em>no dated memory</em> : o.before || o.after ? <em>{o.before ? `◂ ${o.before} earlier` : ''}{o.before && o.after ? ' · ' : ''}{o.after ? `${o.after} later ▸` : ''}</em> : null}</div>; })}
          <div className="am-lane-label am-lane-recv" style={{ height: recvH }}><span>Received</span><em>pen 2 · when material arrived</em></div>
          <div className="am-lane-label am-lane-form" style={{ height: FORMATION_H }}><span>Formation</span><em>selected memory</em></div>
        </div>
        <div className="am-tl-col" ref={col}>
          <div className="am-pan" data-by={v.by} style={{ width: (K * 100).toFixed(3) + '%', transform: `translateX(${(-startF * 100).toFixed(4)}%)` }}>
          <div className="am-axis" style={GRID}>
            {MONTHS.map((mo) => <span key={mo.key} className="am-axis-m" style={{ left: pct(mo.a) }}>{mo.name} <b>{mo.key.slice(0, 4)}</b></span>)}
            {MONDAYS.map((w) => <span key={w.x} className="am-axis-w" style={{ left: pct(w.x) }}>{w.day}</span>)}
          </div>
          <div className="am-lanes">
            {LAYOUT.map((l) => (
              <div key={l.id || 'none'} className="am-lane" style={{ ...GRID, height: l.height }} role="group" aria-label={`Theme pen: ${l.name}, model suggestion`}>
                <span className="am-base" aria-hidden="true" />
                {l.packed.map(({ item }) => <span key={"t" + item.m.id} className="am-tick" aria-hidden="true" data-span={item.span.b > item.span.a || undefined} data-soft={item.span.softA || undefined} style={{ left: pct(item.span.a), width: item.span.b > item.span.a ? `max(${pct(item.span.b - item.span.a)}, 3px)` : undefined }} />)}
                {l.packed.map(({ item, row }) => {
                  const o = occurredText(item.m.occurred);
                  return (
                    <button key={item.m.id} type="button" className="am-mk" aria-pressed={item.m.id === sel} data-shape={item.span.shape} data-soft-a={item.span.softA || undefined} data-soft-b={item.span.softB || undefined} data-open={item.span.open || undefined} data-side={item.side}
                      style={markerStyle(item.span, row)} onClick={() => select(item.m.id)}
                      aria-label={`${item.m.title}. ${STATE_LABEL[item.m.state]}. Occurred ${o.text}, ${o.tag}. Theme ${l.name}, model suggestion.`}>
                      <i className="am-fill am-mk-bar" data-s={item.m.state} />
                      <span className="am-mk-label">{item.m.title}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            <div className="am-lane am-recv" style={{ ...GRID, height: recvH }} role="group" aria-label="Received pen: when the material arrived, not when it happened">
              <span className="am-pen-line" />
              {recv.map(({ item, row }) => (
                <button key={item.x.id} type="button" className="am-rt" aria-pressed={item.x.id === sel} style={{ left: `calc(${pct(item.at)} - 5px)`, bottom: 12 + row * 11 }} onClick={() => select(item.x.id)}
                  aria-label={`Received ${fmtStamp(item.x.received)}. ${item.x.title}.`} />
              ))}
              {span && lag !== null && lag >= 1 ? <span className="am-lag" style={{ left: pct(Math.min(span.b, rx)), width: pct(Math.abs(rx - span.b)) }}><span>received {lag} {lag === 1 ? 'day' : 'days'} after it happened</span></span> : null}
              <span className="am-rt-label" data-side={(rx - startF) / (endF - startF) > 0.7 ? 'l' : 'r'} style={{ left: pct(rx), top: 5 }}>received {fmtDayShort(toMs(m.received))}, {fmtClock(toMs(m.received))}</span>
            </div>
            <div className="am-lane am-form" style={{ ...GRID, height: FORMATION_H }} role="group" aria-label={`Formation notes for ${m.title}`}>
              <svg className="am-leaders" viewBox={`0 0 1000 ${FORMATION_H}`} preserveAspectRatio="none" aria-hidden="true">
                {notes.map((t) => <path key={t.n} d={`M${(t.x * 1000).toFixed(2)} 0 L${(t.x * 1000).toFixed(2)} 6 L${(t.cx * 1000).toFixed(2)} 24`} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
              </svg>
              {notes.map((t) => <span key={t.n} className="am-note-n" data-yours={t.step === 'corrected' || undefined} style={{ left: `calc(${pct(t.cx)} - 10px)` }}>{t.n}</span>)}
            </div>
            {span ? <span className="am-cursor" data-band={span.b - span.a > 0.004 || undefined} style={{ left: pct(span.a), width: span.b - span.a > 0.004 ? pct(span.b - span.a) : undefined }} aria-hidden="true" /> : null}
            <span className="am-cursor am-cursor-recv" style={{ left: pct(rx) }} aria-hidden="true" />
          </div>
          </div>
        </div>
      </div>

      <section className="am-unknown" aria-label="Time not recorded">
        <h3>Time not recorded <span className="am-tag">no occurred time</span></h3>
        <p className="am-fine">The occurred time of these is unknown, so they are not placed on the axis. Their received time is still on the lower pen.</p>
        <ul>
          {unknown.map((u) => (
            <li key={u.id}><button type="button" className="am-ref" aria-pressed={u.id === sel} onClick={() => select(u.id)}><Glyph s={u.state} /><span className="am-ref-t">{u.title}</span><span className="am-mono am-ref-id">{u.id}</span></button></li>
          ))}
        </ul>
      </section>

      <section className="am-pen-notes" aria-label={`How ${m.title} formed`}>
        <h3>Pen notes <span className="am-tag">how “{m.title}” formed</span></h3>
        <ol>
          {trail.map((t) => (
            <li key={t.n} data-yours={t.step === 'corrected' || undefined}>
              <span className="am-note-n am-note-n-static">{t.n}</span>
              <span className="am-mono am-pn-time">{fmtStamp(t.at)}</span>
              <span className="am-pn-step">{t.step === 'extracted' ? 'Extracted' : STATE_LABEL[t.step]}{t.step === 'corrected' ? <i> · recorded as yours</i> : null}</span>
              <span className="am-pn-note">{t.note}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="am-tl-key" aria-label="How to read the timeline">
        <h3>Key</h3>
        <ul className="am-prec">
          <li><span className="am-mk-demo" data-shape="dot"><i className="am-fill am-mk-bar" data-s="adopted" /></span>instant</li>
          <li><span className="am-mk-demo" data-shape="cell"><i className="am-fill am-mk-bar" data-s="adopted" /></span>day, time not recorded</li>
          <li><span className="am-mk-demo am-wide" data-shape="month" data-soft-a data-soft-b><i className="am-fill am-mk-bar" data-s="adopted" /></span>whole month, day not recorded</li>
          <li><span className="am-mk-demo am-wide" data-shape="range"><i className="am-fill am-mk-bar" data-s="adopted" /></span>range</li>
          <li><span className="am-mk-demo am-wide" data-shape="range" data-open><i className="am-fill am-mk-bar" data-s="adopted" /></span>end open</li>
          <li><span className="am-rt am-rt-demo" aria-hidden="true" />received</li>
        </ul>
        <StateKey />
      </section>
    </div>
  );
}

