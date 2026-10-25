// Star map · a generated sample of invented memories (browser demo only).
// Deterministic from (n, seed): the page and the layout worker build the same
// field. Nothing here is a real memory, a real relation or a real person; titles
// are assembled from fixed word lists. Links come in three kinds, kept apart:
//   source      — two memories drawn from the same invented conversation;
//   supersedes  — a later memory replaces an earlier one (directed a → b);
//   theme       — an algorithm's suggestion: same suggested theme, close in time.
//                 It is co-occurrence, not a fact about how the two relate, and
//                 only the strongest `linkCap` are kept (the rest are counted).

export type StarState = 'adopted' | 'consolidated' | 'held' | 'fading' | 'superseded' | 'corrected';
export type LinkType = 'source' | 'supersedes' | 'theme';
export interface Star { i: number; id: string; title: string; kind: string; state: StarState; theme: number; t: number }
export interface Link { a: number; b: number; type: LinkType; w: number }
export interface StarField {
  n: number; seed: number; stars: Star[]; links: Link[]; themes: string[];
  domain: readonly [number, number];
  /** Theme links kept / theme-link candidates scored (the rest are not drawn). */
  themeKept: number; themeCandidates: number;
}

export const STAR_THEMES = ['Vault port work', 'How I like answers', 'Late evenings', 'Reading', 'Hangzhou trip', 'Interface taste', 'Learning Rust', 'Music'];
const KINDS = ['Fact', 'Preference', 'Episode', 'Project state', 'Reflection', 'Checkpoint'];
const WORDS: string[][] = [
  ['rename test', 'generation pointer', 'adapter boundary', 'recovery drill', 'lock order', 'hash check', 'port sketch', 'rollback note'],
  ['short answers', 'no preamble', 'one example', 'plain words', 'cite the source', 'ask before long', 'bullet budget', 'tone check'],
  ['after eleven', 'quiet hours', 'late tea', 'night walk', 'low lamp', 'last commit', 'window open', 'slow music'],
  ['Klara chapter', 'margin note', 'reread list', 'poem by heart', 'library hold', 'essay draft', 'summer list', 'quote kept'],
  ['train times', 'West Lake loop', 'tea village', 'rain plan', 'hostel booking', 'map pin', 'bike rental', 'last-day list'],
  ['ink on paper', 'no glow', 'one accent', 'grid less', 'mono labels', 'quiet motion', 'square corners', 'dark tile'],
  ['borrow checker', 'lifetimes again', 'async lesson', 'trait object', 'error enum', 'cargo feature', 'unsafe note', 'test macro'],
  ['vinyl find', 'piano scale', 'playlist pass', 'concert date', 'film score', 'headphone swap', 'slow album', 'chord sheet'],
];
const DAY = 86_400_000;
export const STAR_DOMAIN: readonly [number, number] = [Date.parse('2025-10-31T16:00:00Z'), Date.parse('2026-10-31T16:00:00Z')];

/** mulberry32: small, fast, deterministic. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function makeStarField(n: number, seed = 7): StarField {
  const r = rng(seed); const [d0, d1] = STAR_DOMAIN; const span = d1 - d0;
  // Each theme is busy in two or three stretches of the year; the rest is background.
  const bursts = STAR_THEMES.map(() => Array.from({ length: 2 + Math.floor(r() * 2) }, () => ({ at: r(), w: 0.03 + r() * 0.07 })));
  const weight = STAR_THEMES.map(() => 0.5 + r());
  const total = weight.reduce((a, b) => a + b, 0);
  const pickTheme = () => { let x = r() * total; for (let k = 0; k < weight.length; k++) { x -= weight[k]; if (x <= 0) return k; } return weight.length - 1; };
  const gauss = () => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
  const states: [StarState, number][] = [['adopted', 0.55], ['consolidated', 0.15], ['held', 0.12], ['fading', 0.1], ['superseded', 0.06], ['corrected', 0.02]];
  const pickState = (): StarState => { let x = r(); for (const [s, p] of states) { x -= p; if (x <= 0) return s; } return 'adopted'; };
  const stars: Star[] = [];
  for (let i = 0; i < n; i++) {
    const theme = pickTheme(); const b = bursts[theme][Math.floor(r() * bursts[theme].length)];
    const burst = b.at + gauss() * b.w;
    const f = r() < 0.7 && burst >= 0 && burst < 1 ? burst : r(); // outside the year: fall back to background, never pile on an edge
    const t = Math.round((d0 + f * span) / 60_000) * 60_000;
    const w = WORDS[theme];
    const wa = Math.floor(r() * w.length), wb = (wa + 1 + Math.floor(r() * (w.length - 1))) % w.length;
    stars.push({ i, id: 'sm_' + String(i + 1).padStart(4, '0'), title: w[wa] + (r() < 0.5 ? '' : ' · ' + w[wb]), kind: KINDS[Math.floor(r() * KINDS.length)], state: pickState(), theme, t });
  }
  // Order by time so index order is also time order (replay, list, drum).
  stars.sort((a, b) => a.t - b.t); stars.forEach((s, k) => { s.i = k; s.id = 'sm_' + String(k + 1).padStart(4, '0'); });
  const byTheme: number[][] = STAR_THEMES.map(() => []);
  stars.forEach((s) => byTheme[s.theme].push(s.i));
  const links: Link[] = []; const seen = new Set<string>();
  const add = (a: number, b: number, type: LinkType, w: number) => { const k = Math.min(a, b) + ':' + Math.max(a, b); if (a === b || seen.has(k)) return false; seen.add(k); links.push({ a, b, type, w }); return true; };
  // source: small groups of neighbours in time within a theme came from one invented conversation
  for (const list of byTheme) for (let k = 0; k + 1 < list.length; k++) if (r() < 0.12) { const g = 1 + Math.floor(r() * 3); for (let j = 1; j <= g && k + j < list.length; j++) add(list[k], list[k + j], 'source', 1); }
  // supersedes: a superseded memory points to a later one in the same theme
  for (const s of stars) if (s.state === 'superseded') { const list = byTheme[s.theme]; const pos = list.indexOf(s.i); const later = list[pos + 1 + Math.floor(r() * 3)]; if (later !== undefined) add(s.i, later, 'supersedes', 1); }
  // theme: score candidates the way a co-occurrence view would, keep the strongest
  const cands: Link[] = [];
  for (const list of byTheme) for (let k = 0; k < list.length; k++) for (let j = 1; j <= 6 && k + j < list.length; j++) {
    const a = stars[list[k]], b = stars[list[k + j]]; const days = Math.abs(b.t - a.t) / DAY;
    const w = 1 / (1 + days / 7) + (days < 1 ? 0.6 : 0) + (a.state === 'consolidated' && b.state === 'consolidated' ? 0.4 : 0) + r() * 0.05;
    cands.push({ a: a.i, b: b.i, type: 'theme', w });
  }
  cands.sort((x, y) => y.w - x.w);
  const cap = Math.round(n * 0.86); let kept = 0;
  for (const c of cands) { if (kept >= cap) break; if (add(c.a, c.b, 'theme', c.w)) kept++; }
  return { n, seed, stars, links, themes: STAR_THEMES, domain: STAR_DOMAIN, themeKept: kept, themeCandidates: cands.length };
}
