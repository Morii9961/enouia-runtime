// 01-barograph · helpers for the "Automatic memory · synthetic preview".
// Pure functions over the invented fixture: time formatting that keeps each
// time's precision, geometry on the preview's own sample paper, and small
// lookups. Nothing here reads a Vault, calls IPC or stores anything.
import { dateFmt, labels, lang, msg, t } from '../../i18n/index.ts';
import { AUTO_MEMORIES, RELATIONS, THEMES, type AutoMemory, type AutoState, type Occurred, type RelType } from './fixture';

export const byId = new Map(AUTO_MEMORIES.map((m) => [m.id, m]));
export const themeName = new Map(THEMES.map((t) => [t.id, t.name]));

// ---- time ------------------------------------------------------------------
// The sample is shown on Asia/Shanghai calendar days (the rest of the demo does
// the same). Day and month strings are calendar values, instants carry a Z.
const H = 36e5, DAY = 24 * H, TZ = 8 * H;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const local = (ms: number) => new Date(ms + TZ);

/** A calendar day (YYYY-MM-DD) as the start of that day in Asia/Shanghai. */
export const dayStart = (day: string) => Date.parse(day + 'T00:00:00+08:00');
/** A calendar month (YYYY-MM) as the start of that month. */
export const monthStart = (month: string) => Date.parse(month + '-01T00:00:00+08:00');
export const nextMonth = (month: string) => { const [y, m] = month.split('-').map(Number); return monthStart(m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`); };
/** Any fixture time string: instant, day or month. */
export const toMs = (s: string) => (s.length === 7 ? monthStart(s) : s.length === 10 ? dayStart(s) : Date.parse(s));

// English keeps its exact short forms; Chinese and Japanese use Intl in the same Asia/Shanghai calendar.
const cjk = (opts: Intl.DateTimeFormatOptions, ms: number) => dateFmt({ timeZone: 'Asia/Shanghai', ...opts }).format(ms);
export const fmtDay = (ms: number) => { if (lang() !== 'en') return cjk({ year: 'numeric', month: 'long', day: 'numeric' }, ms); const d = local(ms); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
export const fmtDayShort = (ms: number) => { if (lang() !== 'en') return cjk({ month: 'long', day: 'numeric' }, ms); const d = local(ms); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
export const fmtClock = (ms: number) => { const d = local(ms); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
export const fmtStamp = (iso: string) => `${fmtDay(toMs(iso))}${lang() === 'en' ? ',' : ''} ${fmtClock(toMs(iso))}`;
export const fmtMonth = (month: string) => { if (lang() !== 'en') return cjk({ year: 'numeric', month: 'long' }, monthStart(month) + 36e5); const [y, m] = month.split('-').map(Number); return `${MON[m - 1]} ${y}`; };
/** A valid-window bound or a range end in the precision it was written with. */
const fmtBound = (s: string) => (s.length === 7 ? fmtMonth(s) : s.length === 10 ? fmtDay(dayStart(s)) : fmtStamp(s));
export const dayKey = (iso: string) => { const d = local(toMs(iso)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const dayHeading = (iso: string) => { if (lang() !== 'en') return cjk({ month: 'long', day: 'numeric', weekday: 'long' }, toMs(iso)); const d = local(toMs(iso)); return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getUTCMonth()]; };
export const daysBetween = (a: number, b: number) => Math.round((b - a) / DAY);

/** Occurred time as words, with its precision spelled out. Unknown is never a date. */
export function occurredText(o: Occurred): { text: string; tag: string } {
  switch (o.precision) {
    case 'instant': return { text: fmtStamp(o.at), tag: t('instant') };
    case 'day': return { text: fmtDay(dayStart(o.day)), tag: t('day · time not recorded') };
    case 'month': return { text: fmtMonth(o.month), tag: t('month · day not recorded') };
    case 'range': {
      const coarse = o.start.length === 7 && (o.end ?? '').length === 7;
      if (o.end === null) return { text: t('from {date}', { date: fmtBound(o.start) }), tag: t('range · end open') };
      return { text: `${fmtBound(o.start)} – ${fmtBound(o.end)}`, tag: coarse ? t('range · months only') : t('range') };
    }
    default: return { text: t('Not recorded'), tag: t('unknown') };
  }
}
export function validText(v: AutoMemory['valid']): { text: string; note: string } {
  if (v.from && v.to) return { text: `${fmtBound(v.from)} – ${fmtBound(v.to)}`, note: v.note };
  if (v.from) return { text: t('From {date}', { date: fmtBound(v.from) }), note: v.note };
  if (v.to) return { text: t('Until {date}', { date: fmtBound(v.to) }), note: v.note };
  return { text: t('No window recorded'), note: v.note };
}

// ---- geometry on the sample paper ---------------------------------------------
/** Sample paper: 1 Jul to 31 Oct 2026, Asia/Shanghai. Not a clock; there is no "now" line. */
export const D0 = dayStart('2026-07-01');
export const D1 = dayStart('2026-11-01');
export const xOf = (ms: number) => (ms - D0) / (D1 - D0);
export const MONTHS = ['2026-07', '2026-08', '2026-09', '2026-10'].map((m) => ({ key: m, get name() { return lang() === 'en' ? MON[Number(m.slice(5)) - 1].toUpperCase() : cjk({ month: 'long' }, monthStart(m) + 36e5); }, a: xOf(monthStart(m)), b: xOf(nextMonth(m)) }));
/** The weekly rule starts on the first Monday on the paper (6 Jul 2026). */
export const WEEK0 = xOf(dayStart('2026-07-06'));
export const WEEK = 7 / ((D1 - D0) / DAY);

/** Mondays on the sample paper, for the axis. */
export const MONDAYS = Array.from({ length: 18 }, (_, i) => { const at = dayStart('2026-07-06') + i * 7 * DAY; return { x: xOf(at), day: local(at).getUTCDate() }; });

export interface Span { a: number; b: number; shape: 'dot' | 'cell' | 'month' | 'range'; softA: boolean; softB: boolean; open: boolean }
/** Where a memory's occurred time sits on the paper; null for unknown (never placed on the axis). */
export function spanOf(o: Occurred): Span | null {
  switch (o.precision) {
    case 'instant': { const x = xOf(Date.parse(o.at)); return { a: x, b: x, shape: 'dot', softA: false, softB: false, open: false }; }
    case 'day': { const a = xOf(dayStart(o.day)); return { a, b: a + 1 / ((D1 - D0) / DAY), shape: 'cell', softA: false, softB: false, open: false }; }
    case 'month': return { a: xOf(monthStart(o.month)), b: xOf(nextMonth(o.month)), shape: 'month', softA: true, softB: true, open: false };
    case 'range': {
      const a = xOf(toMs(o.start));
      const softA = o.start.length === 7;
      if (o.end === null) return { a, b: a, shape: 'range', softA, softB: true, open: true };
      const e = o.end;
      const b = xOf(e.length === 7 ? nextMonth(e) : e.length === 10 ? dayStart(e) + DAY : Date.parse(e));
      return { a, b: Math.max(b, a), shape: 'range', softA, softB: e.length === 7, open: false };
    }
    default: return null;
  }
}

// ---- state glyphs, shared words ----------------------------------------------
export const STATE_ORDER: AutoState[] = ['received', 'held', 'adopted', 'reevaluating', 'consolidated', 'conflict', 'superseded', 'fading', 'archived', 'corrected'];
export const STEP_LABEL = (s: AutoState | 'extracted', names: Record<AutoState, string>) => (s === 'extracted' ? t('Extracted') : names[s]);
export const SURFACING_TEXT: Record<AutoMemory['surfacing'], { word: string; hint: string }> = {
  often: labels({ word: msg('Often offered'), hint: msg('Offered readily when its topic comes up.') }),
  sometimes: labels({ word: msg('Sometimes offered'), hint: msg('Offered when the moment fits.') }),
  rarely: labels({ word: msg('Rarely offered'), hint: msg('Offered only when closely related.') }),
  'not offered': labels({ word: msg('Not offered'), hint: msg('Not used for recall right now.') }),
};

// ---- relations ------------------------------------------------------------------
export interface Rel { other: string; type: RelType; dir: 'out' | 'in' }
export const relationsOf = (id: string): Rel[] => RELATIONS.flatMap((r): Rel[] => (r.from === id ? [{ other: r.to, type: r.type, dir: 'out' }] : r.to === id ? [{ other: r.from, type: r.type, dir: 'in' }] : []));
/** Plain-language form of a relation seen from the selected memory. */
export const relWords = (r: Rel) => t(r.type === 'supersedes' ? (r.dir === 'out' ? 'replaced' : 'replaced by') : r.type === 'source' ? 'same source revision' : r.type === 'shared theme' ? 'shared theme' : r.type === 'context dependency' ? 'context dependency' : 'suggestion · unconfirmed');

/** Greedy packing of intervals (fractions of paper width) into rows. */
export function pack<T>(items: T[], extent: (t: T) => [number, number]): { item: T; row: number }[] & { rows?: number } {
  const ends: number[] = [];
  const out = [...items].sort((p, q) => extent(p)[0] - extent(q)[0]).map((item) => {
    const [a, b] = extent(item);
    let row = ends.findIndex((e) => e <= a);
    if (row < 0) { row = ends.length; ends.push(b); } else ends[row] = b;
    return { item, row };
  }) as { item: T; row: number }[] & { rows?: number };
  out.rows = Math.max(1, ends.length);
  return out;
}
