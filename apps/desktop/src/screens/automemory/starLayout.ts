// Star map · four layouts, written here (no graph library). Positions are world
// units: a disc of radius about 450 round the origin, as a Float32Array of x,y pairs.
//   sphere   — a ball in three dimensions, newest at the centre; the page turns it and draws it
//              in perspective, so it is the one layout whose positions come from ball() + project();
//   clusters — each suggested theme is a sunflower of its memories, oldest at the centre;
//   drum     — the year is one turn of a recorder drum (angle = time), one ring per theme;
//   force    — a galaxy: each theme is an arm of a logarithmic spiral and a memory lies further
//              out the older it is, so the newest are in the bright core; then links pull and
//              every memory pushes (Barnes–Hut quadtree), which knots linked memories along the arms.
// Apart from the galaxy's distance-is-age, positions say nothing about the memories.
import type { StarField } from './starfield';

export type LayoutId = 'sphere' | 'force' | 'drum' | 'clusters';
const R = 450;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const jitter = (i: number) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
/** A standard normal number that is the same for the same i. */
const gauss = (i: number) => Math.sqrt(-2 * Math.log(Math.max(1e-6, jitter(i)))) * Math.cos(2 * Math.PI * jitter(i + 0.37));

/** The galaxy: the core's radius, and how far an arm winds per e-fold of distance (radians). */
export const GALAXY = { core: 40, wind: 1.15 };
/** Distance from the centre for an age between 0 (now) and 1 (the oldest the sample holds). */
export const galaxyRadius = (age: number) => GALAXY.core + (R - GALAXY.core) * Math.pow(Math.max(0, Math.min(1, age)), 0.85);

/**
 * Where the force layout settles towards. Radius follows age, so area grows faster than the
 * count and the field thins from a dense core to a sparse halo, as a real one does; the arms
 * blur together near the core and fray as they go out. Already in world units, not refit.
 */
export function galaxy(f: StarField): Float32Array {
  const p = new Float32Array(f.n * 2); const [, d1] = f.domain; const span = f.domain[1] - f.domain[0]; const m = f.themes.length;
  f.stars.forEach((s) => {
    const r = galaxyRadius((d1 - s.t) / span) * (1 + 0.04 * gauss(s.i * 3 + 1));
    const spread = 0.055 + 0.8 * Math.exp(-r / 80);
    const a = (2 * Math.PI * s.theme) / m + GALAXY.wind * Math.log(Math.max(r, GALAXY.core) / GALAXY.core) + spread * gauss(s.i * 3 + 2);
    p[2 * s.i] = Math.cos(a) * r; p[2 * s.i + 1] = Math.sin(a) * r;
  });
  return p;
}

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

/**
 * The force layout as a simulation that can be stepped, so the worker can show it
 * settling. It starts from `start` (the positions on screen, so a change of layout
 * relaxes out of the old one) or from the galaxy itself. Each memory is held to its place
 * in the galaxy, so links only gather it locally and the spiral survives.
 */
export function forceSim(f: StarField, start?: Float32Array | null, iterations = f.n > 2000 ? 90 : 160) {
  const n = f.n; const home = galaxy(f); const from = start && start.length === n * 2 ? start : home;
  const x = new Float32Array(n), y = new Float32Array(n), vx = new Float32Array(n), vy = new Float32Array(n), fx = new Float32Array(n), fy = new Float32Array(n);
  for (let i = 0; i < n; i++) { x[i] = from[2 * i]; y[i] = from[2 * i + 1]; }
  const K = 14 * Math.sqrt(700 / Math.max(50, n)), REST = 6, SPRING = 0.06, PULL = 0.09;
  let it = 0;
  const step = (count: number) => {
    for (let c = 0; c < count && it < iterations; c++, it++) {
      const alpha = 1 - it / iterations;
      fx.fill(0); fy.fill(0);
      repel(x, y, fx, fy, n, K, 1.2);
      for (const l of f.links) {
        const dx = x[l.b] - x[l.a], dy = y[l.b] - y[l.a]; const d = Math.hypot(dx, dy) || 1;
        const s = (SPRING * (l.type === 'theme' ? 0.6 : 1) * (d - REST)) / d;
        fx[l.a] += dx * s; fy[l.a] += dy * s; fx[l.b] -= dx * s; fy[l.b] -= dy * s;
      }
      for (let i = 0; i < n; i++) {
        fx[i] += (home[2 * i] - x[i]) * PULL; fy[i] += (home[2 * i + 1] - y[i]) * PULL;
        vx[i] = (vx[i] + fx[i] * alpha) * 0.82; vy[i] = (vy[i] + fy[i] * alpha) * 0.82;
        const v = Math.hypot(vx[i], vy[i]); if (v > 30) { vx[i] *= 30 / v; vy[i] *= 30 / v; }
        x[i] += vx[i]; y[i] += vy[i];
      }
    }
  };
  const positions = () => { const p = new Float32Array(n * 2); for (let i = 0; i < n; i++) { p[2 * i] = x[i]; p[2 * i + 1] = y[i]; } return p; };
  return { iterations, step, positions, done: () => it >= iterations };
}

