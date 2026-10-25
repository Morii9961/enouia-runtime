// Star map · three layouts, written here (no graph library). Positions are world
// units: a disc of radius about 450 round the origin, as a Float32Array of x,y pairs.
//   clusters — each suggested theme is a sunflower of its memories, oldest at the centre;
//   drum     — the year is one turn of a recorder drum (angle = time), one ring per theme;
//   force    — links pull, every memory pushes (Barnes–Hut quadtree), themes drift together.
// Positions say nothing about the memories; they are only a way to look.
import type { StarField } from './starfield';

export type LayoutId = 'force' | 'drum' | 'clusters';
const R = 450;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const jitter = (i: number) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

/** Scale so the 98th-percentile radius is R. */
function fit(p: Float32Array) {
  const n = p.length / 2; if (!n) return p;
  let sx = 0, sy = 0; for (let i = 0; i < n; i++) { sx += p[2 * i]; sy += p[2 * i + 1]; }
  sx /= n; sy /= n;
  const rs: number[] = []; for (let i = 0; i < n; i++) { p[2 * i] -= sx; p[2 * i + 1] -= sy; rs.push(Math.hypot(p[2 * i], p[2 * i + 1])); }
  rs.sort((a, b) => a - b); const k = R / Math.max(1, rs[Math.floor(rs.length * 0.98)] ?? 1);
  for (let i = 0; i < p.length; i++) p[i] *= k;
  return p;
}

export function themeCentres(f: StarField) {
  const m = f.themes.length;
  return f.themes.map((_, k) => { const a = -Math.PI / 2 + (2 * Math.PI * k) / m; return [Math.cos(a) * 300, Math.sin(a) * 300] as const; });
}

export function clusters(f: StarField): Float32Array {
  const p = new Float32Array(f.n * 2); const centres = themeCentres(f);
  const groups: number[][] = f.themes.map(() => []); f.stars.forEach((s) => groups[s.theme].push(s.i));
  const most = Math.max(1, ...groups.map((g) => g.length)); const c = 120 / Math.sqrt(most);
  groups.forEach((g, k) => g.forEach((i, j) => { const r = c * Math.sqrt(j + 0.5), a = j * GOLDEN; p[2 * i] = centres[k][0] + r * Math.cos(a); p[2 * i + 1] = centres[k][1] + r * Math.sin(a); }));
  return fit(p);
}

export function drum(f: StarField): Float32Array {
  const p = new Float32Array(f.n * 2); const [d0, d1] = f.domain; const span = d1 - d0;
  f.stars.forEach((s) => { const a = -Math.PI / 2 + (2 * Math.PI * (s.t - d0)) / span; const r = 130 + s.theme * 38 + (jitter(s.i) - 0.5) * 22; p[2 * s.i] = Math.cos(a) * r; p[2 * s.i + 1] = Math.sin(a) * r; });
  return p; // already within R; not refit, so the month ring stays put
}
export const DRUM = { inner: 130 - 14, ring: 38, outer: 130 + 7 * 38 + 14 };

