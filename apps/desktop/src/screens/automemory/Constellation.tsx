import React, { useEffect, useRef, useState } from 'react';
import { REL_NOTE, STATE_LABEL, type RelType } from './fixture';
import { byId, relWords, relationsOf, type Rel } from './model';
import { Glyph } from './parts';
import type { ViewProps } from './types';

import { t } from '../../i18n/index.ts';
// Constellation: the selected memory and its bounded neighbourhood, plotted on
// the negative. Every node has the same size; the five relations are five pen
// line styles and each line carries its own word, so line style is never the
// only signal. + and − zoom the whole figure (nodes, lines and words together);
// above 100% the plot scrolls.
const TYPES: RelType[] = ['source', 'supersedes', 'shared theme', 'context dependency', 'suggestion'];
const ZOOM = [0.85, 1, 1.25, 1.5];
const Z0 = 1;                  // index of 100%
const NW = 206, NH = 50;       // node size in px, identical for every node
const PLOT_H = 330;
const relLabel = (r: RelType) => t(r === 'suggestion' ? 'suggestion · unconfirmed' : r);

/** One relation's line style in a 44 x 8 sample. */
function Sample({ t }: { t: RelType }) {
  return (
    <svg className="am-rel-sample" viewBox="0 0 44 8" width="44" height="8" aria-hidden="true" data-t={t}>
      <line x1="1" y1="4" x2={t === 'supersedes' ? 34 : 43} y2="4" />
      {t === 'supersedes' ? <path d="M33 0.5 L43 4 L33 7.5z" className="am-arrow" /> : null}
    </svg>
  );
}

/** The point where a line from a node's centre toward (tx, ty) leaves the node's box. */
function edge(cx: number, cy: number, tx: number, ty: number, pad = 3): [number, number] {
  const dx = tx - cx, dy = ty - cy;
  const s = Math.min(dx ? (NW / 2 + pad) / Math.abs(dx) : Infinity, dy ? (NH / 2 + pad) / Math.abs(dy) : Infinity);
  return [cx + dx * s, cy + dy * s];
}

