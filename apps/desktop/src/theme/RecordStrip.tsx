// 01-barograph · the record strip that heads every surface, and the chart it draws.
// Presentation only. The demo trace is fictional and drawn against a fixed demo
// clock; the native shell gets blank paper (no fabricated trace) and, when the
// Vault is not open, a stopped drum.
import React from 'react';
import type { Page } from '../demo-types';
import { DAYS, DEMO_CLOCK, NEXT_RUN, earlier, marks, onChart, pct, pen, readings, tracePath, xOf, yAt, dayLabel } from './chart';
import { useStatus, exiting } from '../memory/status';
import { useAutoMode } from './autoMode';

const MARK_LABEL = { canonical: 'canonical write', candidate: 'candidate proposed', checkpoint: 'checkpoint', superseded: 'superseded write' };

/** Paper, day columns and hour ticks; children are drawn on top. */
export function Paper({ variant = 'memory', days = true, children, className = '' }: { variant?: 'memory' | 'activity'; days?: boolean; children?: React.ReactNode; className?: string }) {
  return (
    <div className={'bg-paper bg-paper-' + variant + ' ' + className}>
      {days ? DAYS.map((d) => <span key={d.key} className="bg-day" data-today={d.today || undefined} style={{ left: pct(d.key / 7) }}>{d.dow} <b>{d.date}</b></span>) : null}
      {children}
    </div>
  );
}

/** The ink trace, its write marks and the pen. Coordinates are fractions of the paper. */
export function Trace({ still, showMarks = true, tip = true, draw = false }: { still: boolean; showMarks?: boolean; tip?: boolean; draw?: boolean }) {
  return (
    <>
      <div className="bg-trace-clip" data-draw={draw && !still ? 'on' : undefined}>
        <svg className="bg-trace" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
          <path d={tracePath} fill="none" stroke="currentColor" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
      </div>
      {showMarks ? marks.map((m) => <span key={m.key} className="bg-mark" data-kind={m.kind} title={MARK_LABEL[m.kind]} style={{ left: pct(m.x), top: pct(m.y) }} />) : null}
      {tip ? <span className="bg-pen" data-still={still || undefined} data-draw={draw && !still ? 'on' : undefined} style={{ left: pct(pen.x), top: pct(pen.y) }} aria-hidden="true"><svg width="12" height="10" viewBox="0 0 12 10"><path d="M0 0L12 5L0 10z" fill="currentColor" /></svg></span> : null}
    </>
  );
}

function ActivityTrace({ paused }: { paused: boolean }) {
  const failed = readings.find((r) => r.failed);
  const gap = 0.022;
  const segs: [number, number, boolean][] = failed
    ? [[0, failed.x - gap, false], [failed.x - gap, failed.x + gap, true], [failed.x + gap, pen.x, false]]
    : [[0, pen.x, false]];
  return (
    <>
      {segs.map(([a, b, missing], i) => <span key={i} className="bg-act-line" data-missing={missing || undefined} style={{ left: pct(a), width: pct(b - a) }} />)}
      {readings.filter((r) => r.title !== 'Activity published').map((r) => <span key={r.key} className="bg-reading" data-failed={r.failed || undefined} style={{ left: pct(r.x) }}>{r.failed ? '✕ no reading' : '▮ collected'}</span>)}
      {paused
        ? <span className="bg-act-pen" data-lifted="true" style={{ left: pct(pen.x) }}><span className="bg-act-note">PEN LIFTED — scheduled runs paused (demo)</span></span>
        : <span className="bg-act-pen" style={{ left: pct(pen.x) }} />}
      <span className="bg-reading bg-reading-next" data-cancelled={paused || undefined} style={{ left: pct(xOf(NEXT_RUN)) }}>{paused ? 'next run held' : '▯ next 12:00'}</span>
    </>
  );
}

type StripProps = { page: Page; nav: React.ReactNode; still: boolean; selectedAt?: string; sessionSpan?: [string, string]; paused?: boolean };

