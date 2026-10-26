// Star map · the whole generated sample at once (browser demo only, invented data).
// Canvas for the stars; a list view and the side panel for keyboard and screen
// readers. The map is live: the force layout settles in front of you (streamed by
// starWorker.ts), a dragged star pulls the stars it links to and they spring back
// when it is let go, and while nothing is touched the field drifts and the theme
// clusters turn slowly. That idle motion means nothing about the memories; Pause
// stops it, it stops while the map is out of sight, and reduced motion turns it off.
// In the time drum the pen stays at twelve o'clock and the year turns under it.
// Nothing is read from a Vault, sent or kept.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { makeStarField, type LinkType, type StarField, type StarState } from './starfield';
import { DRUM, layout as layoutSync, type LayoutId } from './starLayout';
import { lendMap, type MapSpec } from '../../theme/TimeMap';
import { clearViews, panTo, peekView, useTimeView } from '../../theme/timeview';
import { motionReduced } from '../../theme/motion';

import { dateFmt, labels, locale, msg, t, tn, useLang } from '../../i18n/index.ts';
const SIZES = [200, 700, 1000, 5000];
const LAYOUTS: { id: LayoutId; name: string; hint: string }[] = [
  { id: 'force', name: msg('Force'), hint: msg('links pull, memories push apart') },
  { id: 'drum', name: msg('Time drum'), hint: msg('one turn is the year; one ring per theme; the pen stays at the top') },
  { id: 'clusters', name: msg('Theme clusters'), hint: msg('one cluster per suggested theme, oldest at the centre') },
];
const STATE: Record<StarState, string> = labels({ adopted: msg('Adopted by system'), consolidated: msg('Consolidated'), held: msg('Held hypothesis'), fading: msg('Fading'), superseded: msg('Superseded'), corrected: msg('Corrected by you') });
const LINK: Record<LinkType, string> = labels({ source: msg('Same conversation'), supersedes: msg('Supersedes'), theme: msg('Shared theme · algorithm suggestion') });
const DAY = 86_400_000, MONTH = 30 * DAY, KEY = 'starmap', TAU = Math.PI * 2;
// Dates in the interface language, on Asia/Shanghai calendar days.
const fmt = { format: (ms: number) => dateFmt({ timeZone: 'Asia/Shanghai', day: 'numeric', month: 'short', year: 'numeric' }).format(ms) };
const fmtMonth = { format: (ms: number) => dateFmt({ timeZone: 'Asia/Shanghai', month: 'short' }).format(ms) };
const num = (n: number) => n.toLocaleString(locale());
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

// Motion (DESIGN.md §7 · star map). Springs act on each star's offset from its place in the layout.
const KA = 32, KL = 18, DAMP = 11; // pull to its place, pull along a link (× weight), damping; per second
const DRIFT = 2.5, FLOW = 5;       // screen px: each star's own drift, and a slow current through the field
const FLOW_LEN = 520, FLOW_S = 23; // the current's wavelength (world units) and period (seconds)
const CHASE = 9;                   // a new layout closes 1 − e^(−9t) of the gap: about 95% in a third of a second
const TURN_S = 240;                // a theme cluster turns once in about four minutes
const IDLE_MS = 32;                // idle motion on its own draws about 30 frames a second

/** Timings for the performance test (synthetic preview only; read by .design/measure-starmap.mjs). */
const perf = { layoutMs: 0, draws: [] as number[], steps: [] as number[] };
(globalThis as { __starPerf?: typeof perf }).__starPerf = perf;
const keep = (a: number[], v: number) => { a.push(v); if (a.length > 240) a.shift(); };

function mapSpec(f: StarField): MapSpec {
  const [d0, d1] = f.domain; const cells = Math.round((d1 - d0) / DAY);
  const bars = Array.from({ length: cells }, () => 0); f.stars.forEach((s) => { bars[Math.min(cells - 1, Math.floor((s.t - d0) / DAY))]++; });
  const top = Math.max(1, ...bars);
  const labels: MapSpec['labels'] = [];
  for (let m = 0; m < 12; m++) { const at = Date.UTC(2025, 10 + m, 1) - 8 * 3_600_000; labels.push({ at: (at - d0) / (d1 - d0), text: fmtMonth.format(at + 1) }); }
  return {
    key: KEY, label: t('Star map replay, {from} to {to}. The frame’s right edge is the moment shown: memories formed after it are hidden.', { from: fmt.format(d0), to: fmt.format(d1 - 1) }),
    cells, ticks: [], bars: bars.map((b) => b / top), labels, step: 7 * DAY, page: MONTH, unit: msg('day'),
    readout: (start, span) => t('formed by {date}', { date: fmt.format(start + span - 1) }),
    jump: { label: msg('Whole year'), start: d1 - MONTH },
    init: () => ({ start: d1 - MONTH, span: MONTH, domain: f.domain }),
  };
}