/** Barnes–Hut repulsion over a flat quadtree, rebuilt each step. */
function repel(x: Float32Array, y: Float32Array, fx: Float32Array, fy: Float32Array, n: number, k: number, theta: number) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) { if (x[i] < minX) minX = x[i]; if (x[i] > maxX) maxX = x[i]; if (y[i] < minY) minY = y[i]; if (y[i] > maxY) maxY = y[i]; }
  const size0 = Math.max(maxX - minX, maxY - minY) + 1;
  const cap = n * 4 + 16;
  const ox = new Float64Array(cap), oy = new Float64Array(cap), sz = new Float64Array(cap), mx = new Float64Array(cap), my = new Float64Array(cap), ms = new Float64Array(cap);
  const child = new Int32Array(cap * 4).fill(-1), body = new Int32Array(cap).fill(-1);
  let used = 1; ox[0] = minX; oy[0] = minY; sz[0] = size0;
  const quad = (q: number, i: number) => (x[i] >= ox[q] + sz[q] / 2 ? 1 : 0) + (y[i] >= oy[q] + sz[q] / 2 ? 2 : 0);
  const make = (q: number, c: number) => { const h = sz[q] / 2, id = used++; ox[id] = ox[q] + (c & 1 ? h : 0); oy[id] = oy[q] + (c & 2 ? h : 0); sz[id] = h; child[q * 4 + c] = id; return id; };
  for (let i = 0; i < n; i++) {
    let q = 0, depth = 0;
    for (;;) {
      mx[q] += x[i]; my[q] += y[i]; ms[q] += 1;
      if (body[q] === -1 && ms[q] === 1 && child[q * 4] === -1 && child[q * 4 + 1] === -1 && child[q * 4 + 2] === -1 && child[q * 4 + 3] === -1) { body[q] = i; break; }
      if (body[q] >= 0) { // split: push the resident body down one level
        const j = body[q]; body[q] = -2;
        if (depth > 40 || used + 2 >= cap) break; // coincident points: keep them lumped
        const c = quad(q, j); const t = child[q * 4 + c] === -1 ? make(q, c) : child[q * 4 + c];
        mx[t] += x[j]; my[t] += y[j]; ms[t] += 1; body[t] = j;
      }
      const c = quad(q, i); q = child[q * 4 + c] === -1 ? make(q, c) : child[q * 4 + c]; depth++;
      if (used + 2 >= cap) break;
    }
  }
  const stack = new Int32Array(used + 8);
  for (let i = 0; i < n; i++) {
    let top = 0; stack[top++] = 0;
    while (top) {
      const q = stack[--top]; if (!ms[q]) continue;
      const cx = mx[q] / ms[q], cy = my[q] / ms[q]; let dx = x[i] - cx, dy = y[i] - cy; let d2 = dx * dx + dy * dy;
      const leaf = body[q] >= 0;
      if (leaf && body[q] === i) continue;
      if (leaf || (sz[q] * sz[q]) / (d2 + 1e-6) < theta * theta) {
        if (d2 < 1) { dx = jitter(i) - 0.5; dy = jitter(i + 7) - 0.5; d2 = 1; }
        const f = (k * ms[q]) / d2; fx[i] += dx * f; fy[i] += dy * f;
      } else for (let c = 0; c < 4; c++) { const ch = child[q * 4 + c]; if (ch !== -1) stack[top++] = ch; }
    }
  }
}

export function force(f: StarField, iterations = f.n > 2000 ? 90 : 160): Float32Array {
  const n = f.n; const start = clusters(f);
  const x = new Float32Array(n), y = new Float32Array(n), vx = new Float32Array(n), vy = new Float32Array(n), fx = new Float32Array(n), fy = new Float32Array(n);
  for (let i = 0; i < n; i++) { x[i] = start[2 * i] * 0.6; y[i] = start[2 * i + 1] * 0.6; }
  const centres = themeCentres(f).map(([a, b]) => [a * 0.6, b * 0.6]);
  const K = 30 * Math.sqrt(700 / Math.max(50, n)), REST = 10, SPRING = 0.08, PULL = 0.03, GRAV = 0.001;
  for (let it = 0; it < iterations; it++) {
    const alpha = 1 - it / iterations;
    fx.fill(0); fy.fill(0);
    repel(x, y, fx, fy, n, K, 1.2);
    for (const l of f.links) {
      const dx = x[l.b] - x[l.a], dy = y[l.b] - y[l.a]; const d = Math.hypot(dx, dy) || 1;
      const s = (SPRING * (l.type === 'theme' ? 0.6 : 1) * (d - REST)) / d;
      fx[l.a] += dx * s; fy[l.a] += dy * s; fx[l.b] -= dx * s; fy[l.b] -= dy * s;
    }
    for (let i = 0; i < n; i++) {
      const c = centres[f.stars[i].theme];
      fx[i] += (c[0] - x[i]) * PULL - x[i] * GRAV; fy[i] += (c[1] - y[i]) * PULL - y[i] * GRAV;
      vx[i] = (vx[i] + fx[i] * alpha) * 0.82; vy[i] = (vy[i] + fy[i] * alpha) * 0.82;
      const v = Math.hypot(vx[i], vy[i]); if (v > 30) { vx[i] *= 30 / v; vy[i] *= 30 / v; }
      x[i] += vx[i]; y[i] += vy[i];
    }
  }
  const p = new Float32Array(n * 2); for (let i = 0; i < n; i++) { p[2 * i] = x[i]; p[2 * i + 1] = y[i]; }
  return fit(p);
}

export function layout(f: StarField, id: LayoutId) { return id === 'force' ? force(f) : id === 'drum' ? drum(f) : clusters(f); }
