// 08-negative · the time map: the whole recorded stretch squeezed into one 20 px
// strip, one cell per day (or per minute for a session), with a pen-coloured frame
// that marks what the chart below is showing. Moving the frame pans the chart.
// Keyboard: the map is a slider (← → move by a step, Shift or PageUp/PageDown by
// a whole view, Home / End to the ends) and two buttons do the same; the pointer
// can click to jump or drag. Presentation only: no data is read or written.
import React, { useId, useRef, useSyncExternalStore } from 'react';
import { panTo, useTimeView, type TimeView } from './timeview';

export interface MapSpec {
  key: string;
  /** Accessible name and short description of what the map covers. */
  label: string;
  cells: number;
  /** Small marks for recorded events, as fractions of the domain; `tall` marks a checkpoint or a write. */
  ticks: { at: number; tall?: boolean }[];
  /** How much was recorded in each cell, 0 to 1: the map's own small bar chart. */
  bars?: number[];
  labels: { at: number; text: string }[];
  /** Where the demo clock is, as a fraction of the domain. */
  now?: number;
  /** Arrow-key step in ms, and the Shift / PageUp step (defaults to the visible span). */
  step: number;
  page?: number;
  unit: string;
  readout: (start: number, span: number) => string;
  jump?: { label: string; start: number };
  init: () => Pick<TimeView, 'start' | 'span' | 'domain'>;
}

// A chart that is only mounted on one view of a lazy page (the Timeline) lends its map to the strip.
let lent: MapSpec | null = null;
const lenders = new Set<() => void>();
export const lendMap = (spec: MapSpec | null) => { lent = spec; lenders.forEach((f) => f()); };
export const useLentMap = () => useSyncExternalStore((cb) => { lenders.add(cb); return () => { lenders.delete(cb); }; }, () => lent, () => null);

const Tri = ({ dir }: { dir: 'l' | 'r' }) => (
  <svg width="7" height="9" viewBox="0 0 7 9" aria-hidden="true"><path d={dir === 'l' ? 'M6 0.5L1 4.5L6 8.5z' : 'M1 0.5L6 4.5L1 8.5z'} fill="currentColor" /></svg>
);

export default function TimeMap({ spec }: { spec: MapSpec }) {
  const v = useTimeView(spec.key, spec.init);
  const id = useId();
  const map = useRef<HTMLDivElement>(null);
  const grab = useRef<number | null>(null);
  const [d0, d1] = v.domain; const len = d1 - d0;
  const cellMs = len / spec.cells;
  const pageMs = spec.page ?? v.span;
  const snap = (ms: number) => d0 + Math.round((ms - d0) / cellMs) * cellMs;
  const fixed = v.span >= len - 1; // the chart already shows everything: nothing to pan
  const atStart = v.start <= d0 + 1, atEnd = v.start >= d1 - v.span - 1;
  const msAt = (clientX: number) => { const r = map.current!.getBoundingClientRect(); return d0 + Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * len; };
  const go = (start: number, by: 'map' | 'drag' = 'map') => { if (!fixed) panTo(spec.key, snap(start), by); };

  const onKey = (e: React.KeyboardEvent) => {
    const big = e.shiftKey;
    const move = (dir: number, size: number) => { e.preventDefault(); go(v.start + dir * size); };
    if (e.key === 'ArrowLeft') move(-1, big ? pageMs : spec.step);
    else if (e.key === 'ArrowRight') move(1, big ? pageMs : spec.step);
    else if (e.key === 'PageUp') move(-1, pageMs);
    else if (e.key === 'PageDown') move(1, pageMs);
    else if (e.key === 'Home') { e.preventDefault(); go(d0); }
    else if (e.key === 'End') { e.preventDefault(); go(d1 - v.span); }
  };
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (fixed || e.button !== 0) return;
    const at = msAt(e.clientX);
    const inside = at >= v.start && at <= v.start + v.span;
    grab.current = inside ? at - v.start : v.span / 2;
    if (!inside) go(at - v.span / 2, 'map');
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => { if (grab.current !== null) go(msAt(e.clientX) - grab.current, 'drag'); };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => { grab.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); };

  const text = spec.readout(v.start, v.span);
  const maxIdx = Math.max(0, Math.round((len - v.span) / cellMs));
  const frame = { left: ((v.start - d0) / len * 100).toFixed(3) + '%', width: (v.span / len * 100).toFixed(3) + '%' };
  return (
    <div className="tm" data-by={v.by} data-fixed={fixed || undefined}>
      <button type="button" className="tm-btn" aria-label={`Show earlier time (one ${spec.unit})`} aria-disabled={fixed || atStart || undefined} data-end={atStart || undefined} onClick={() => go(v.start - spec.step)}><Tri dir="l" /></button>
      <div ref={map} className="tm-map" role="slider" tabIndex={0} aria-label={spec.label} aria-describedby={id}
        aria-valuemin={0} aria-valuemax={maxIdx} aria-valuenow={Math.round((v.start - d0) / cellMs)} aria-valuetext={text} aria-disabled={fixed || undefined} title="Left and right arrow keys move the frame; Shift moves a whole view"
        style={{ backgroundSize: `calc(100% / ${spec.cells}) 100%` }}
        onKeyDown={onKey} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {spec.bars?.map((b, i) => b > 0 ? <span key={'b' + i} className="tm-bar" style={{ left: (i / spec.cells * 100).toFixed(3) + '%', width: (100 / spec.cells).toFixed(3) + '%', height: Math.round(3 + b * 7) }} aria-hidden="true" /> : null)}
        {spec.ticks.map((t, i) => <span key={i} className="tm-tick" data-tall={t.tall || undefined} style={{ left: (t.at * 100).toFixed(3) + '%' }} aria-hidden="true" />)}
        {spec.labels.map((l, i) => <span key={i} className="tm-lab" style={{ left: (l.at * 100).toFixed(3) + '%' }} aria-hidden="true">{l.text}</span>)}
        {spec.now != null ? <span className="tm-now" style={{ left: (spec.now * 100).toFixed(3) + '%' }} aria-hidden="true" /> : null}
        <span className="tm-frame" style={frame} aria-hidden="true" />
      </div>
      <button type="button" className="tm-btn" aria-label={`Show later time (one ${spec.unit})`} aria-disabled={fixed || atEnd || undefined} data-end={atEnd || undefined} onClick={() => go(v.start + spec.step)}><Tri dir="r" /></button>
      <div className="tm-read" aria-hidden="true">{text}</div>
      {spec.jump ? <button type="button" className="tm-jump" onClick={() => go(spec.jump!.start)}>{spec.jump.label}</button> : null}
      <span id={id} className="mem-sr">{fixed ? 'The chart already shows the whole stretch, so there is nothing to move.' : `Left and right arrow keys move the frame by one ${spec.unit}. Hold Shift, or use Page Up and Page Down, to move by a whole view. Home and End go to the ends. The chart below follows the frame.`}</span>
    </div>
  );
}