/** Demo strip: fictional week, demo clock, and the page's own mark. */
export function RecordStrip({ page, nav, still, selectedAt, sessionSpan, paused = false }: StripProps) {
  const activity = page === 'activity';
  const auto = useAutoMode() && page === 'memory';
  const meta = auto
    ? <><b>Automatic memory</b> · synthetic preview · its own sample paper, 1 Jul – 31 Oct 2026</>
    : activity
    ? <><b>Second instrument</b> · Activity producer · separate paper · demo readings</>
    : <><b>Chart No. 40</b> · week of 28 Sep 2026 · <span className="bg-clock">demo clock Thu 1 Oct, 14:44</span></>;
  let overlay: React.ReactNode = null;
  let summary = 'Fictional demo chart, week of 28 September 2026, drawn up to the demo clock, Thursday 1 October 14:44.';
  if (page === 'memory' && selectedAt) {
    if (onChart(selectedAt)) { overlay = <span className="bg-cursor" style={{ left: pct(xOf(selectedAt)) }}><span>{dayLabel(selectedAt)}</span></span>; summary += ' Selected record marked at ' + dayLabel(selectedAt) + '.'; }
    else { overlay = <span className="bg-offchart">◂ selected record: {dayLabel(selectedAt)} · on an earlier chart</span>; summary += ' Selected record is on an earlier chart.'; }
  }
  if (page === 'sessions' && sessionSpan) {
    if (onChart(sessionSpan[0])) { const a = xOf(sessionSpan[0]); const b = Math.max(xOf(sessionSpan[1]), a + 0.004); overlay = <span className="bg-band" style={{ left: pct(a), width: pct(b - a) }}><span>session</span></span>; }
    else overlay = <span className="bg-offchart">◂ this session: {dayLabel(sessionSpan[0])} · on an earlier chart</span>;
  }
  return (
    <div className="bg-strip" data-page={page} data-paper={activity ? 'activity' : 'memory'} data-auto={auto || undefined}>
      <div className="bg-strip-head">
        {nav}
        <div className="bg-strip-meta">{meta}</div>
      </div>
      {page === 'home' || auto ? null : (
        <div className="bg-strip-chart" role="img" aria-label={activity ? 'Fictional demo readings of the separate Activity producer: collected on 1 October, no reading on 30 September' + (paused ? ', scheduled runs paused in the demo.' : '.') : summary}>
          <Paper variant={activity ? 'activity' : 'memory'}>
            {activity ? <ActivityTrace paused={paused} /> : <Trace still={still} showMarks tip />}
            {overlay}
            {!activity && earlier ? <span className="bg-earlier">{earlier} earlier records ◂</span> : null}
          </Paper>
        </div>
      )}
    </div>
  );
}

/** Native strip: blank paper, never a fabricated trace; the drum stops while no Vault is open. */
export function NativeStrip({ page, nav }: { page: Page; nav: React.ReactNode }) {
  const { status, vaultChanging } = useStatus();
  const state = status?.vault?.state;
  const stopped = page !== 'activity' && (!status || exiting(status) || vaultChanging || state !== 'open');
  const why = !status ? 'reading Memory status' : exiting(status) ? 'Runtime is exiting' : vaultChanging ? 'finishing Vault change' : state === 'locked' ? 'Vault locked' : 'no Vault open';
  return (
    <div className="bg-strip" data-page={page} data-paper={page === 'activity' ? 'activity' : 'memory'} data-drum={stopped ? 'stopped' : undefined}>
      <div className="bg-strip-head">
        {nav}
        <div className="bg-strip-meta">{page === 'activity' ? <><b>Second instrument</b> · Activity producer · separate paper</> : <><b>Live shell</b> · trace not plotted in this prototype</>}</div>
      </div>
      {page === 'home' ? null : (
        <div className="bg-strip-chart">
          <Paper variant={page === 'activity' ? 'activity' : 'memory'} days={false}>
            {stopped ? <span className="bg-drum">Drum stopped · {why}</span> : null}
          </Paper>
        </div>
      )}
    </div>
  );
}

export { DEMO_CLOCK, yAt };
