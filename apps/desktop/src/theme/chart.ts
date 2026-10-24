// 01-barograph · geometry for the weekly record chart.
// Presentation only: every value is derived from the fictional demo fixture
// and drawn against a fixed demo clock. Nothing here reads a live source.
import { demoData as D } from '../demo-data';

const H = 36e5;
/** Monday 28 September 2026, 00:00 Asia/Shanghai — the chart's left edge. */
export const WEEK_START = Date.parse('2026-09-27T16:00:00.000Z');
export const WEEK_MS = 7 * 24 * H;
/** Demo clock: the fixture's last compile, 1 Oct 2026 14:44 Asia/Shanghai. Never the real time. */
export const DEMO_CLOCK = Date.parse('2026-10-01T06:44:02.318Z');
export const CHART_NO = 40; // ISO week of 28 Sep 2026

const t = (iso: string | number) => (typeof iso === 'number' ? iso : Date.parse(iso));
/** 0 at Monday 00:00, 1 at the following Monday 00:00. */
export const xOf = (iso: string | number) => (t(iso) - WEEK_START) / WEEK_MS;
export const onChart = (iso: string | number) => { const x = xOf(iso); return x >= 0 && x <= xOf(DEMO_CLOCK) + 1e-9; };
export const pct = (x: number) => (Math.max(0, Math.min(1, x)) * 100).toFixed(3) + '%';

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const DAYS = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(WEEK_START + i * 24 * H + 8 * H);
  return { key: i, dow: DOW[d.getUTCDay()], date: String(d.getUTCDate()), today: i === Math.floor(xOf(DEMO_CLOCK) * 7) };
});

// The trace: conversation intensity, a smoothed sum over every demo turn and
// memory write, so the pen rises while we talk and settles between talks.
const events: number[] = [];
D.SESS.forEach((s) => s.turns.forEach((turn) => events.push(t(turn[2]))));
D.MEM.forEach((m) => events.push(t(m.created)));
const SIGMA = 75 * 60e3;
const density = (at: number) => events.reduce((sum, e) => sum + Math.exp(-0.5 * ((at - e) / SIGMA) ** 2), 0);
const STEPS = 7 * 24 * 4; // quarter hours
const end = Math.min(STEPS, Math.ceil(xOf(DEMO_CLOCK) * STEPS));
const raw = Array.from({ length: end + 1 }, (_, i) => density(WEEK_START + Math.min(i / STEPS, xOf(DEMO_CLOCK)) * WEEK_MS));
const peak = Math.max(...raw, 1);
/** Deterministic hand-tremor: the pen's own friction, a pixel or two at most. It carries no data (a regular sine read as a fake signal in round 1). */
const hash = (i: number) => { const s = Math.sin(i * 12.9898 + 4.1414) * 43758.5453; return s - Math.floor(s) - 0.5; };
const tremor = (i: number) => (hash(i - 1) + hash(i) * 2 + hash(i + 1)) / 4;
/** Pen height, 0 = top of the chart, 1 = bottom. */
const level = (i: number, d: number) => 0.74 - 0.56 * (d / peak) + 0.01 * tremor(i);
export const samples = raw.map((d, i) => ({ x: Math.min(i / STEPS, xOf(DEMO_CLOCK)), y: level(i, d) }));
export const yAt = (iso: string | number) => {
  const x = xOf(iso); const i = Math.max(0, Math.min(samples.length - 1, Math.round(x * STEPS)));
  return samples[i].y;
};
/** Trace path in a 1000 × 100 box (draw with preserveAspectRatio="none" and a non-scaling stroke). */
export const tracePath = samples.map((p, i) => (i ? 'L' : 'M') + (p.x * 1000).toFixed(2) + ' ' + (p.y * 100).toFixed(2)).join(' ');
export const pen = { x: xOf(DEMO_CLOCK), y: samples[samples.length - 1].y };

export type Mark = { key: string; x: number; y: number; kind: 'canonical' | 'candidate' | 'checkpoint' | 'superseded'; at: string };
/** Memory writes on this week's paper: canonical = solid tick, candidate = hollow tick, checkpoint = pen-pressure dot. */
export const marks: Mark[] = D.MEM.filter((m) => onChart(m.created)).map((m) => ({
  key: m.key, at: m.created, x: xOf(m.created), y: yAt(m.created),
  kind: m.kind === 'session_checkpoint' ? 'checkpoint' : m.status === 'candidate' ? 'candidate' : m.status === 'active' ? 'canonical' : 'superseded',
}));
/** Records written before Monday live on earlier charts. */
export const earlier = D.MEM.filter((m) => xOf(m.created) < 0).length;

/** Second instrument: the Activity producer's daily 12:00 collections from the demo events. */
export const readings = D.ACT.filter((a) => a.cat === 'producer' && onChart(a.at)).map((a) => ({
  key: a.k, x: xOf(a.at), failed: a.title === 'Collection incomplete', title: a.title,
}));
/** The producer's next scheduled run in the demo fixture (2 Oct, 12:00). */
export const NEXT_RUN = Date.parse('2026-10-02T04:00:00.000Z');
export const dayLabel = (iso: string) => { const d = new Date(t(iso) + 8 * H); return DOW[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getUTCMonth()]; };