export default function Constellation({ sel, select }: ViewProps) {
  const [zi, setZi] = useState(Z0);
  const [w, setW] = useState(740);
  const frame = useRef<HTMLDivElement>(null);
  const plot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = frame.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setW(Math.max(480, Math.round(el.clientWidth))));
    ro.observe(el); setW(Math.max(480, Math.round(el.clientWidth)));
    return () => ro.disconnect();
  }, []);
  const zoom = ZOOM[zi];
  // After a zoom step, keep the figure's centre in view.
  useEffect(() => { const el = plot.current; if (el) { el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2; el.scrollTop = (el.scrollHeight - el.clientHeight) / 2; } }, [zoom, w]);
  const m = byId.get(sel)!;
  const rels = relationsOf(sel);
  const cx = w / 2, cy = PLOT_H / 2;
  const n = rels.length;
  const ANGLES: Record<number, number[]> = { 1: [0], 2: [180, 0], 3: [-90, 30, 150], 4: [-26, 26, 154, 206] };
  const nodes = rels.map((r, i) => {
    const deg = (ANGLES[n] ?? Array.from({ length: n }, (_, k) => -90 + (360 / n) * k))[i];
    const ang = (deg * Math.PI) / 180;
    const x = Math.max(NW / 2 + 8, Math.min(w - NW / 2 - 8, cx + 0.42 * w * Math.cos(ang)));
    const y = Math.max(NH / 2 + 8, Math.min(PLOT_H - NH / 2 - 8, cy + 0.4 * PLOT_H * Math.sin(ang)));
    return { r, o: byId.get(r.other)!, x, y };
  });
  return (
    <div className="am-stars">
      <div className="am-view-head">
        <h2 className="am-vh">{t("Constellation")} <span>{m.title} and what touches it, one step out</span></h2>
        <p className="am-fine">{t("Only the selected memory and its direct relations are plotted. A line is a link, never a cause, and nothing is scored.")}</p>
      </div>
      <div className="am-plot-bar" role="group" aria-label={t("Plot zoom")}>
        <button type="button" className="am-zoom" aria-label={t("Zoom in (+)")} disabled={zi === ZOOM.length - 1} onClick={() => setZi((z) => Math.min(ZOOM.length - 1, z + 1))}>+</button>
        <button type="button" className="am-zoom" aria-label={t("Zoom out (−)")} disabled={zi === 0} onClick={() => setZi((z) => Math.max(0, z - 1))}>−</button>
        <button type="button" className="am-zoom am-zoom-reset" aria-label={t("Reset view")} disabled={zi === Z0} onClick={() => setZi(Z0)}>{t("Reset")}</button>
        <span className="am-fine am-mono" aria-live="polite">zoom {Math.round(zoom * 100)}%</span>
      </div>
      <div className="am-plot-frame" ref={frame}>
      <div className="am-plot" ref={plot} style={{ height: PLOT_H }} role="group" tabIndex={zoom > 1 ? 0 : undefined} aria-label={`Neighbourhood of ${m.title}: ${n} direct relation${n === 1 ? '' : 's'}`}>
      <div className="am-plot-wrap" style={{ width: Math.max(w, w * zoom), height: Math.max(PLOT_H, PLOT_H * zoom) }}>
      <div className="am-plot-stage" style={{ width: w, height: PLOT_H, transform: `scale(${zoom})`, transformOrigin: '0 0', left: Math.max(0, (w * Math.max(1, zoom) - w * zoom) / 2), top: Math.max(0, (PLOT_H * Math.max(1, zoom) - PLOT_H * zoom) / 2) }}>
        <svg className="am-plot-lines" width={w} height={PLOT_H} viewBox={`0 0 ${w} ${PLOT_H}`} aria-hidden="true">
          {nodes.map(({ r, x, y }, i) => {
            const from: [number, number] = r.type === 'supersedes' && r.dir === 'in' ? [x, y] : [cx, cy];
            const to: [number, number] = r.type === 'supersedes' && r.dir === 'in' ? [cx, cy] : [x, y];
            const [x1, y1] = edge(from[0], from[1], to[0], to[1]);
            const [x2, y2] = edge(to[0], to[1], from[0], from[1], 4);
            const len = Math.hypot(x2 - x1, y2 - y1) || 1; const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
            const lx = x2 - ux * 10, ly = y2 - uy * 10;
            return (
              <g key={i} data-t={r.type}>
                <line x1={x1} y1={y1} x2={r.type === 'supersedes' ? lx : x2} y2={r.type === 'supersedes' ? ly : y2} />
                {r.type === 'supersedes' ? <path className="am-arrow" d={`M${x2} ${y2} L${lx - uy * 4.5} ${ly + ux * 4.5} L${lx + uy * 4.5} ${ly - ux * 4.5}z`} /> : null}
              </g>
            );
          })}
        </svg>
        {nodes.map(({ r, x, y }, i) => {
          const [ax, ay] = edge(cx, cy, x, y); const [bx, by] = edge(x, y, cx, cy);
          return <span key={'w' + i} className="am-rel-word" data-t={r.type} style={{ left: (ax + bx) / 2, top: (ay + by) / 2 }}>{relLabel(r.type)}</span>;
        })}
        <button type="button" className="am-node am-node-center" aria-pressed="true" style={{ left: cx, top: cy, width: NW, height: NH, '--vtn': 'am-n-' + m.id } as React.CSSProperties} onClick={() => select(sel)} aria-label={`${m.title}. ${STATE_LABEL[m.state]}. Selected; the plot shows its direct relations.`}>
          <span className="am-node-top"><Glyph s={m.state} /><span className="am-node-t">{m.title}</span></span>
          <span className="am-node-sub"><span className="am-mono">{m.id}</span> · {STATE_LABEL[m.state]}</span>
        </button>
        {nodes.map(({ r, o, x, y }, i) => (
          <button key={r.other + r.type} type="button" className="am-node" style={{ left: x, top: y, width: NW, height: NH, '--vtn': nodes.findIndex((q) => q.o.id === o.id) === i && o.id !== m.id ? 'am-n-' + o.id : 'none' } as React.CSSProperties} onClick={() => select(o.id)}
            aria-label={t('{title}. {state}. {relation} of {other}. Select to plot its neighbourhood.', { title: o.title, state: STATE_LABEL[o.state], relation: relWords(r), other: m.title })}>
            <span className="am-node-top"><Glyph s={o.state} /><span className="am-node-t">{o.title}</span></span>
            <span className="am-node-sub"><span className="am-mono">{o.id}</span> · {STATE_LABEL[o.state]}</span>
          </button>
        ))}
        {n === 0 ? <p className="am-plot-none">{t("No relation in this sample for this memory. That is not a finding about the memory.")}</p> : null}
      </div>
      </div>
      </div>
      </div>

      <section className="am-rels" aria-label={t("Relations as a list")}>
        <h3>{t("Relations")} <span className="am-tag">{n} direct</span></h3>
        {n === 0 ? <p className="am-none">{t("None recorded in the sample.")}</p> : (
          <ul>
            {rels.map((r: Rel) => { const o = byId.get(r.other)!; return (
              <li key={r.other + r.type}>
                <button type="button" className="am-rel-row" onClick={() => select(o.id)}>
                  <Sample t={r.type} />
                  <span className="am-rel-t">{o.title}</span>
                  <span className="am-rel-w">{relLabel(r.type)}{r.type === 'supersedes' ? ' · ' + (r.dir === 'out' ? t('this replaced it') : t('replaced this')) : ''}</span>
                  <span className="am-mono am-rel-id">{o.id}</span>
                </button>
              </li>
            ); })}
          </ul>
        )}
      </section>
      <ul className="am-legend" aria-label={t("Line styles")}>
        {TYPES.map((t) => <li key={t}><Sample t={t} /><span><b>{relLabel(t)}</b> {REL_NOTE[t]}</span></li>)}
      </ul>
    </div>
  );
}
