// 08-negative · geometry for the record chart.
// Presentation only: every value is derived from the fictional demo fixture
// and drawn against a fixed demo clock. Nothing here reads a live source.
// Two frames share one trace: the week on the record strip
// and the three-week domain behind Home's time map, where the chart pans.
import { demoData as D } from '../demo-data';
import { lang } from '../i18n/index.ts';

const H = 36e5;
const DAY = 24 * H;
/** Monday 28 September 2026, 00:00 Asia/Shanghai — the strip's left edge. */
export const WEEK_START = Date.parse('2026-09-27T16:00:00.000Z');
export const WEEK_MS = 7 * DAY;
/** Demo clock: the fixture's last compile, 1 Oct 2026 14:44 Asia/Shanghai. Never the real time. */
export const DEMO_CLOCK = Date.parse('2026-10-01T06:44:02.318Z');
export const CHART_NO = 40; // ISO week of 28 Sep 2026

/** Home's time map covers three weeks: Mon 14 Sep – Sun 4 Oct (Asia/Shanghai). */
export const DOM_START = Date.parse('2026-09-13T16:00:00.000Z');
export const DOM_DAYS = 21;
export const DOM_MS = DOM_DAYS * DAY;
/** The chart on Home shows four days at a time; the demo clock sits near its right edge by default. */
export const HOME_SPAN = 4 * DAY;
export const HOME_START = WEEK_START;

const t = (iso: string | number) => (typeof iso === 'number' ? iso : Date.parse(iso));
/** 0 at Monday 00:00, 1 at the following Monday 00:00 (the strip's week). */
export const xOf = (iso: string | number) => (t(iso) - WEEK_START) / WEEK_MS;
export const onChart = (iso: string | number) => { const x = xOf(iso); return x >= 0 && x <= xOf(DEMO_CLOCK) + 1e-9; };
export const pct = (x: number) => (Math.max(0, Math.min(1, x)) * 100).toFixed(3) + '%';
/** 0 at the domain's left edge, 1 at its right edge. */
export const domX = (iso: string | number) => (t(iso) - DOM_START) / DOM_MS;
export const inDom = (iso: string | number) => { const x = domX(iso); return x >= 0 && x <= domX(DEMO_CLOCK) + 1e-9; };

