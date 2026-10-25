// Star map · the whole generated sample at once (browser demo only, invented data).
// Canvas for the stars; a list view and the side panel for keyboard and screen
// readers. Layouts are computed in a worker (starWorker.ts) and glide into place;
// the record strip's time map replays the year: stars appear when they were formed.
// Nothing is read from a Vault, sent or kept.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { makeStarField, type LinkType, type StarField, type StarState } from './starfield';
import { DRUM, layout as layoutSync, themeCentres, type LayoutId } from './starLayout';
import { lendMap, type MapSpec } from '../../theme/TimeMap';
import { clearViews, panTo, peekView, useTimeView } from '../../theme/timeview';
import { motionReduced } from '../../theme/motion';

const SIZES = [200, 700, 1000, 5000];
const LAYOUTS: { id: LayoutId; name: string; hint: string }[] = [
  { id: 'force', name: 'Force', hint: 'links pull, memories push apart' },
  { id: 'drum', name: 'Time drum', hint: 'one turn is the year; one ring per theme' },
  { id: 'clusters', name: 'Theme clusters', hint: 'one cluster per suggested theme, oldest at the centre' },
];
const STATE: Record<StarState, string> = { adopted: 'Adopted by system', consolidated: 'Consolidated', held: 'Held hypothesis', fading: 'Fading', superseded: 'Superseded', corrected: 'Corrected by you' };
const LINK: Record<LinkType, string> = { source: 'Same conversation', supersedes: 'Supersedes', theme: 'Shared theme · algorithm suggestion' };
const DAY = 86_400_000, MONTH = 30 * DAY, KEY = 'starmap';
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', day: 'numeric', month: 'short', year: 'numeric' });
const fmtMonth = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', month: 'short' });
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/** Draw timings for the performance test (synthetic preview only; read by .design/measure-starmap.mjs). */
const perf = { layoutMs: 0, draws: [] as number[] };
(globalThis as { __starPerf?: typeof perf }).__starPerf = perf;

function mapSpec(f: StarField): MapSpec {
  const [d0, d1] = f.domain; const cells = Math.round((d1 - d0) / DAY);
  const bars = Array.from({ length: cells }, () => 0); f.stars.forEach((s) => { bars[Math.min(cells - 1, Math.floor((s.t - d0) / DAY))]++; });
  const top = Math.max(1, ...bars);
  const labels: MapSpec['labels'] = [];
  for (let m = 0; m < 12; m++) { const at = Date.UTC(2025, 10 + m, 1) - 8 * 3_600_000; labels.push({ at: (at - d0) / (d1 - d0), text: fmtMonth.format(at + 1) }); }
  return {
    key: KEY, label: `Star map replay, ${fmt.format(d0)} to ${fmt.format(d1 - 1)}. The frame's right edge is the moment shown: memories formed after it are hidden.`,
    cells, ticks: [], bars: bars.map((b) => b / top), labels, step: 7 * DAY, page: MONTH, unit: 'day',
    readout: (start, span) => 'formed by ' + fmt.format(start + span - 1),
    jump: { label: 'Whole year', start: d1 - MONTH },
    init: () => ({ start: d1 - MONTH, span: MONTH, domain: f.domain }),
  };
}

