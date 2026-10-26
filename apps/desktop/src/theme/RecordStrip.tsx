// 08-negative · the record strip that heads every surface, the chart it draws and
// the time map under it. Presentation only. The demo trace is fictional and drawn
// against a fixed demo clock; the native shell gets a blank strip (no fabricated
// trace) and, when the Vault is not open, a strip with no film loaded.
import React from 'react';
import type { Page } from '../demo-types';
import { DAYS, DEMO_CLOCK, earlier, marks, onChart, pct, pen, tracePath, xOf, yAt, dayLabel, type Mark } from './chart';
import { useStatus, exiting } from '../memory/status';
import { useAutoMode } from './autoMode';
import TimeMap, { useLentMap } from './TimeMap';
import { homeSpec, sessionSpec } from './mapSpecs';

import { msg, t } from '../i18n/index.ts';
const MARK_LABEL = { canonical: msg('canonical write'), candidate: msg('candidate proposed'), checkpoint: msg('checkpoint'), superseded: msg('superseded write') };

/** Day columns (the coarse grid only) and, when asked, day names; children are drawn on top. */
export function Paper({ days = true, children, className = '' }: { days?: boolean; children?: React.ReactNode; className?: string }) {
  return (
    <div className={'bg-paper ' + className}>
      {days ? DAYS.map((d) => <span key={d.key} className="bg-day" data-today={d.today || undefined} style={{ left: pct(d.key / 7) }}>{d.dow} <b>{d.date}</b></span>) : null}
      {children}
    </div>
  );
}

/** The pen trace, its write marks and the pen. Coordinates are fractions of the layer it is drawn in. */
export function Trace({ d = tracePath, marks: m = marks, penAt = pen, still, showMarks = true, tip = true, draw = false }: { d?: string; marks?: Mark[]; penAt?: { x: number; y: number }; still: boolean; showMarks?: boolean; tip?: boolean; draw?: boolean }) {
  return (
    <>
      <div className="bg-trace-clip" data-draw={draw && !still ? 'on' : undefined}>
        <svg className="bg-trace" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
          <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
      </div>
      {showMarks ? m.map((k) => <span key={k.key} className="bg-mark" data-kind={k.kind} title={t(MARK_LABEL[k.kind])} style={{ left: pct(k.x), top: pct(k.y) }} />) : null}
      {tip ? <span className="bg-pen" data-still={still || undefined} data-draw={draw && !still ? 'on' : undefined} style={{ left: pct(penAt.x), top: pct(penAt.y) }} aria-hidden="true"><svg width="10" height="8" viewBox="0 0 10 8"><path d="M0 0L10 4L0 8z" fill="currentColor" /></svg></span> : null}
    </>
  );
}

type StripProps = { page: Page; nav: React.ReactNode; still: boolean; selectedAt?: string; sessionSpan?: [string, string]; sessionKey?: string };

/** Demo strip: fictional week, demo clock, the page's own mark and, where the page has a time axis, the time map. */
export function RecordStrip({ page, nav, still, selectedAt, sessionSpan, sessionKey }: StripProps) {
  const auto = useAutoMode() && page === 'memory';
  const lent = useLentMap();
  const meta = auto
    ? lent?.key === 'starmap'
      ? <><b>{t("Star map")}</b> {t("· generated sample · its own sample time, Nov 2025 – Oct 2026")}</>
      : <><b>{t("Automatic memory")}</b> {t("· synthetic preview · its own sample time, 1 Jul – 31 Oct 2026")}</>
    : <><b>{t("Week of 28 Sep 2026")}</b> · <span className="bg-clock">{t("demo clock Thu 1 Oct, 14:44")}</span></>;
  let overlay: React.ReactNode = null;
  let summary = t('Fictional demo strip, week of 28 September 2026, drawn up to the demo clock, Thursday 1 October 14:44.');
  if (page === 'memory' && selectedAt) {
    if (onChart(selectedAt)) { overlay = <span className="bg-cursor" style={{ left: pct(xOf(selectedAt)) }}><span>{dayLabel(selectedAt)}</span></span>; summary += ' ' + t('Selected record marked at {day}.', { day: dayLabel(selectedAt) }); }
    else { overlay = <span className="bg-offchart">◂ {t('selected record: {day} · on an earlier strip', { day: dayLabel(selectedAt) })}</span>; summary += ' ' + t('Selected record is on an earlier strip.'); }
  }
  if (page === 'sessions' && sessionSpan) {
    if (onChart(sessionSpan[0])) { const a = xOf(sessionSpan[0]); const b = Math.max(xOf(sessionSpan[1]), a + 0.004); overlay = <span className="bg-band" style={{ left: pct(a), width: pct(b - a) }}><span>{t("session")}</span></span>; }
    else overlay = <span className="bg-offchart">◂ {t('this session: {day} · on an earlier strip', { day: dayLabel(sessionSpan[0]) })}</span>;
  }
  // Which pages have a time axis, and so a map. The row is reserved in advance so nothing shifts when the map arrives.
  const map = page === 'home' ? <TimeMap spec={homeSpec} />
    : page === 'sessions' && sessionKey ? <TimeMap spec={sessionSpec(sessionKey)} />
    : auto ? (lent ? <TimeMap spec={lent} /> : <div className="tm tm-note"><span>{t("Time map · Timeline view · the other views have no time axis to move")}</span></div>)
    : null;
  return (
    <div className="bg-strip" data-page={page} data-auto={auto || undefined}>
      <div className="bg-strip-head">
        {nav}
        <div className="bg-strip-meta">{meta}</div>
      </div>
      {page === 'home' || auto ? null : (
        <div className="bg-strip-chart" role="img" aria-label={summary}>
          <Paper>
            <Trace still={still} showMarks tip />
            {overlay}
            {earlier ? <span className="bg-earlier">{t('{n} earlier records', { n: earlier })} ◂</span> : null}
          </Paper>
        </div>
      )}
      {map}
    </div>
  );
}

/** Native strip: blank, never a fabricated trace; with no Vault open it says no strip is loaded and its time map is covered too. */
export function NativeStrip({ page, nav }: { page: Page; nav: React.ReactNode }) {
  const { status, vaultChanging } = useStatus();
  const state = status?.vault?.state;
  const stopped = (!status || exiting(status) || vaultChanging || state !== 'open');
  const why = t(!status ? 'reading Memory status' : exiting(status) ? 'Runtime is exiting' : vaultChanging ? 'finishing Vault change' : state === 'locked' ? 'Vault locked' : 'no Vault open');
  return (
    <div className="bg-strip" data-page={page} data-drum={stopped ? 'stopped' : undefined}>
      <div className="bg-strip-head">
        {nav}
        <div className="bg-strip-meta"><b>{t("Live shell")}</b> {t("· trace not plotted in this prototype")}</div>
      </div>
      {page === 'home' ? null : (
        <div className="bg-strip-chart">
          <Paper days={false} />
        </div>
      )}
      {stopped ? <div className="tm tm-stopped" role="img" aria-label={'No strip loaded: ' + why}><span className="bg-inv" aria-hidden="true">No strip loaded · {why}</span></div> : null}
    </div>
  );
}

export { DEMO_CLOCK, yAt };
