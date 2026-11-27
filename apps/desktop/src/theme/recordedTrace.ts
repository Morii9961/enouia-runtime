// 08-negative · the registered library's record trace, drawn from recorded times.
// The line is a smoothed count of captured conversation turns (each turn's own
// recorded time, so the pen rises while Morii talked and settles between talks);
// the marks are Memory's recorded writes. Nothing is interpolated between
// records: where no turn was recorded the line stays at its baseline.
import type { MapSpec } from './TimeMap';
import { DAY, nativeDate, nativeDay } from './nativeTime';
import { t } from '../i18n/index';

export const TRACE_DAYS = 42;
export const TRACE_SPAN = 4 * DAY;
const STEP = 3_600_000;
const SIGMA = 3 * STEP;

export type RecordedWrite = { at: number; kind: string; adoption: string | null };
export type RecordedTrace = {
  start: number; end: number;
  /** Line height, 0 = top of the chart, 1 = bottom. */
  y: (at: number) => number;
  /** Path in a 1000 × 100 box spanning the whole domain, drawn up to `now`. */
  path: (now: number) => string;
  /** Turns per day of the domain, and the same scaled 0 to 1 (the time map's bars). */
  counts: number[];
  bars: number[];
  /** Recorded writes grouped by hour and kind: one mark each. */
  marks: { at: number; kind: string; count: number }[];
  turnsInDomain: number;
  latestTurn: number | null;
};

export function recordedTrace(turns: number[], writes: RecordedWrite[], now: number): RecordedTrace {
  const end = nativeDay(now) + DAY, start = end - TRACE_DAYS * DAY;
  const near = turns.filter(at => at >= start - 3 * SIGMA && at < end + 3 * SIGMA);
  const n = (end - start) / STEP;
  const raw = Array.from({ length: n + 1 }, (_, i) => near.reduce((sum, at) => sum + Math.exp(-0.5 * ((start + i * STEP - at) / SIGMA) ** 2), 0));
  const peak = Math.max(...raw, 1);
  const ys = raw.map(v => 0.78 - 0.56 * v / peak);
  const y = (at: number) => ys[Math.max(0, Math.min(n, Math.round((at - start) / STEP)))];
  const path = (until: number) => ys.slice(0, Math.max(1, Math.min(n, Math.floor((until - start) / STEP)) + 1))
    .map((v, i) => `${i ? 'L' : 'M'}${(i / n * 1000).toFixed(2)} ${(v * 100).toFixed(2)}`).join(' ');
  const counts = Array.from({ length: TRACE_DAYS }, () => 0);
  for (const at of turns) if (at >= start && at < end) counts[Math.floor((at - start) / DAY)]++;
  const most = Math.max(...counts, 1);
  const groups = new Map<string, { at: number; kind: string; count: number }>();
  for (const w of writes) {
    if (w.at < start || w.at >= end) continue;
    const kind = w.kind === 'formation' ? (w.adoption === 'staged' ? 'candidate' : 'canonical') : w.kind === 'correction' ? 'superseded' : 'canonical';
    const key = `${Math.floor(w.at / STEP)}:${kind}`;
    const group = groups.get(key);
    if (group) group.count++; else groups.set(key, { at: w.at, kind, count: 1 });
  }
  return { start, end, y, path, counts, bars: counts.map(c => c / most), marks: [...groups.values()],
    turnsInDomain: counts.reduce((a, b) => a + b, 0), latestTurn: turns.length ? Math.max(...turns) : null };
}

/** The registered Home's time map: six weeks of days, four days on screen. */
export function recordedSpec(now: number, scope: string, trace: RecordedTrace | null): MapSpec {
  const end = nativeDay(now) + DAY, start = end - TRACE_DAYS * DAY;
  const latest = trace?.latestTurn ?? null;
  // Open where the latest captured turns are when the last two weeks hold none,
  // so the first view shows recorded talk; "Now" moves the frame back to today.
  const frame = latest != null && latest >= start && latest < end - TRACE_SPAN
    ? Math.max(start, nativeDay(latest) + 2 * DAY - TRACE_SPAN) : end - TRACE_SPAN;
  const date = (at: number) => nativeDate(at, { month: 'short', day: 'numeric' });
  return {
    key: `registered-home:${scope}:${end}:${trace ? frame : 'reading'}`,
    label: t('Home calendar · captured conversation turns and Memory writes'),
    cells: TRACE_DAYS, step: DAY, unit: 'day',
    ticks: (trace?.marks ?? []).map(m => ({ at: (m.at - start) / (end - start), tall: true })),
    bars: trace?.bars,
    labels: [0, 7, 14, 21, 28, 35].map(i => ({ at: i / TRACE_DAYS, text: date(start + i * DAY) })),
    now: (now - start) / (end - start),
    readout: (from, span) => `${date(from)} – ${date(from + span - 1)} · UTC+8`,
    jump: { label: 'Now', start: end - TRACE_SPAN },
    init: () => ({ start: frame, span: TRACE_SPAN, domain: [start, end] }),
  };
}
