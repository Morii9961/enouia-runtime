import { useEffect } from 'react';
import type { J } from './client';
import { msg, t } from '../i18n/index';
import type { MapSpec } from '../theme/TimeMap';
import type { RecordedTrace } from '../theme/recordedTrace';
import { clearViews, useTimeView } from '../theme/timeview';
import { DAY, nativeDate, observedCommit } from '../theme/nativeTime';
import VaultAdmissionNotice from '../shell/VaultAdmissionNotice';

type Note = { title: string; line: string; route: { go: () => void }; detail: string; time: string };
type Props = { nav: J; timeline: MapSpec; now: number; open: boolean; vault: J; reviewLine: string; label: string; phase: string; readonlyEntry?: boolean; readonlyNotes?: Note[];
  /** Registered entry: the trace from recorded times; null while it is read, undefined when there is none. */
  recorded?: { trace: RecordedTrace | null; failed: boolean } | null };

const MARK = { canonical: msg('Formation, adopted'), candidate: msg('Formation, staged'), superseded: msg('Correction') } as Record<string, string>;
const PANE = 0.58, NOTES_LEFT = 0.605;
const full = (at: number) => nativeDate(at, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** The selected Home composition, with only what the current status receipt knows. */
export default function NativeHome({ nav, timeline, now, open, vault, reviewLine, label, phase, readonlyEntry = false, readonlyNotes, recorded }: Props) {
  const view = useTimeView(timeline.key, timeline.init);
  useEffect(() => () => clearViews(timeline.key), [timeline.key]);
  const [start, end] = view.domain;
  const days = Math.round((end - start) / DAY);
  const inPane = (at: number) => (at - view.start) / view.span;
  const visible = (at: number | null): at is number => at != null && at >= view.start && at < view.start + view.span;
  const commit = open ? observedCommit(vault) : null;
  const fraction = commit == null ? 0 : (commit - start) / (end - start);
  const layer = { width: `${(end - start) / view.span * 100}%`, transform: `translateX(${-(view.start - start) / (end - start) * 100}%)` };
  const trace = recorded?.trace ?? null;
  // Registered entry: what the frame holds, from the recorded times.
  const frameDays = trace ? Array.from({ length: Math.round(view.span / DAY) }, (_, i) => Math.round((view.start - start) / DAY) + i) : [];
  const turnsInView = trace ? frameDays.reduce((sum, i) => sum + (trace.counts[i] ?? 0), 0) : 0;
  const writesInView = trace ? trace.marks.filter(m => visible(m.at)).reduce((sum, m) => sum + m.count, 0) : 0;
  const latestWrite = trace?.marks.length ? Math.max(...trace.marks.map(m => m.at)) : null;
  const traceNote = recorded
    ? recorded.failed ? t('Recorded times could not be read; the line is not drawn.')
      : !trace ? t('Reading recorded conversation times…')
      : turnsInView === 0 && trace.latestTurn != null
        ? t('No captured turns in these days; the latest was {date}. {writes} Memory writes in view.', { date: full(trace.latestTurn), writes: writesInView })
        : t('{turns} captured turns and {writes} Memory writes in these days. The line is a smoothed count of recorded turn times.', { turns: turnsInView, writes: writesInView })
    : t(readonlyEntry ? 'Registered library · no time trace is available' : 'Latest Vault commit only; continuous trace unavailable');
  const penOn = trace != null && visible(now);
  const clock = nativeDate(now, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).split(':');
  const notes = readonlyNotes ?? (readonlyEntry ? [
    { title: t('Native memory catalog'), line: reviewLine, route: nav.memory, detail: phase, time: '—' },
    { title: t('Sources'), line: t('Open a record to inspect its quoted source.'), route: nav.memory, detail: '—', time: '—' },
    { title: t('Context'), line: t('Unavailable in this read-only entry'), route: nav.context, detail: '—', time: '—' },
    { title: t('Sessions'), line: t('Unavailable in this read-only entry'), route: nav.sessions, detail: '—', time: '—' },
  ] : [
    { title: t('Memory Vault'), line: reviewLine, route: nav.memory, detail: phase, time: commit == null ? '—' : nativeDate(commit, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) },
    { title: t('Context'), line: t('Read saved Capsules in Context'), route: nav.context, detail: '—', time: '—' },
    { title: t('Sessions'), line: t('Read saved conversations in Sessions'), route: nav.sessions, detail: '—', time: '—' },
    { title: t('Checkpoint'), line: t('Read saved checkpoints in Sessions'), route: nav.sessions, detail: '—', time: '—' },
  ]);
  // Leaders run from a note to its moment on the trace: Formation to the latest
  // write, Sessions to the latest captured turn (registered entry), or the
  // Workspace note to its latest commit.
  const leaders: { at: number; y: number; note: number }[] = trace
    ? [[latestWrite, 1], [trace.latestTurn, 2]].filter((p): p is [number, number] => visible(p[0])).map(([at, note]) => ({ at, y: trace.y(at), note }))
    : visible(commit) ? [{ at: commit, y: 0.6, note: 0 }] : [];
  return <section data-screen-label="Home" className="qr17 bg-home bg-native-home">
    <div className="bg-home-head">
      <div className="bg-readout">
        <div className="qr1">Enouia Runtime · {nativeDate(now, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · {t('Device clock')} · UTC+8</div>
        <div className="bg-now" aria-label={`${t('Device clock')} ${clock.join(':')} UTC+8`}>{clock[0]}<span>:</span>{clock[1]}</div>
      </div>
      <div className="bg-home-sub"><VaultAdmissionNotice /><span className="bg-recording">{label}{open && vault?.rootName ? ` · ${vault.rootName}` : ''}</span></div>
    </div>
    <div className="bg-home-chart">
      <div className="bg-paper bg-paper-big" data-by={view.by} data-unavailable={(!open && !trace) || undefined}>
        <div className="bg-pane" style={{ width: `${PANE * 100}%` }}>
          <div className="bg-pan bg-pan-grid" style={{ ...layer, backgroundSize: `calc(100% / ${days}) 100%` }} aria-hidden="true">
            {Array.from({ length: days }, (_, i) => <span key={i} className="bg-day" style={{ left: `${i / days * 100}%` }}>{nativeDate(start + i * DAY, { month: 'short', day: 'numeric' })}</span>)}
          </div>
          <div className="bg-draw" role="img" aria-label={traceNote}>
            <div className="bg-pan bg-pan-ink" style={layer}>
              {trace ? <>
                <div className="bg-trace-clip"><svg className="bg-trace" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
                  <path d={trace.path(now)} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                </svg></div>
                {trace.marks.map(m => <span key={`${m.at}:${m.kind}`} className="bg-mark" data-kind={m.kind} data-count={m.count}
                  title={`${t(MARK[m.kind])} · ${m.count} · ${full(m.at)}`} style={{ left: `${(m.at - start) / (end - start) * 100}%`, top: `${trace.y(m.at) * 100}%` }} />)}
                {now >= start && now < end ? <span className="bg-pen" style={{ left: `${(now - start) / (end - start) * 100}%`, top: `${trace.y(now) * 100}%` }} aria-hidden="true"><svg width="10" height="8" viewBox="0 0 10 8"><path d="M0 0L10 4L0 8z" fill="currentColor" /></svg></span> : null}
              </> : null}
              {commit != null && commit >= start && commit < end ? <span className="bg-mark" data-kind="vault-commit" style={{ left: `${fraction * 100}%`, top: '60%' }} /> : null}
            </div>
          </div>
          <h1 className="qr2 bg-here" lang="en" data-away={(trace && !penOn) || undefined}
            style={trace && penOn ? { right: `${Math.max(0, (1 - inPane(now) + 0.04) * 100)}%` } : undefined}>I'm here.</h1>
          <p className="bg-native-trace-note">{traceNote}</p>
        </div>
        {leaders.length ? <svg key={view.seq} className="bg-leaders bg-native-leader" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
          {leaders.map(l => <path key={l.note} d={`M${(PANE * inPane(l.at) * 1000).toFixed(1)} ${(l.y * 1000).toFixed(1)} L${(NOTES_LEFT * 1000 - 18).toFixed(1)} ${((l.note / 4 + 0.03) * 1000).toFixed(1)} H${NOTES_LEFT * 1000}`}
            fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        </svg> : null}
        <div className="qr13 bg-notes" style={{ left: `${NOTES_LEFT * 100}%` }}>
          {notes.map((note, i) => <button key={i} onClick={note.route.go} className="qr12 bg-note" type="button">
            <span className="bg-note-time">{note.time}</span><span className="qr9">{note.title}</span>
            <span className="qr10">{note.line}</span><span className="qr11">{note.detail}</span>
          </button>)}
        </div>
      </div>
    </div>
    <div className="bg-home-foot">
      <div className="qr6 bg-legend"><span className="bg-legend-k">{t('Legend')}</span>
        {trace ? <span className="bg-legend-key"><span className="bg-legend-line" aria-hidden="true" /> {t('captured turns')} <i data-kind="canonical" /> {t(MARK.canonical)} <i data-kind="candidate" /> {t(MARK.candidate)} <i data-kind="superseded" /> {t(MARK.superseded)}</span>
          : <span className="bg-legend-key"><i />{open ? t('Last commit') : t('unknown')}</span>}
      </div>
      <div className="qr15 bg-margin">
        <div className="qr9">{open ? t('Last commit') : trace ? t('Latest Memory write') : label}</div>
        <div className="qr14">{commit != null ? full(commit) + ' · UTC+8' : latestWrite != null ? full(latestWrite) + ' · UTC+8' : '—'}</div>
      </div>
    </div>
  </section>;
}