export function force(f: StarField, iterations?: number): Float32Array {
  const sim = forceSim(f, null, iterations); sim.step(sim.iterations); return sim.positions();
}

/** The sphere's tilt towards the viewer (radians), and the camera's distance for the perspective. */
export const BALL = { tilt: 0.38, eye: 1700 };

/**
 * The sphere: x, y, z triples. Distance from the centre follows age, so the newest memories
 * crowd a bright core and the oldest thin out towards the surface, as in a globular cluster.
 * Each theme leans towards its own direction (spread evenly over the sphere) without owning
 * a region, and a few rounds of link springs gather linked memories into small constellations.
 */
export function ball(f: StarField): Float32Array {
  const n = f.n, m = f.themes.length; const [, d1] = f.domain; const span = f.domain[1] - f.domain[0];
  const dirs = f.themes.map((_, k) => { const y = 1 - (2 * (k + 0.5)) / m, r = Math.sqrt(1 - y * y), a = k * GOLDEN; return [Math.cos(a) * r, y, Math.sin(a) * r]; });
  const p = new Float32Array(n * 3), home = new Float32Array(n * 3);
  f.stars.forEach((s) => {
    const age = Math.max(0, Math.min(1, (d1 - s.t) / span));
    const r = R * (0.05 + 0.95 * Math.pow(age, 0.7)) * (1 + 0.05 * gauss(s.i * 5 + 1));
    const d = dirs[s.theme]; let x = d[0] * 0.7 + gauss(s.i * 5 + 2), y = d[1] * 0.7 + gauss(s.i * 5 + 3), z = d[2] * 0.7 + gauss(s.i * 5 + 4);
    const l = Math.hypot(x, y, z) || 1; x *= r / l; y *= r / l; z *= r / l;
    home[3 * s.i] = p[3 * s.i] = x; home[3 * s.i + 1] = p[3 * s.i + 1] = y; home[3 * s.i + 2] = p[3 * s.i + 2] = z;
  });
  const fx = new Float32Array(n * 3);
  for (let it = 0; it < 40; it++) {
    fx.fill(0);
    for (const ln of f.links) {
      const k = ln.type === 'theme' ? 0.02 : 0.06;
      for (let c = 0; c < 3; c++) { const e = (p[3 * ln.b + c] - p[3 * ln.a + c]) * k; fx[3 * ln.a + c] += e; fx[3 * ln.b + c] -= e; }
    }
    for (let i = 0; i < n * 3; i++) p[i] += fx[i] + (home[i] - p[i]) * 0.12;
  }
  return p;
}

/** Turns the ball (yaw about the vertical axis, then pitch) and projects it in perspective: x, y pairs into `out`, and each star's depth (−1 far … 1 near) into `depth`. */
export function project(b: Float32Array, yaw: number, pitch: number, out: Float32Array, depth?: Float32Array) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch); const n = b.length / 3;
  for (let i = 0; i < n; i++) {
    const x0 = b[3 * i], y0 = b[3 * i + 1], z0 = b[3 * i + 2];
    const x = cy * x0 + sy * z0, z1 = -sy * x0 + cy * z0;
    const y = cp * y0 - sp * z1, z = sp * y0 + cp * z1;
    const s = BALL.eye / (BALL.eye - z);
    out[2 * i] = x * s; out[2 * i + 1] = y * s; if (depth) depth[i] = z / R;
  }
  return out;
}

export function layout(f: StarField, id: LayoutId) {
  if (id === 'sphere') return project(ball(f), 0, BALL.tilt, new Float32Array(f.n * 2));
  return id === 'force' ? force(f) : id === 'drum' ? drum(f) : clusters(f);
}