type Colors = { paper: string; ink: string; ink2: string; ink3: string; hi: string; minor: string; major: string; pen: string; lab: string; text: string };
const readColors = (): Colors => { const s = getComputedStyle(document.documentElement); const v = (k: string) => s.getPropertyValue(k).trim(); return { paper: v('--paper'), ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'), hi: v('--ink-hi'), minor: v('--grid-minor'), major: v('--grid-major'), pen: v('--pen'), lab: v('--f-lab') || '"Martian Mono", monospace', text: v('--f-text') || 'Geist, sans-serif' }; };
const hash = (i: number) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const wrap = (a: number) => a - TAU * Math.round(a / TAU);
type Cam = { k: number; x: number; y: number };

/** Working arrays for one sample: layout target and anchor, the place after turning, spring offsets, drift. */
function makeSim(f: StarField) {
  const n = f.n, m = f.links.length;
  const la = new Int32Array(m), lb = new Int32Array(m), lw = new Float32Array(m);
  f.links.forEach((l, k) => { la[k] = l.a; lb[k] = l.b; lw[k] = l.type === 'theme' ? 0.5 : 1; });
  const drift = new Float32Array(n * 4); // two angular speeds (rad/s, periods of 6 to 14 s) and two phases
  for (let i = 0; i < n; i++) { drift[4 * i] = 0.45 + hash(i) * 0.6; drift[4 * i + 1] = hash(i + 101) * TAU; drift[4 * i + 2] = 0.45 + hash(i + 7) * 0.6; drift[4 * i + 3] = hash(i + 211) * TAU; }
  return {
    n, la, lb, lw, drift,
    target: null as Float32Array | null, anchor: null as Float32Array | null, centres: new Float32Array(2 * f.themes.length),
    place: new Float32Array(2 * n), d: new Float32Array(2 * n), v: new Float32Array(2 * n), force: new Float32Array(2 * n), shown: new Float32Array(2 * n),
    chasing: false, moving: false,
  };
}
type Sim = ReturnType<typeof makeSim>;

export default function StarMap() {
  const [n, setN] = useState(700);
  const [lay, setLay] = useState<LayoutId>('force');
  const [mode, setMode] = useState<'map' | 'list'>('map');
  const [theme, setTheme] = useState<number | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [doneKey, setDoneKey] = useState('');
  const [firstN, setFirstN] = useState(0);
  const [layoutMs, setLayoutMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const field = useMemo(() => makeStarField(n, 7), [n]);
  const uiLang = useLang();
  const spec = useMemo(() => mapSpec(field), [field, uiLang]); // eslint-disable-line react-hooks/exhaustive-deps
  const view = useTimeView(KEY, spec.init);
  const cutoff = view.start + view.span;

  const canvas = useRef<HTMLCanvasElement>(null);
  const sim = useRef<Sim | null>(null);
  if (!sim.current || sim.current.n !== field.n) sim.current = makeSim(field);
  const cam = useRef<Cam>({ k: 1, x: 0, y: 0 });
  const colors = useRef<Colors | null>(null);
  const hover = useRef<number | null>(null);
  const grab = useRef<{ i: number; x: number; y: number } | null>(null); // world point a dragged star is held at
  const loop = useRef({ raf: 0, last: 0, lastDraw: 0, busy: true, clock: 0, turn0: 0, drum: 0, drumSet: false, seen: true, cam: null as null | { from: Cam; to: Cam; t0: number }, fling: null as null | { vx: number; vy: number } });
  const state = useRef({ field, cutoff, sel, theme, lay, start: view.start, paused });
  state.current = { field, cutoff, sel, theme, lay, start: view.start, paused };

  // The strip's time map belongs to this view while it is open.
  useEffect(() => { lendMap(spec); return () => { lendMap(null); clearViews(KEY); }; }, [spec]);
  useEffect(() => { setSel(null); }, [n]);

  const neighbours = useMemo(() => {
    const adj: { j: number; type: LinkType; dir: 'out' | 'in' | '' }[][] = field.stars.map(() => []);
    for (const l of field.links) { adj[l.a].push({ j: l.b, type: l.type, dir: l.type === 'supersedes' ? 'out' : '' }); adj[l.b].push({ j: l.a, type: l.type, dir: l.type === 'supersedes' ? 'in' : '' }); }
    return adj;
  }, [field]);
  const visible = useCallback((i: number) => { const s = field.stars[i]; return s.t <= cutoff && (theme === null || s.theme === theme); }, [field, cutoff, theme]);

  /** Draws one frame; false when there is no canvas to draw on (the test DOM), so the loop stops. */
  const draw = useCallback((): boolean => {
    const c = canvas.current, S = sim.current; if (!c || !S) return false;
    const g = c.getContext('2d'); if (!g) return false;
    if (!S.anchor) return true;
    const t0 = performance.now();
    const col = colors.current ?? (colors.current = readColors());
    const pos = S.shown; const turn = loop.current.drum;
    const { field: f, cutoff: cut, sel: s, theme: th, lay: l, start } = state.current;
    const dpr = window.devicePixelRatio || 1; const w = c.width / dpr, h = c.height / dpr; const { k, x: px, y: py } = cam.current;
    const cx0 = w / 2 + px, cy0 = h / 2 + py;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = col.paper; g.fillRect(0, 0, w, h);
    const X = (i: number) => cx0 + pos[2 * i] * k, Y = (i: number) => cy0 + pos[2 * i + 1] * k;
    const vis = (i: number) => f.stars[i].t <= cut && (th === null || f.stars[i].theme === th);
    // guides: the drum's rings, months and fixed pen, or the theme names
    g.font = '600 12px ' + col.lab; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (l === 'drum') {
      g.strokeStyle = col.minor; g.lineWidth = 1;
      for (let r = 0; r < f.themes.length; r++) { g.beginPath(); g.arc(cx0, cy0, (130 + r * 38) * k, 0, TAU); g.stroke(); }
      const [d0, d1] = f.domain;
      for (let m = 0; m < 12; m++) {
        const at = Date.UTC(2025, 10 + m, 1) - 8 * 3_600_000; const a = -Math.PI / 2 + (TAU * (at - d0)) / (d1 - d0) + turn;
        const ci = Math.cos(a), si = Math.sin(a); g.strokeStyle = col.major; g.beginPath(); g.moveTo(cx0 + ci * DRUM.inner * k, cy0 + si * DRUM.inner * k); g.lineTo(cx0 + ci * DRUM.outer * k, cy0 + si * DRUM.outer * k); g.stroke();
        g.fillStyle = col.ink3; g.fillText(fmtMonth.format(at + 1).toUpperCase(), cx0 + ci * (DRUM.outer + 22) * k, cy0 + si * (DRUM.outer + 22) * k);
      }
      const a = -Math.PI / 2 + (TAU * (cut - d0)) / (d1 - d0) + turn; const ca = Math.cos(a), sa = Math.sin(a);
      g.strokeStyle = col.pen; g.lineWidth = 2; g.beginPath(); g.moveTo(cx0, cy0); g.lineTo(cx0 + ca * DRUM.outer * k, cy0 + sa * DRUM.outer * k); g.stroke();
      const tip = (DRUM.outer + 6) * k; g.fillStyle = col.pen; g.beginPath(); g.moveTo(cx0 + ca * tip - sa * 5, cy0 + sa * tip + ca * 5); g.lineTo(cx0 + ca * tip + sa * 5, cy0 + sa * tip - ca * 5); g.lineTo(cx0 + ca * (tip - 8), cy0 + sa * (tip - 8)); g.fill();
    } else {
      const sums = f.themes.map(() => [0, 0, 0]);
      for (let i = 0; i < f.n; i++) { const q = sums[f.stars[i].theme]; q[0] += pos[2 * i]; q[1] += pos[2 * i + 1]; q[2]++; }
      g.fillStyle = col.ink3;
      sums.forEach((q, t) => { if (!q[2] || (th !== null && th !== t)) return; const tx = cx0 + (q[0] / q[2]) * k, ty = cy0 + (q[1] / q[2]) * k; g.lineWidth = 4; g.strokeStyle = col.paper; g.strokeText(f.themes[t].toUpperCase(), tx, ty); g.fillText(f.themes[t].toUpperCase(), tx, ty); });
    }
    // links, batched by type
    const sl = s !== null ? s : -1; const hv = hover.current !== null && hover.current !== sl ? hover.current : -1;
    const batches: [LinkType, string, number[], number][] = [['theme', col.major, [3, 3], 1], ['source', col.ink3, [], 1], ['supersedes', col.ink2, [], 1.2]];
    for (const [type, stroke, dash, lw] of batches) {
      g.strokeStyle = stroke; g.lineWidth = lw; g.setLineDash(dash); g.globalAlpha = sl >= 0 ? 0.35 : 1; g.beginPath();
      for (const ln of f.links) if (ln.type === type && vis(ln.a) && vis(ln.b)) { g.moveTo(X(ln.a), Y(ln.a)); g.lineTo(X(ln.b), Y(ln.b)); }
      g.stroke();
    }
    g.setLineDash([]); g.globalAlpha = 1;
    for (const [at, width] of [[hv, 1.2], [sl, 1.5]] as const) {
      if (at < 0) continue;
      g.strokeStyle = col.ink; g.lineWidth = width; g.beginPath();
      for (const ln of f.links) if ((ln.a === at || ln.b === at) && vis(ln.a) && vis(ln.b)) { g.moveTo(X(ln.a), Y(ln.a)); g.lineTo(X(ln.b), Y(ln.b)); }
      g.stroke();
    }
    // stars: shape carries the state; the pen only marks the selection and "Corrected by you"
    const rad = Math.max(2.2, Math.min(5, 3.2 * Math.sqrt(k)));
    const near = new Set<number>(); if (sl >= 0) for (const ln of f.links) { if (ln.a === sl) near.add(ln.b); if (ln.b === sl) near.add(ln.a); }
    for (let i = 0; i < f.n; i++) {
      if (!vis(i)) continue;
      const st = f.stars[i].state; const x = X(i), y = Y(i); if (x < -10 || y < -10 || x > w + 10 || y > h + 10) continue;
      const dim = sl >= 0 && i !== sl && !near.has(i); const fresh = f.stars[i].t >= start;
      g.globalAlpha = dim ? 0.3 : st === 'fading' ? 0.55 : 1;
      const ink = st === 'corrected' ? col.pen : fresh ? col.hi : near.has(i) || i === hv ? col.ink : col.ink2;
      g.beginPath(); g.arc(x, y, rad, 0, TAU);
      if (st === 'held' || st === 'superseded') { g.strokeStyle = st === 'superseded' ? col.ink3 : ink; g.lineWidth = 1; g.stroke(); }
      else { g.fillStyle = ink; g.fill(); }
    }
    g.globalAlpha = 1;
    // labels: the selection, its neighbours and the hovered star, knocked out of the ground
    const taken: [number, number, number, number][] = [];
    const label = (i: number, strong: boolean) => {
      const x = X(i) + rad + 5, y = Y(i); g.font = (strong ? '500 ' : '400 ') + '12px ' + col.text; g.textAlign = 'left';
      const bw = g.measureText(f.stars[i].title).width; const box: [number, number, number, number] = [x - 2, y - 9, x + bw + 2, y + 9];
      if (!strong && taken.some((q) => box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1])) return;
      taken.push(box);
      g.lineWidth = 4; g.strokeStyle = col.paper; g.strokeText(f.stars[i].title, x, y); g.fillStyle = strong ? col.ink : col.ink2; g.fillText(f.stars[i].title, x, y);
    };
    if (sl >= 0 && vis(sl)) {
      g.strokeStyle = col.pen; g.lineWidth = 2; g.beginPath(); g.arc(X(sl), Y(sl), rad + 4, 0, TAU); g.stroke();
      const x0 = X(sl) + rad + 5; g.font = '500 12px ' + col.text; taken.push([x0 - 2, Y(sl) - 9, x0 + g.measureText(f.stars[sl].title).width + 2, Y(sl) + 9]);
      let shownLabels = 0; for (const j of near) if (vis(j) && shownLabels++ < 24) label(j, false);
      taken.shift(); label(sl, true);
    }
    if (hv >= 0 && vis(hv)) label(hv, true);
    keep(perf.draws, performance.now() - t0);
    return true;
  }, []);

  // One frame: layouts close in on their target, the drum and the clusters turn, the springs
  // move, the camera eases, then the map is drawn. It keeps going only while something moves.
  const tick = useCallback((now: number) => {
    const L = loop.current; L.raf = 0;
    const S = sim.current; const st = state.current; const f = st.field;
    if (!S || S.n !== f.n || !canvas.current) return;
    const reduced = motionReduced();
    const idle = !st.paused && !reduced && L.seen && !document.hidden;
    if (!L.busy && idle && now - L.lastDraw < IDLE_MS) { L.raf = requestAnimationFrame(tick); return; }
    const dt = Math.min(1 / 30, Math.max(0, (now - L.last) / 1000)); L.last = now;
    if (idle) L.clock += dt;
    const t0 = performance.now();
    const { anchor, target, place, d, v, force: fo, shown } = S;
    if (anchor && target && S.chasing) {
      if (reduced) { anchor.set(target); S.chasing = false; }
      else { const a = 1 - Math.exp(-CHASE * dt); let err = 0; for (let i = 0; i < anchor.length; i++) { const e = target[i] - anchor[i]; anchor[i] += e * a; if (Math.abs(e) > err) err = Math.abs(e); } if (err < 0.05) { anchor.set(target); S.chasing = false; } }
    }
    let turning = false;
    if (anchor) {
      if (st.lay === 'drum') {
        const [d0, d1] = f.domain; const want = -TAU * (st.cutoff - d0) / (d1 - d0); const gap = wrap(want - L.drum);
        // small steps (a replay) follow the frame exactly; a jump turns the drum over a moment
        if (reduced || !L.drumSet || Math.abs(gap) < 0.15) { L.drum += gap; L.drumSet = true; } else { L.drum += gap * (1 - Math.exp(-6 * dt)); turning = true; }
        const c = Math.cos(L.drum), s = Math.sin(L.drum);
        for (let i = 0; i < S.n; i++) { const x = anchor[2 * i], y = anchor[2 * i + 1]; place[2 * i] = c * x - s * y; place[2 * i + 1] = s * x + c * y; }
      } else if (st.lay === 'clusters') {
        const age = L.clock - L.turn0;
        for (let i = 0; i < S.n; i++) {
          const t = f.stars[i].theme; const a = (t % 2 ? -1 : 1) * TAU * age / (TURN_S * (1 + 0.12 * t)); const c = Math.cos(a), s = Math.sin(a);
          const ox = S.centres[2 * t], oy = S.centres[2 * t + 1]; const x = anchor[2 * i] - ox, y = anchor[2 * i + 1] - oy;
          place[2 * i] = ox + c * x - s * y; place[2 * i + 1] = oy + s * x + c * y;
        }
      } else place.set(anchor);
    }
    const held = grab.current;
    if (reduced) { d.fill(0); v.fill(0); S.moving = false; }
    else if (idle || S.moving || held) {
      const A = idle ? DRIFT / cam.current.k : 0, B = idle ? FLOW / cam.current.k : 0, t = L.clock;
      const wf = TAU / FLOW_S, kf = TAU / FLOW_LEN, dr = S.drift;
      for (let i = 0; i < S.n; i++) {
        let tx = 0, ty = 0;
        if (A) { const q = 4 * i; tx = A * Math.sin(dr[q] * t + dr[q + 1]) + B * Math.sin(kf * place[2 * i + 1] + wf * t); ty = A * Math.sin(dr[q + 2] * t + dr[q + 3]) + B * Math.cos(kf * 0.8 * place[2 * i] + wf * 0.83 * t); }
        fo[2 * i] = KA * (tx - d[2 * i]) - DAMP * v[2 * i]; fo[2 * i + 1] = KA * (ty - d[2 * i + 1]) - DAMP * v[2 * i + 1];
      }
      for (let j = 0; j < S.la.length; j++) { const a = S.la[j], b = S.lb[j], w = KL * S.lw[j]; const ex = (d[2 * b] - d[2 * a]) * w, ey = (d[2 * b + 1] - d[2 * a + 1]) * w; fo[2 * a] += ex; fo[2 * a + 1] += ey; fo[2 * b] -= ex; fo[2 * b + 1] -= ey; }
      let most = 0;
      for (let i = 0; i < 2 * S.n; i++) { v[i] += fo[i] * dt; d[i] += v[i] * dt; const m = Math.abs(v[i]) + Math.abs(d[i]); if (m > most) most = m; }
      S.moving = !idle && most > 0.02;
      if (!S.moving && !idle && !held) { d.fill(0); v.fill(0); }
    }
    if (held) { d[2 * held.i] = held.x - place[2 * held.i]; d[2 * held.i + 1] = held.y - place[2 * held.i + 1]; v[2 * held.i] = 0; v[2 * held.i + 1] = 0; }
    for (let i = 0; i < 2 * S.n; i++) shown[i] = place[i] + d[i];
    keep(perf.steps, performance.now() - t0);
    if (L.cam) {
      const p = Math.min(1, (now - L.cam.t0) / 320), e = ease(p), { from, to } = L.cam;
      cam.current = { k: from.k + (to.k - from.k) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e }; if (p >= 1) L.cam = null;
    }
    if (L.fling) {
      const ms = dt * 1000; cam.current.x += L.fling.vx * ms; cam.current.y += L.fling.vy * ms; const fade = Math.exp(-ms / 220); L.fling.vx *= fade; L.fling.vy *= fade;
      if (Math.hypot(L.fling.vx, L.fling.vy) < 0.02) L.fling = null;
    }
    if (!draw()) return;
    L.lastDraw = now;
    L.busy = S.chasing || S.moving || held !== null || L.cam !== null || L.fling !== null || turning;
    if (L.busy || idle) L.raf = requestAnimationFrame(tick);
  }, [draw]);
  const kick = useCallback(() => { const L = loop.current; if (!L.raf) { L.last = performance.now(); L.busy = true; L.raf = requestAnimationFrame(tick); } }, [tick]);
  useEffect(() => () => { cancelAnimationFrame(loop.current.raf); loop.current.raf = 0; }, []);

  // Layout: in a worker when there is one. A change of layout starts from where the stars are now.
  useEffect(() => {
    let alive = true; const key = field.n + ':' + lay; const S = sim.current!; const L = loop.current; const reduced = motionReduced();
    if (S.anchor) {
      // carry the old layout's turn into the anchor, so nothing jumps when the turning stops or starts
      if (lay === 'drum') {
        const [d0, d1] = field.domain; L.drum = -TAU * (state.current.cutoff - d0) / (d1 - d0); L.drumSet = true;
        const c = Math.cos(-L.drum), s = Math.sin(-L.drum); for (let i = 0; i < S.n; i++) { const x = S.place[2 * i], y = S.place[2 * i + 1]; S.anchor[2 * i] = c * x - s * y; S.anchor[2 * i + 1] = s * x + c * y; }
      } else S.anchor.set(S.place);
    }
    if (lay === 'clusters') L.turn0 = L.clock;
    const accept = (pos: Float32Array, ms: number, done: boolean) => {
      if (!alive) return;
      if (done) { perf.layoutMs = ms; setLayoutMs(ms); setDoneKey(key); }
      S.target = pos; S.centres.fill(0);
      const count = new Float32Array(field.themes.length);
      for (let i = 0; i < S.n; i++) { const t = field.stars[i].theme; S.centres[2 * t] += pos[2 * i]; S.centres[2 * t + 1] += pos[2 * i + 1]; count[t]++; }
      for (let t = 0; t < count.length; t++) if (count[t]) { S.centres[2 * t] /= count[t]; S.centres[2 * t + 1] /= count[t]; }
      if (!S.anchor) { S.anchor = reduced ? pos.slice() : pos.map((x) => x * 0.15); setFirstN(field.n); } // the first layout opens out from the middle
      S.chasing = true; kick();
    };
    if (typeof Worker === 'undefined') { const t0 = performance.now(); const pos = layoutSync(field, lay); accept(pos, performance.now() - t0, true); return () => { alive = false; }; }
    const wk = new Worker(new URL('./starWorker.ts', import.meta.url), { type: 'module' });
    wk.onmessage = (e: MessageEvent<{ pos: Float32Array; ms: number; done: boolean }>) => { accept(e.data.pos, e.data.ms, e.data.done); if (e.data.done) wk.terminate(); };
    const start = lay === 'force' && S.anchor ? S.place.slice() : undefined;
    wk.postMessage({ id: 1, n: field.n, seed: field.seed, layout: lay, start, stream: !reduced }, start ? [start.buffer] : []);
    return () => { alive = false; wk.terminate(); };
  }, [field, lay, kick]);

  // Size, theme, visibility and the triggers that wake the frame loop.
  useEffect(() => {
    const c = canvas.current; if (!c || mode !== 'map') return;
    const L = loop.current;
    const fitCam = () => { const r = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr)); if (cam.current.k === 1 && cam.current.x === 0) cam.current.k = Math.min(r.width, r.height) / 1000; draw(); kick(); };
    const ro = new ResizeObserver(fitCam); ro.observe(c); fitCam();
    const mo = new MutationObserver(() => { colors.current = null; kick(); }); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'lang'] });
    const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([e]) => { L.seen = e.isIntersecting; if (L.seen) kick(); });
    io?.observe(c);
    const onShow = () => { if (!document.hidden) kick(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { ro.disconnect(); mo.disconnect(); io?.disconnect(); document.removeEventListener('visibilitychange', onShow); L.seen = true; };
  }, [mode, draw, kick]);
  useEffect(() => { kick(); }, [cutoff, sel, theme, lay, view.start, paused, kick]);

  // Replay: the frame walks the year; with reduced motion it steps a month at a time.
  useEffect(() => {
    if (!playing) return;
    const [d0, d1] = field.domain; const span = view.span; const reduced = motionReduced();
    if (peekView(KEY)!.start + span >= d1 - DAY) panTo(KEY, d0, 'drag');
    if (reduced) { const id = setInterval(() => { const v = peekView(KEY)!; if (v.start + v.span >= d1 - DAY) { setPlaying(false); return; } panTo(KEY, v.start + MONTH, 'map'); }, 700); return () => clearInterval(id); }
    let raf = 0, last = performance.now(); const perMs = (d1 - d0) / 9000;
    const step = (now: number) => { const v = peekView(KEY)!; const next = v.start + (now - last) * perMs; last = now; if (next + v.span >= d1) { panTo(KEY, d1 - v.span, 'drag'); setPlaying(false); return; } panTo(KEY, next, 'drag'); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [playing, field, view.span]);

  // Pointer: drag a star and its links follow; drag the ground to pan (it coasts a little);
  // wheel to zoom at the cursor; click to select; double-click to bring a star close.
  const drag = useRef<{ x: number; y: number; moved: boolean; star: number | null; ox: number; oy: number; vx: number; vy: number; t: number } | null>(null);
  const toWorld = (ev: { clientX: number; clientY: number }) => { const r = canvas.current!.getBoundingClientRect(); const { k, x, y } = cam.current; return { x: (ev.clientX - r.left - r.width / 2 - x) / k, y: (ev.clientY - r.top - r.height / 2 - y) / k }; };
  const pick = (ev: { clientX: number; clientY: number }) => {
    const c = canvas.current, S = sim.current; if (!c || !S || !S.anchor) return null;
    const r = c.getBoundingClientRect(); const { k, x: px, y: py } = cam.current; const pos = S.shown; let best = -1, bd = 10 * 10;
    for (let i = 0; i < field.n; i++) { if (!visible(i)) continue; const dx = r.width / 2 + px + pos[2 * i] * k - (ev.clientX - r.left), dy = r.height / 2 + py + pos[2 * i + 1] * k - (ev.clientY - r.top); const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
    return best >= 0 ? best : null;
  };
  const camTo = (to: Cam) => { const L = loop.current; L.fling = null; if (motionReduced()) { cam.current = to; L.cam = null; } else L.cam = { from: { ...cam.current }, to, t0: performance.now() }; kick(); };
  const zoom = (factor: number, cx = 0, cy = 0, glide = false) => {
    const c = cam.current; const k = Math.max(0.15, Math.min(8, c.k * factor)); const f = k / c.k; const to = { k, x: cx - (cx - c.x) * f, y: cy - (cy - c.y) * f };
    if (glide) camTo(to); else { cam.current = to; kick(); }
  };
  const reset = () => { const c = canvas.current; if (!c) return; const r = c.getBoundingClientRect(); camTo({ k: Math.min(r.width, r.height) / 1000, x: 0, y: 0 }); };
  /** Bring a star chosen in the panel into view when it is near the edge or outside. */
  const reveal = (i: number) => {
    const c = canvas.current, S = sim.current; if (!c || !S || mode !== 'map') return;
    const r = c.getBoundingClientRect(); const { k, x, y } = cam.current; const sx = r.width / 2 + x + S.shown[2 * i] * k, sy = r.height / 2 + y + S.shown[2 * i + 1] * k;
    if (sx < r.width * 0.15 || sx > r.width * 0.85 || sy < r.height * 0.15 || sy > r.height * 0.85) camTo({ k, x: -S.shown[2 * i] * k, y: -S.shown[2 * i + 1] * k });
  };
  const choose = (i: number) => { setSel(i); reveal(i); };
  const release = (e: React.PointerEvent<HTMLCanvasElement>, click: boolean) => {
    const d = drag.current; drag.current = null; const L = loop.current; if (!d) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    e.currentTarget.style.cursor = '';
    if (!d.moved) { if (click) setSel(pick(e)); return; }
    if (d.star !== null) { grab.current = null; hover.current = null; if (sim.current) sim.current.moving = true; kick(); return; }
    if (!motionReduced() && Math.hypot(d.vx, d.vy) > 0.05 && performance.now() - d.t < 80) { L.fling = { vx: d.vx, vy: d.vy }; kick(); }
  };

  const ready = doneKey === field.n + ':' + lay;
  const reducedNow = motionReduced();
  const s = sel !== null ? field.stars[sel] : null;
  const shownCount = useMemo(() => field.stars.filter((x) => visible(x.i)).length, [field, visible]);
  const linkCounts = useMemo(() => { const c = { source: 0, supersedes: 0, theme: 0 }; for (const l of field.links) if (visible(l.a) && visible(l.b)) c[l.type]++; return c; }, [field, visible]);
  const rel = s ? neighbours[s.i] : [];
  const listRows = useMemo(() => field.stars.filter((x) => visible(x.i)).slice().reverse().slice(0, 400), [field, visible]);

  return (
    <div className="sm" data-mode={mode}>
      <div className="sm-main">
        <div className="sm-bar">
          <div className="am-views sm-seg" role="group" aria-label={t("Star map layout")}>
            {LAYOUTS.map((l) => <button key={l.id} type="button" className="am-view" aria-pressed={lay === l.id} title={t(l.hint)} onClick={() => setLay(l.id)}>{t(l.name)}</button>)}
          </div>
          <div className="am-views sm-seg" role="group" aria-label={t("Show as")}>
            <button type="button" className="am-view" aria-pressed={mode === 'map'} onClick={() => setMode('map')}>{t("Map")}</button>
            <button type="button" className="am-view" aria-pressed={mode === 'list'} onClick={() => setMode('list')}>{t("List")}</button>
          </div>
          <button type="button" className="am-back sm-play" aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>{playing ? t('Stop replay') : t('Replay the year')}</button>
          {mode === 'map' ? (
            <button type="button" className="am-back sm-still" aria-pressed={paused || reducedNow} disabled={reducedNow}
              title={reducedNow ? t('Reduced motion is on, so the map holds still') : t('The drift and the turning clusters are decoration; this stops them')}
              onClick={() => setPaused((p) => !p)}>{reducedNow ? t('Motion off') : paused ? t('Resume motion') : t('Pause motion')}</button>
          ) : null}
          <div className="sm-size" role="group" aria-label={t("Sample size, for the performance test")}>
            <span className="am-lbl">{t("Sample")}</span>
            {SIZES.map((v) => <button key={v} type="button" className="am-chip" aria-pressed={n === v} onClick={() => setN(v)}>{num(v)}</button>)}
          </div>
        </div>
        <div className="sm-themes" role="group" aria-label={t("Suggested themes")}>
          <button type="button" className="am-chip" aria-pressed={theme === null} onClick={() => setTheme(null)}>{t("All themes")}</button>
          {field.themes.map((t, k) => <button key={t} type="button" className="am-chip" aria-pressed={theme === k} onClick={() => setTheme(theme === k ? null : k)}>{t}</button>)}
        </div>
        {mode === 'map' ? (
          <div className="sm-stage">
            <canvas ref={canvas} className="sm-canvas" tabIndex={0} data-layout-ms={Math.round(layoutMs)} data-ready={ready ? n + ':' + lay : undefined} data-still={paused || reducedNow || undefined}
              aria-label={t('Star map of {n} generated memories in the {layout} layout. Use the list view or the panel to choose a memory with the keyboard; arrow keys pan, plus and minus zoom, Escape clears the selection. With a pointer, drag a star to pull the stars it links to.', { n: num(shownCount), layout: t(LAYOUTS.find((l) => l.id === lay)!.name) })}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                const h = pick(e), S = sim.current; let ox = 0, oy = 0;
                if (h !== null && S) { const w = toWorld(e); ox = S.shown[2 * h] - w.x; oy = S.shown[2 * h + 1] - w.y; }
                drag.current = { x: e.clientX, y: e.clientY, moved: false, star: h, ox, oy, vx: 0, vy: 0, t: performance.now() };
                loop.current.cam = null; loop.current.fling = null; e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (d) {
                  const dx = e.clientX - d.x, dy = e.clientY - d.y;
                  if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) { d.moved = true; e.currentTarget.style.cursor = 'grabbing'; }
                  if (!d.moved) return;
                  if (d.star !== null) { const w = toWorld(e); grab.current = { i: d.star, x: w.x + d.ox, y: w.y + d.oy }; hover.current = d.star; }
                  else { cam.current.x += dx; cam.current.y += dy; const now = performance.now(), ms = Math.max(1, now - d.t); d.vx = 0.6 * (dx / ms) + 0.4 * d.vx; d.vy = 0.6 * (dy / ms) + 0.4 * d.vy; d.t = now; }
                  d.x = e.clientX; d.y = e.clientY; kick(); return;
                }
                const h = pick(e); e.currentTarget.style.cursor = h !== null ? 'pointer' : '';
                if (h !== hover.current) { hover.current = h; kick(); }
              }}
              onPointerUp={(e) => release(e, true)}
              onPointerCancel={(e) => release(e, false)}
              onPointerLeave={() => { if (hover.current !== null && !drag.current) { hover.current = null; kick(); } }}
              onDoubleClick={(e) => {
                const h = pick(e), S = sim.current, r = e.currentTarget.getBoundingClientRect();
                if (h !== null && S) { const k = Math.min(8, cam.current.k * 1.8); camTo({ k, x: -S.shown[2 * h] * k, y: -S.shown[2 * h + 1] * k }); }
                else zoom(1.6, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2, true);
              }}
              onWheel={(e) => { const r = e.currentTarget.getBoundingClientRect(); zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2); }}
              onKeyDown={(e) => {
                const m = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[e.key];
                if (m) { e.preventDefault(); cam.current.x += m[0]; cam.current.y += m[1]; kick(); }
                else if (e.key === '+' || e.key === '=') zoom(1.25, 0, 0, true); else if (e.key === '-') zoom(0.8, 0, 0, true); else if (e.key === 'Escape') setSel(null);
              }} />
            <div className="sm-zoom" role="group" aria-label={t("Zoom")}>
              <button type="button" className="am-back" aria-label={t("Zoom in (+)")} onClick={() => zoom(1.25, 0, 0, true)}>+</button>
              <button type="button" className="am-back" aria-label={t("Zoom out (−)")} onClick={() => zoom(0.8, 0, 0, true)}>−</button>
              <button type="button" className="am-back" onClick={reset}>{t("Reset view")}</button>
            </div>
            {firstN !== n ? <p className="sm-wait" role="status">{t('Laying out {n} memories…', { n: num(n) })}</p> : null}
          </div>
        ) : (
          <div className="sm-list">
            <p className="am-fine">{listRows.length < shownCount ? t('Newest first · first {shown} of {n} memories formed by {date}.', { shown: num(listRows.length), n: num(shownCount), date: fmt.format(cutoff - 1) }) : t('Newest first · {n} memories formed by {date}.', { n: num(shownCount), date: fmt.format(cutoff - 1) })}</p>
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
          <span><i className="sm-k sm-k-fill" /> {t("adopted or consolidated")}</span><span><i className="sm-k sm-k-ring" /> {t("held hypothesis")}</span><span><i className="sm-k sm-k-pen" /> {t("corrected by you")}</span>
          <span><i className="sm-l" /> {t("same conversation")}</span><span><i className="sm-l sm-l-dash" /> {t("shared theme · algorithm suggestion")}</span><span>{t('Positions and drift mean nothing; dot size is the same for every memory.')}</span>
        </p>
      </div>
      <aside className="am-inspector sm-panel" aria-label={t("Star map details")} tabIndex={-1}>
        <p className="am-stamp bg-inv">{t("Generated sample · invented memories")}</p>
        {s ? (
          <>
            <p className="am-mono">{s.id}</p>
            <h2 className="sm-title">{s.title}</h2>
            <dl className="sm-facts">
              <div><dt>{t("State")}</dt><dd>{STATE[s.state]}</dd></div>
              <div><dt>{t("Kind")}</dt><dd>{s.kind}</dd></div>
              <div><dt>{t("Theme")}</dt><dd>{field.themes[s.theme]} <span className="am-fine">{t("model suggestion")}</span></dd></div>
              <div><dt>{t("Occurred")}</dt><dd>{fmt.format(s.t)} <span className="am-fine">{t("Asia/Shanghai")}</span></dd></div>
            </dl>
            {(['source', 'supersedes', 'theme'] as LinkType[]).map((type) => {
              const items = rel.filter((r) => r.type === type); if (!items.length) return null;
              return (
                <section key={type} className="sm-rel">
                  <h3 className="am-lbl">{type === 'supersedes' ? t('Supersedes / superseded by') : LINK[type]} · {items.length}</h3>
                  <ul>{items.slice(0, 12).map((r) => { const o = field.stars[r.j]; return (
                    <li key={r.j + r.type}><button type="button" className="sm-row" onClick={() => choose(r.j)} disabled={!visible(r.j)}>
                      <span className="sm-row-t">{r.dir === 'out' ? t('replaced by') + ' ' : r.dir === 'in' ? t('replaces') + ' ' : ''}{o.title}</span><span className="am-mono">{fmt.format(o.t)}</span>
                    </button></li>); })}</ul>
                  {items.length > 12 ? <p className="am-fine">{t('and {n} more', { n: items.length - 12 })}</p> : null}
                </section>
              );
            })}
            {!rel.length ? <p className="am-fine">{t("No link in this sample. That is not a finding about the memory.")}</p> : null}
            <button type="button" className="am-back" onClick={() => setSel(null)}>{t("Clear selection")}</button>
          </>
        ) : (
          <>
            <h2 className="sm-title">{t("The whole sample")}</h2>
            <dl className="sm-facts">
              <div><dt>{t("Memories")}</dt><dd>{t('{shown} of {n} shown', { shown: num(shownCount), n: num(field.n) })}</dd></div>
              <div><dt>{t("Same conversation")}</dt><dd>{tn(linkCounts.source, '{n} link', '{n} links')}</dd></div>
              <div><dt>{t("Supersedes")}</dt><dd>{tn(linkCounts.supersedes, '{n} link', '{n} links')}</dd></div>
              <div><dt>{t("Shared theme")}</dt><dd>{t('{n} shown · strongest {kept} of {all} scored pairs kept', { n: num(linkCounts.theme), kept: num(field.themeKept), all: num(field.themeCandidates) })}</dd></div>
              <div><dt>{t("Formed by")}</dt><dd>{fmt.format(cutoff - 1)}</dd></div>
              <div><dt>{t("Layout")}</dt><dd>{ready ? t('{ms} ms of work in a worker', { ms: Math.round(layoutMs) }) : t('settling…')}</dd></div>
            </dl>
            <p className="am-fine">Choose a star, or a row in the list, to see what it touches. Drag a star to pull the stars it links to; let go and they return. Shared-theme links are co-occurrence: same suggested theme, close in time. They do not say how two memories relate, and a missing line is not a missing relation.</p>
          </>
        )}
      </aside>
    </div>
  );
}
