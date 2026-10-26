// 08-negative · what the time map draws for Home and for a session.
// (The Timeline of the automatic-memory preview lends its own spec, see lendMap.)
// Presentation only, derived from the fictional demo fixture.
import { demoData as D } from '../demo-data';
import { DEMO_CLOCK, DOM_CELLS, DOM_MS, DOM_START, HOME_SPAN, HOME_START, domBars, domMarks, domX, dayShort } from './chart';
import type { MapSpec } from './TimeMap';
import { msg, t } from '../i18n/index.ts';

const DAY = 24 * 36e5;

export const homeSpec: MapSpec = {
  key: 'home',
  label: msg('Time map, 14 September to 4 October 2026, one cell per day. The frame is the stretch the chart shows.'),
  cells: DOM_CELLS.length,
  ticks: domMarks.map((m) => ({ at: m.x, tall: true })),
  bars: domBars,
  get labels() { return DOM_CELLS.filter((c) => c.monday).map((c) => ({ at: c.i / DOM_CELLS.length, text: c.label })); },
  now: domX(DEMO_CLOCK),
  step: DAY,
  page: HOME_SPAN,
  unit: 'day',
  readout: (start, span) => dayShort(start) + ' – ' + dayShort(start + span - 1),
  jump: { label: msg('Now'), start: HOME_START },
  init: () => ({ start: HOME_START, span: HOME_SPAN, domain: [DOM_START, DOM_START + DOM_MS] as const }),
};

/** The stretch a session covers: first event to last, with a minute either side. */
export function sessionStretch(sessionKey: string) {
  const s = D.SESS.find((x) => x.key === sessionKey) ?? D.SESS[0];
  const at = [...s.turns.map((t) => Date.parse(t[2])), ...s.checkpoints.map((c) => Date.parse(c.at))].sort((a, b) => a - b);
  return { session: s, at, domain: [at[0] - 60e3, at[at.length - 1] + 60e3] as const };
}

export function sessionSpec(sessionKey: string): MapSpec {
  const { session, at, domain } = sessionStretch(sessionKey);
  const len = domain[1] - domain[0];
  const cp = new Set(session.checkpoints.map((c) => Date.parse(c.at)));
  const frac = (ms: number) => (ms - domain[0]) / len;
  return {
    key: 'sessions:' + session.key,
    label: t('Time map of the session “{title}”, {from} to {to}. The frame is the part of the transcript on screen.', { title: session.title, from: D.tTime(new Date(domain[0]).toISOString()), to: D.tTime(new Date(domain[1]).toISOString()) }),
    cells: Math.max(8, Math.min(60, Math.round(len / 60e3))),
    ticks: at.map((a) => ({ at: frac(a), tall: cp.has(a) })),
    labels: [0, 0.25, 0.5, 0.75].map((f) => ({ at: f, text: D.tTime(new Date(domain[0] + f * len).toISOString()) })),
    step: Math.max(60e3, Math.round(len / 8 / 60e3) * 60e3),
    unit: msg('few minutes'),
    readout: (start, span) => D.tTime(new Date(start).toISOString()) + ' – ' + D.tTime(new Date(start + span).toISOString()),
    init: () => ({ start: domain[0], span: len, domain }),
  };
}