type Colors = { paper: string; ink: string; ink2: string; ink3: string; hi: string; minor: string; major: string; pen: string };
const readColors = (): Colors => { const s = getComputedStyle(document.documentElement); const v = (k: string) => s.getPropertyValue(k).trim(); return { paper: v('--paper'), ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'), hi: v('--ink-hi'), minor: v('--grid-minor'), major: v('--grid-major'), pen: v('--pen') }; };

export default function StarMap() {
  const [n, setN] = useState(700);
  const [lay, setLay] = useState<LayoutId>('force');
  const [mode, setMode] = useState<'map' | 'list'>('map');
  const [theme, setTheme] = useState<number | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [doneKey, setDoneKey] = useState('');
  const [layoutMs, setLayoutMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const field = useMemo(() => makeStarField(n, 7), [n]);
  const spec = useMemo(() => mapSpec(field), [field]);
  const view = useTimeView(KEY, spec.init);
  const cutoff = view.start + view.span;

  const canvas = useRef<HTMLCanvasElement>(null);
  const shown = useRef<Float32Array | null>(null);
  const from = useRef<Float32Array | null>(null), to = useRef<Float32Array | null>(null), glide = useRef(0);
  const cam = useRef({ k: 1, x: 0, y: 0 });
  const colors = useRef<Colors | null>(null);
  const hover = useRef<number | null>(null);
  const frame = useRef(0);
  const state = useRef({ field, cutoff, sel, theme, lay, start: view.start });
  state.current = { field, cutoff, sel, theme, lay, start: view.start };

  // The strip's time map belongs to this view while it is open.
  useEffect(() => { lendMap(spec); return () => { lendMap(null); clearViews(KEY); }; }, [spec]);
  useEffect(() => { setSel(null); }, [n]);

  const neighbours = useMemo(() => {
    const adj: { j: number; type: LinkType; dir: 'out' | 'in' | '' }[][] = field.stars.map(() => []);
    for (const l of field.links) { adj[l.a].push({ j: l.b, type: l.type, dir: l.type === 'supersedes' ? 'out' : '' }); adj[l.b].push({ j: l.a, type: l.type, dir: l.type === 'supersedes' ? 'in' : '' }); }
    return adj;
  }, [field]);
  const visible = useCallback((i: number) => { const s = field.stars[i]; return s.t <= cutoff && (theme === null || s.theme === theme); }, [field, cutoff, theme]);

  const draw = useCallback(() => {
    frame.current = 0;
    const c = canvas.current, pos = shown.current; if (!c || !pos) return;
    const t0 = performance.now();
    const g = c.getContext('2d'); if (!g) return;
    const col = colors.current ?? (colors.current = readColors());
    const { field: f, cutoff: cut, sel: s, theme: th, lay: l, start } = state.current;
    const dpr = window.devicePixelRatio || 1; const w = c.width / dpr, h = c.height / dpr; const { k, x: px, y: py } = cam.current;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = col.paper; g.fillRect(0, 0, w, h);
    const X = (i: number) => w / 2 + px + pos[2 * i] * k, Y = (i: number) => h / 2 + py + pos[2 * i + 1] * k;
    const vis = (i: number) => f.stars[i].t <= cut && (th === null || f.stars[i].theme === th);
    // guides: drum rings and months, or theme names
    g.font = '600 12px "Martian Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (l === 'drum') {
      g.strokeStyle = col.minor; g.lineWidth = 1;
      for (let r = 0; r < f.themes.length; r++) { g.beginPath(); g.arc(w / 2 + px, h / 2 + py, (130 + r * 38) * k, 0, Math.PI * 2); g.stroke(); }
      const [d0, d1] = f.domain;
      for (let m = 0; m < 12; m++) {
        const at = Date.UTC(2025, 10 + m, 1) - 8 * 3_600_000; const a = -Math.PI / 2 + (2 * Math.PI * (at - d0)) / (d1 - d0);
        const ci = Math.cos(a), si = Math.sin(a); g.strokeStyle = col.major; g.beginPath(); g.moveTo(w / 2 + px + ci * DRUM.inner * k, h / 2 + py + si * DRUM.inner * k); g.lineTo(w / 2 + px + ci * DRUM.outer * k, h / 2 + py + si * DRUM.outer * k); g.stroke();
        g.fillStyle = col.ink3; g.fillText(fmtMonth.format(at + 1).toUpperCase(), w / 2 + px + ci * (DRUM.outer + 22) * k, h / 2 + py + si * (DRUM.outer + 22) * k);
      }
      const a = -Math.PI / 2 + (2 * Math.PI * (cut - d0)) / (d1 - d0); g.strokeStyle = col.pen; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2 + px, h / 2 + py); g.lineTo(w / 2 + px + Math.cos(a) * DRUM.outer * k, h / 2 + py + Math.sin(a) * DRUM.outer * k); g.stroke();
    } else {
      const sums = f.themes.map(() => [0, 0, 0]);
      for (let i = 0; i < f.n; i++) { const q = sums[f.stars[i].theme]; q[0] += pos[2 * i]; q[1] += pos[2 * i + 1]; q[2]++; }
      const centres = l === 'clusters' ? themeCentres(f) : null;
      g.fillStyle = col.ink3;
      sums.forEach((q, t) => { if (!q[2] || (th !== null && th !== t)) return; const cx = l === 'clusters' ? q[0] / q[2] : q[0] / q[2], cy = q[1] / q[2]; const lift = centres ? 0 : 0; const tx = w / 2 + px + cx * k, ty = h / 2 + py + cy * k - lift; g.lineWidth = 4; g.strokeStyle = col.paper; g.strokeText(f.themes[t].toUpperCase(), tx, ty); g.fillText(f.themes[t].toUpperCase(), tx, ty); });
    }
    // links, batched by type
    const sl = s !== null ? s : -1;
    const batches: [LinkType, string, number[], number][] = [['theme', col.major, [3, 3], 1], ['source', col.ink3, [], 1], ['supersedes', col.ink2, [], 1.2]];
    for (const [type, stroke, dash, lw] of batches) {
      g.strokeStyle = stroke; g.lineWidth = lw; g.setLineDash(dash); g.globalAlpha = sl >= 0 ? 0.35 : 1; g.beginPath();
      for (const ln of f.links) if (ln.type === type && vis(ln.a) && vis(ln.b)) { g.moveTo(X(ln.a), Y(ln.a)); g.lineTo(X(ln.b), Y(ln.b)); }
      g.stroke();
    }
    g.setLineDash([]); g.globalAlpha = 1;
    if (sl >= 0) { g.strokeStyle = col.ink; g.lineWidth = 1.5; g.beginPath(); for (const ln of f.links) if ((ln.a === sl || ln.b === sl) && vis(ln.a) && vis(ln.b)) { g.moveTo(X(ln.a), Y(ln.a)); g.lineTo(X(ln.b), Y(ln.b)); } g.stroke(); }
    // stars: shape carries the state; the pen only marks the selection and "Corrected by you"
    const rad = Math.max(2.2, Math.min(5, 3.2 * Math.sqrt(k)));
    const near = new Set<number>(); if (sl >= 0) for (const ln of f.links) { if (ln.a === sl) near.add(ln.b); if (ln.b === sl) near.add(ln.a); }
    for (let i = 0; i < f.n; i++) {
      if (!vis(i)) continue;
      const st = f.stars[i].state; const x = X(i), y = Y(i); if (x < -10 || y < -10 || x > w + 10 || y > h + 10) continue;
      const dim = sl >= 0 && i !== sl && !near.has(i); const fresh = f.stars[i].t >= start;
      g.globalAlpha = dim ? 0.3 : st === 'fading' ? 0.55 : 1;
      const ink = st === 'corrected' ? col.pen : fresh ? col.hi : near.has(i) ? col.ink : col.ink2;
      g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2);
      if (st === 'held' || st === 'superseded') { g.strokeStyle = st === 'superseded' ? col.ink3 : ink; g.lineWidth = 1; g.stroke(); }
      else { g.fillStyle = ink; g.fill(); }
    }
    g.globalAlpha = 1;
    // labels: the selection, its neighbours and the hovered star, knocked out of the ground
    const taken: [number, number, number, number][] = [];
    const label = (i: number, strong: boolean) => {
      const x = X(i) + rad + 5, y = Y(i); g.font = (strong ? '500 ' : '400 ') + '12px Geist, "Microsoft YaHei UI", sans-serif'; g.textAlign = 'left';
      const bw = g.measureText(f.stars[i].title).width; const box: [number, number, number, number] = [x - 2, y - 9, x + bw + 2, y + 9];
      if (!strong && taken.some((q) => box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1])) return;
      taken.push(box);
      g.lineWidth = 4; g.strokeStyle = col.paper; g.strokeText(f.stars[i].title, x, y); g.fillStyle = strong ? col.ink : col.ink2; g.fillText(f.stars[i].title, x, y);
    };
    if (sl >= 0 && vis(sl)) {
      g.strokeStyle = col.pen; g.lineWidth = 2; g.beginPath(); g.arc(X(sl), Y(sl), rad + 4, 0, Math.PI * 2); g.stroke();
      const x0 = X(sl) + rad + 5; g.font = '500 12px Geist, sans-serif'; taken.push([x0 - 2, Y(sl) - 9, x0 + g.measureText(f.stars[sl].title).width + 2, Y(sl) + 9]);
      let shownLabels = 0; for (const j of near) if (vis(j) && shownLabels++ < 24) label(j, false);
      taken.shift(); label(sl, true);
    }
    if (hover.current !== null && hover.current !== sl && vis(hover.current)) label(hover.current, true);
    const ms = performance.now() - t0; perf.draws.push(ms); if (perf.draws.length > 240) perf.draws.shift();
  }, []);
  const redraw = useCallback(() => { if (!frame.current) frame.current = requestAnimationFrame(draw); }, [draw]);

  // Layout: in a worker when there is one; positions glide from the old layout to the new one.
  useEffect(() => {
    let alive = true; const key = field.n + ':' + lay;
    const accept = (pos: Float32Array, ms: number) => {
      if (!alive) return; perf.layoutMs = ms; setLayoutMs(ms); setDoneKey(key);
      const old = shown.current && shown.current.length === pos.length ? shown.current : null;
      if (!old || motionReduced()) { shown.current = pos; redraw(); return; }
      from.current = old.slice(); to.current = pos; const t0 = performance.now(); const id = ++glide.current;
      const step = () => { if (id !== glide.current) return; const t = Math.min(1, (performance.now() - t0) / 320), e = ease(t); const a = from.current!, b = to.current!, out = new Float32Array(b.length); for (let i = 0; i < b.length; i++) out[i] = a[i] + (b[i] - a[i]) * e; shown.current = out; draw(); if (t < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    };
    if (typeof Worker === 'undefined') { const t0 = performance.now(); const pos = layoutSync(field, lay); accept(pos, performance.now() - t0); return () => { alive = false; }; }
    const wk = new Worker(new URL('./starWorker.ts', import.meta.url), { type: 'module' });
    wk.onmessage = (e: MessageEvent<{ pos: Float32Array; ms: number }>) => { accept(e.data.pos, e.data.ms); wk.terminate(); };
    wk.postMessage({ id: 1, n: field.n, seed: field.seed, layout: lay });
    return () => { alive = false; wk.terminate(); };
  }, [field, lay, draw, redraw]);

  // Size, theme and redraw triggers.
  useEffect(() => {
    const c = canvas.current; if (!c || mode !== 'map') return;
    const fitCam = () => { const r = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr)); if (cam.current.k === 1 && cam.current.x === 0) cam.current.k = Math.min(r.width, r.height) / 1000; redraw(); };
    const ro = new ResizeObserver(fitCam); ro.observe(c); fitCam();
    const mo = new MutationObserver(() => { colors.current = null; redraw(); }); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [mode, redraw]);
  useEffect(() => { redraw(); }, [cutoff, sel, theme, lay, view.start, redraw]);

  // Replay: the frame walks the year; with reduced motion it steps a month at a time.
  useEffect(() => {
    if (!playing) return;
    const [d0, d1] = field.domain; const span = view.span; const reduced = motionReduced();
    if (peekView(KEY)!.start + span >= d1 - DAY) panTo(KEY, d0, 'drag');
    if (reduced) { const id = setInterval(() => { const v = peekView(KEY)!; if (v.start + v.span >= d1 - DAY) { setPlaying(false); return; } panTo(KEY, v.start + MONTH, 'map'); }, 700); return () => clearInterval(id); }
    let raf = 0, last = performance.now(); const perMs = (d1 - d0) / 9000;
    const tick = (now: number) => { const v = peekView(KEY)!; const next = v.start + (now - last) * perMs; last = now; if (next + v.span >= d1) { panTo(KEY, d1 - v.span, 'drag'); setPlaying(false); return; } panTo(KEY, next, 'drag'); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [playing, field, view.span]);

  // Pointer: drag to pan, wheel to zoom at the cursor, click to select.
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const pick = (ev: { clientX: number; clientY: number }) => {
    const c = canvas.current, pos = shown.current; if (!c || !pos) return null;
    const r = c.getBoundingClientRect(); const { k, x: px, y: py } = cam.current; let best = -1, bd = 10 * 10;
    for (let i = 0; i < field.n; i++) { if (!visible(i)) continue; const dx = r.width / 2 + px + pos[2 * i] * k - (ev.clientX - r.left), dy = r.height / 2 + py + pos[2 * i + 1] * k - (ev.clientY - r.top); const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
    return best >= 0 ? best : null;
  };
  const zoom = (factor: number, cx = 0, cy = 0) => { const c = cam.current; const k = Math.max(0.15, Math.min(8, c.k * factor)); const f = k / c.k; c.x = cx - (cx - c.x) * f; c.y = cy - (cy - c.y) * f; c.k = k; redraw(); };
  const reset = () => { const c = canvas.current; if (!c) return; const r = c.getBoundingClientRect(); cam.current = { k: Math.min(r.width, r.height) / 1000, x: 0, y: 0 }; redraw(); };

  const ready = doneKey === field.n + ':' + lay;
  const s = sel !== null ? field.stars[sel] : null;
  const shownCount = useMemo(() => field.stars.filter((x) => visible(x.i)).length, [field, visible]);
  const linkCounts = useMemo(() => { const c = { source: 0, supersedes: 0, theme: 0 }; for (const l of field.links) if (visible(l.a) && visible(l.b)) c[l.type]++; return c; }, [field, visible]);
  const rel = s ? neighbours[s.i] : [];
  const listRows = useMemo(() => field.stars.filter((x) => visible(x.i)).slice().reverse().slice(0, 400), [field, visible]);

  return (
    <div className="sm" data-mode={mode}>
      <div className="sm-main">
        <div className="sm-bar">
          <div className="am-views sm-seg" role="group" aria-label="Star map layout">
            {LAYOUTS.map((l) => <button key={l.id} type="button" className="am-view" aria-pressed={lay === l.id} title={l.hint} onClick={() => setLay(l.id)}>{l.name}</button>)}
          </div>
          <div className="am-views sm-seg" role="group" aria-label="Show as">
            <button type="button" className="am-view" aria-pressed={mode === 'map'} onClick={() => setMode('map')}>Map</button>
            <button type="button" className="am-view" aria-pressed={mode === 'list'} onClick={() => setMode('list')}>List</button>
          </div>
          <button type="button" className="am-back sm-play" aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>{playing ? 'Stop replay' : 'Replay the year'}</button>
          <div className="sm-size" role="group" aria-label="Sample size, for the performance test">
            <span className="am-lbl">Sample</span>
            {SIZES.map((v) => <button key={v} type="button" className="am-chip" aria-pressed={n === v} onClick={() => setN(v)}>{v.toLocaleString('en')}</button>)}
          </div>
        </div>
        <div className="sm-themes" role="group" aria-label="Suggested themes">
          <button type="button" className="am-chip" aria-pressed={theme === null} onClick={() => setTheme(null)}>All themes</button>
          {field.themes.map((t, k) => <button key={t} type="button" className="am-chip" aria-pressed={theme === k} onClick={() => setTheme(theme === k ? null : k)}>{t}</button>)}
        </div>
        {mode === 'map' ? (
          <div className="sm-stage">
            <canvas ref={canvas} className="sm-canvas" tabIndex={0} data-layout-ms={Math.round(layoutMs)} data-ready={ready ? n + ':' + lay : undefined}
              aria-label={`Star map of ${shownCount} generated memories in the ${LAYOUTS.find((l) => l.id === lay)!.name} layout. Use the list view or the panel to choose a memory with the keyboard; arrow keys pan, plus and minus zoom, Escape clears the selection.`}
              onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (d) { const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true; if (d.moved) { cam.current.x += dx; cam.current.y += dy; d.x = e.clientX; d.y = e.clientY; redraw(); } return; }
                const h = pick(e); if (h !== hover.current) { hover.current = h; redraw(); }
              }}
              onPointerUp={(e) => { const d = drag.current; drag.current = null; if (d && !d.moved) setSel(pick(e)); }}
              onPointerLeave={() => { if (hover.current !== null) { hover.current = null; redraw(); } }}
              onWheel={(e) => { const r = e.currentTarget.getBoundingClientRect(); zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2); }}
              onKeyDown={(e) => {
                const m = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[e.key];
                if (m) { e.preventDefault(); cam.current.x += m[0]; cam.current.y += m[1]; redraw(); }
                else if (e.key === '+' || e.key === '=') zoom(1.25); else if (e.key === '-') zoom(0.8); else if (e.key === 'Escape') setSel(null);
              }} />
            <div className="sm-zoom" role="group" aria-label="Zoom">
              <button type="button" className="am-back" aria-label="Zoom in (+)" onClick={() => zoom(1.25)}>+</button>
              <button type="button" className="am-back" aria-label="Zoom out (−)" onClick={() => zoom(0.8)}>−</button>
              <button type="button" className="am-back" onClick={reset}>Reset view</button>
            </div>
            {!ready ? <p className="sm-wait" role="status">Laying out {n.toLocaleString('en')} memories…</p> : null}
          </div>
        ) : (
          <div className="sm-list">
            <p className="am-fine">Newest first · {listRows.length < shownCount ? `first ${listRows.length} of ${shownCount}` : `${shownCount}`} memories formed by {fmt.format(cutoff - 1)}.</p>
            <ol>
              {listRows.map((x) => (
                <li key={x.id}><button type="button" className="sm-row" aria-pressed={sel === x.i} onClick={() => setSel(x.i)}>
                  <span className="am-mono">{fmt.format(x.t)}</span><span className="sm-row-t">{x.title}</span><span className="sm-row-m">{field.themes[x.theme]} · {STATE[x.state]}</span>
                </button></li>
              ))}
            </ol>
          </div>
        )}
        <p className="sm-legend am-fine">
          <span><i className="sm-k sm-k-fill" /> adopted or consolidated</span><span><i className="sm-k sm-k-ring" /> held hypothesis</span><span><i className="sm-k sm-k-pen" /> corrected by you</span>
          <span><i className="sm-l" /> same conversation</span><span><i className="sm-l sm-l-dash" /> shared theme · algorithm suggestion</span><span>Positions mean nothing; dot size is the same for every memory.</span>
        </p>
      </div>
      <aside className="am-inspector sm-panel" aria-label="Star map details" tabIndex={-1}>
        <p className="am-stamp bg-inv">Generated sample · invented memories</p>
        {s ? (
          <>
            <p className="am-mono">{s.id}</p>
            <h2 className="sm-title">{s.title}</h2>
            <dl className="sm-facts">
              <div><dt>State</dt><dd>{STATE[s.state]}</dd></div>
              <div><dt>Kind</dt><dd>{s.kind}</dd></div>
              <div><dt>Theme</dt><dd>{field.themes[s.theme]} <span className="am-fine">model suggestion</span></dd></div>
              <div><dt>Occurred</dt><dd>{fmt.format(s.t)} <span className="am-fine">Asia/Shanghai</span></dd></div>
            </dl>
            {(['source', 'supersedes', 'theme'] as LinkType[]).map((type) => {
              const items = rel.filter((r) => r.type === type); if (!items.length) return null;
              return (
                <section key={type} className="sm-rel">
                  <h3 className="am-lbl">{type === 'supersedes' ? 'Supersedes / superseded by' : LINK[type]} · {items.length}</h3>
                  <ul>{items.slice(0, 12).map((r) => { const o = field.stars[r.j]; return (
                    <li key={r.j + r.type}><button type="button" className="sm-row" onClick={() => setSel(r.j)} disabled={!visible(r.j)}>
                      <span className="sm-row-t">{r.dir === 'out' ? 'replaced by ' : r.dir === 'in' ? 'replaces ' : ''}{o.title}</span><span className="am-mono">{fmt.format(o.t)}</span>
                    </button></li>); })}</ul>
                  {items.length > 12 ? <p className="am-fine">and {items.length - 12} more</p> : null}
                </section>
              );
            })}
            {!rel.length ? <p className="am-fine">No link in this sample. That is not a finding about the memory.</p> : null}
            <button type="button" className="am-back" onClick={() => setSel(null)}>Clear selection</button>
          </>
        ) : (
          <>
            <h2 className="sm-title">The whole sample</h2>
            <dl className="sm-facts">
              <div><dt>Memories</dt><dd>{shownCount.toLocaleString('en')} of {field.n.toLocaleString('en')} shown</dd></div>
              <div><dt>Same conversation</dt><dd>{linkCounts.source.toLocaleString('en')} links</dd></div>
              <div><dt>Supersedes</dt><dd>{linkCounts.supersedes.toLocaleString('en')} links</dd></div>
              <div><dt>Shared theme</dt><dd>{linkCounts.theme.toLocaleString('en')} shown · strongest {field.themeKept.toLocaleString('en')} of {field.themeCandidates.toLocaleString('en')} scored pairs kept</dd></div>
              <div><dt>Formed by</dt><dd>{fmt.format(cutoff - 1)}</dd></div>
              <div><dt>Layout</dt><dd>{ready ? `${Math.round(layoutMs)} ms in a worker` : 'computing…'}</dd></div>
            </dl>
            <p className="am-fine">Choose a star, or a row in the list, to see what it touches. Shared-theme links are co-occurrence: same suggested theme, close in time. They do not say how two memories relate, and a missing line is not a missing relation.</p>
          </>
        )}
      </aside>
    </div>
  );
}