const DOW_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
// Weekday names in the interface language; dates read 28 SEP in English and 9月28日 in Chinese and Japanese.
const DOW_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];
const dow = (i: number) => (lang() === 'zh-Hans' ? DOW_ZH : lang() === 'ja' ? DOW_JA : DOW_EN)[i];
const monthDay = (d: Date) => (lang() === 'en' ? d.getUTCDate() + ' ' + MON[d.getUTCMonth()] : (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日');
const parts = (ms: number) => new Date(ms + 8 * H);
export const DAYS = Array.from({ length: 7 }, (_, i) => {
  const d = parts(WEEK_START + i * DAY);
  return { key: i, get dow() { return dow(d.getUTCDay()); }, date: String(d.getUTCDate()), today: i === Math.floor(xOf(DEMO_CLOCK) * 7) };
});
/** The domain's days, one cell each. */
export const DOM_CELLS = Array.from({ length: DOM_DAYS }, (_, i) => {
  const d = parts(DOM_START + i * DAY);
  return { i, at: DOM_START + i * DAY, monday: d.getUTCDay() === 1, get dow() { return dow(d.getUTCDay()); }, get label() { return monthDay(d); }, date: d.getUTCDate(), month: MON[d.getUTCMonth()], today: DOM_START + (i + 1) * DAY > DEMO_CLOCK && DOM_START + i * DAY <= DEMO_CLOCK };
});
/** "28 SEP" style label for a timestamp (Asia/Shanghai). */
export const dayShort = (ms: number) => monthDay(parts(ms));

// The trace: conversation intensity, a smoothed sum over every demo turn and
// memory write, so the pen rises while we talk and settles between talks.
const events: number[] = [];
D.SESS.forEach((s) => s.turns.forEach((turn) => events.push(t(turn[2]))));
D.MEM.forEach((m) => events.push(t(m.created)));
const SIGMA = 75 * 60e3;
const density = (at: number) => events.reduce((sum, e) => sum + Math.exp(-0.5 * ((at - e) / SIGMA) ** 2), 0);
const QH = 15 * 60e3;
const STEPS = DOM_DAYS * 96; // quarter hours across the domain
const end = Math.min(STEPS, Math.ceil((DEMO_CLOCK - DOM_START) / QH));
const rawAt = (i: number) => DOM_START + Math.min(i * QH, DEMO_CLOCK - DOM_START);
const raw = Array.from({ length: end + 1 }, (_, i) => density(rawAt(i)));
const peak = Math.max(...raw, 1);
/** Deterministic hand-tremor: the pen's own friction, a pixel or two at most. It carries no data. */
const hash = (i: number) => { const s = Math.sin(i * 12.9898 + 4.1414) * 43758.5453; return s - Math.floor(s) - 0.5; };
const tremor = (i: number) => (hash(i - 1) + hash(i) * 2 + hash(i + 1)) / 4;
/** Pen height, 0 = top of the chart, 1 = bottom. */
const level = (i: number, d: number) => 0.74 - 0.56 * (d / peak) + 0.01 * tremor(i);
/** One sample per quarter hour from the domain's left edge up to the demo clock. */
const samples = raw.map((d, i) => ({ at: rawAt(i), y: level(i, d) }));
export const yAt = (iso: string | number) => {
  const i = Math.max(0, Math.min(samples.length - 1, Math.round((t(iso) - DOM_START) / QH)));
  return samples[i].y;
};
/** Trace path for a frame of the domain, in a 1000 × 100 box (draw with preserveAspectRatio="none" and a non-scaling stroke). */
const pathFor = (start: number, span: number) => samples.filter((p) => p.at >= start - QH && p.at <= start + span + QH)
  .map((p, i) => (i ? 'L' : 'M') + (((p.at - start) / span) * 1000).toFixed(2) + ' ' + (p.y * 100).toFixed(2)).join(' ');
/** The week on the record strip. */
export const tracePath = pathFor(WEEK_START, WEEK_MS);
/** The whole three weeks, for Home's panning chart. */
export const domPath = pathFor(DOM_START, DOM_MS);
const penY = samples[samples.length - 1].y;
export const pen = { x: xOf(DEMO_CLOCK), y: penY };
export const domPen = { x: domX(DEMO_CLOCK), y: penY };

export type Mark = { key: string; x: number; y: number; kind: 'canonical' | 'candidate' | 'checkpoint' | 'superseded'; at: string };
const markOf = (m: (typeof D.MEM)[number], x: number): Mark => ({
  key: m.key, at: m.created, x, y: yAt(m.created),
  kind: m.kind === 'session_checkpoint' ? 'checkpoint' : m.status === 'candidate' ? 'candidate' : m.status === 'active' ? 'canonical' : 'superseded',
});
/** Memory writes on this week's strip: canonical = solid tick, candidate = hollow tick, checkpoint = pen-pressure dot. */
export const marks: Mark[] = D.MEM.filter((m) => onChart(m.created)).map((m) => markOf(m, xOf(m.created)));
/** The same marks on Home's three-week domain. */
export const domMarks: Mark[] = D.MEM.filter((m) => inDom(m.created)).map((m) => markOf(m, domX(m.created)));
/** Records written before Monday live on earlier charts. */
export const earlier = D.MEM.filter((m) => xOf(m.created) < 0).length;
/** Records before the three-week domain. */
export const domEarlier = D.MEM.filter((m) => domX(m.created) < 0).length;
/** Event instants inside the domain, as fractions of it. */
export const domTicks = events.filter((e) => e >= DOM_START && e <= DEMO_CLOCK).map((e) => (e - DOM_START) / DOM_MS);
/** How many events fell on each day of the domain, scaled 0 to 1 (the time map's bars). */
export const domBars = (() => { const c = Array.from({ length: DOM_DAYS }, () => 0); domTicks.forEach((x) => { c[Math.min(DOM_DAYS - 1, Math.floor(x * DOM_DAYS))]++; }); const m = Math.max(...c, 1); return c.map((n) => n / m); })();

export const dayLabel = (iso: string) => { const d = parts(t(iso)); return lang() === 'en' ? DOW_EN[d.getUTCDay()] + ' ' + monthDay(d) : monthDay(d) + ' ' + dow(d.getUTCDay()); };
