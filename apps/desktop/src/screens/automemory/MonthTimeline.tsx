// Browser-only month/day reading of the invented sample; never a backend projection.
import { useEffect, useState } from 'react';
import { AUTO_MEMORIES } from './dataset';
import type { AutoMemory } from './fixture';
import { D0, D1, MONTHS, byId, dayKey, dayStart, fmtDay, fmtMonth, monthStart, nextMonth, occurredText, spanOf } from './model';
import { Glyph, StateTag } from './parts';
import type { ViewProps } from './types';
import { lendMap, type MapSpec } from '../../theme/TimeMap';
import { clearViews, peekView, setWindow, useTimeView } from '../../theme/timeview';
import { msg, t } from '../../i18n/index.ts';

const DAY = 86400000;
const KEY = 'timeline-months';
const SPEC: MapSpec = {
  key: KEY, cells: (D1 - D0) / DAY, ticks: [],
  label: msg('Sample time map. Exact occurred days only; month-only dates and ranges are listed separately. The frame follows the displayed month.'),
  bars: (() => {
    const counts = Array.from({ length: (D1 - D0) / DAY }, () => 0);
    for (const m of AUTO_MEMORIES) {
      const o = m.occurred;
      if (o.precision !== 'instant' && o.precision !== 'day') continue;
      const index = (dayStart(o.precision === 'day' ? o.day : dayKey(o.at)) - D0) / DAY;
      if (index >= 0 && index < counts.length) counts[index]++;
    }
    const max = Math.max(1, ...counts);
    return counts.map(n => n / max);
  })(),
  get labels() { return MONTHS.map(m => ({ at: m.a, text: m.name })); },
  step: 31 * DAY, unit: msg('month'),
  readout: (start, span) => fmtMonth(dayKey(new Date(start + span / 2).toISOString()).slice(0, 7)),
  init: () => ({ start: monthStart('2026-09'), span: nextMonth('2026-09') - monthStart('2026-09'), domain: [D0, D1] }),
};

export default function MonthTimeline({ sel, select }: ViewProps) {
  const view = useTimeView(KEY, SPEC.init);
  const month = dayKey(new Date(view.start + view.span / 2).toISOString()).slice(0, 7);
  const start = monthStart(month), end = nextMonth(month);
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  useEffect(() => { lendMap(SPEC); return () => { lendMap(null); clearViews(KEY); }; }, []);
  // The shared map can move by pointer or keyboard. Snap its frame to a whole
  // calendar month, including the shorter months, without changing selection.
  useEffect(() => { setWindow(KEY, start, end - start, [D0, D1], view.by); }, [start, end, view.seq]);
  useEffect(() => {
    const o = byId.get(sel)!.occurred;
    if (o.precision === 'unknown') return;
    const anchor = o.precision === 'instant' ? dayKey(o.at) : o.precision === 'day' ? o.day : o.precision === 'month' ? o.month : o.start;
    const target = anchor.slice(0, 7);
    const current = peekView(KEY)!;
    const span = spanOf(o)!;
    // A range that already touches the shown month need not move the paper.
    const a = D0 + span.a * (D1 - D0), b = D0 + span.b * (D1 - D0);
    if ((a >= current.start + current.span || (b === a ? b < current.start : b <= current.start)) && MONTHS.some(m => m.key === target)) {
      setWindow(KEY, monthStart(target), nextMonth(target) - monthStart(target), [D0, D1], 'map');
    }
    if (o.precision === 'instant' || o.precision === 'day') setOpened(days => new Set(days).add(anchor));
  }, [sel]);

  const days = new Map<string, AutoMemory[]>();
  const coarse: AutoMemory[] = [];
  const unknown: AutoMemory[] = [];
  for (const m of AUTO_MEMORIES) {
    const o = m.occurred;
    if (o.precision === 'unknown') { unknown.push(m); continue; }
    if (o.precision === 'instant' || o.precision === 'day') {
      const key = o.precision === 'day' ? o.day : dayKey(o.at);
      if (key.startsWith(month)) days.set(key, [...(days.get(key) ?? []), m]);
    } else {
      const span = spanOf(o)!;
      const a = D0 + span.a * (D1 - D0), b = D0 + span.b * (D1 - D0);
      // An open range establishes its start only, not continued occurrence.
      if (span.open ? dayKey(new Date(a).toISOString()).startsWith(month) : a < end && b > start) coarse.push(m);
    }
  }
  const record = (m: AutoMemory) => {
    const when = occurredText(m.occurred);
    return <li key={m.id}><button type="button" className="am-month-record" data-month-record={m.id} data-precision={m.occurred.precision} data-open={m.occurred.precision === 'range' && m.occurred.end === null || undefined} aria-pressed={sel === m.id} onClick={() => select(m.id)}>
      <span className="am-month-title"><Glyph s={m.state} />{m.title}</span>
      <span className="am-fine">{when.text} · {when.tag}</span>
      <StateTag s={m.state} />
    </button></li>;
  };
  return <section className="am-months" aria-label={t("Months and days")}>
    <div className="am-view-head">
      <h2 className="am-vh">{t("Timeline")} <span>{t("Months and days")}</span></h2>
      <p className="am-fine">{t("Occurred time · Asia/Shanghai (UTC+8) · loaded sample only. Open a day to read its memories. Month-only dates, ranges and unknown times keep their precision.")}</p>
    </div>
    <div className="am-month-layout">
      <nav className="am-month-nav" aria-label={t("Sample months")}>
        {MONTHS.map(m => <button key={m.key} type="button" className="am-chip" data-month={m.key} aria-label={fmtMonth(m.key)} aria-current={month === m.key ? 'date' : undefined} onClick={() => setWindow(KEY, monthStart(m.key), nextMonth(m.key) - monthStart(m.key), [D0, D1], 'map')}>{m.name}</button>)}
      </nav>
      <div className="am-month-paper" data-shown-month={month}>
        <h3>{fmtMonth(month)}</h3>
        {days.size === 0 && coarse.length === 0 ? <p className="am-empty">{t("No dated records in this sample month. Choose another month or inspect unknown times below. This does not mean nothing happened.")}</p> : null}
        {[...days].sort(([a], [b]) => a.localeCompare(b)).map(([day, memories]) => <details key={day} className="am-month-day" data-day={day} open={opened.has(day)} onToggle={e => {
          const open = e.currentTarget.open;
          setOpened(previous => { if (previous.has(day) === open) return previous; const next = new Set(previous); if (open) next.add(day); else next.delete(day); return next; });
        }}>
          <summary>{fmtDay(dayStart(day))}<span className="am-tag">{t("{n} records", { n: memories.length })}</span></summary>
          <ul>{memories.map(record)}</ul>
        </details>)}
        {coarse.length ? <section className="am-month-coarse" aria-label={t("Month-only dates and ranges")}>
          <h4>{t("Month-only dates and ranges")}</h4>
          <p className="am-fine">{t("These records are not assigned to individual days. Ranges may appear in more than one month; do not add those monthly counts. An open end does not establish continued activity.")}</p>
          <ul>{coarse.map(record)}</ul>
        </section> : null}
      </div>
    </div>
    <section className="am-month-unknown" aria-label={t("Time not recorded")}>
      <h3>{t("Time not recorded")}</h3>
      <p className="am-fine">{t("No occurred date is assigned to these records. Selecting one keeps it outside the calendar.")}</p>
      {unknown.length ? <ul>{unknown.map(record)}</ul> : <p className="am-fine">{t("No unknown occurred times in this sample.")}</p>}
    </section>
  </section>;
}
