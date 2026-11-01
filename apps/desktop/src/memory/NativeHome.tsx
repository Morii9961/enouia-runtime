import { useEffect } from 'react';
import type { J } from './client';
import { t } from '../i18n/index';
import type { MapSpec } from '../theme/TimeMap';
import { clearViews, useTimeView } from '../theme/timeview';
import { DAY, nativeDate, observedCommit } from '../theme/nativeTime';
import VaultAdmissionNotice from '../shell/VaultAdmissionNotice';

type Props = { nav: J; timeline: MapSpec; now: number; open: boolean; vault: J; reviewLine: string; label: string; phase: string };

/** The selected Home composition, with only what the current status receipt knows. */
export default function NativeHome({ nav, timeline, now, open, vault, reviewLine, label, phase }: Props) {
  const view = useTimeView(timeline.key, timeline.init);
  useEffect(() => () => clearViews(timeline.key), [timeline.key]);
  const [start, end] = view.domain;
  const commit = open ? observedCommit(vault) : null;
  const inView = commit != null && commit >= view.start && commit < view.start + view.span;
  const fraction = commit == null ? 0 : (commit - start) / (end - start);
  const layer = { width: `${(end - start) / view.span * 100}%`, transform: `translateX(${-(view.start - start) / (end - start) * 100}%)` };
  const clock = nativeDate(now, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).split(':');
  const notes = [
    { title: t('Memory Vault'), line: reviewLine, route: nav.memory, detail: phase, time: commit == null ? '—' : nativeDate(commit, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) },
    { title: t('Context'), line: t('Read saved Capsules in Context'), route: nav.context, detail: '—', time: '—' },
    { title: t('Sessions'), line: t('Read saved conversations in Sessions'), route: nav.sessions, detail: '—', time: '—' },
    { title: t('Checkpoint'), line: t('Read saved checkpoints in Sessions'), route: nav.sessions, detail: '—', time: '—' },
  ];
  return <section data-screen-label="Home" className="qr17 bg-home bg-native-home">
    <div className="bg-home-head">
      <div className="bg-readout">
        <div className="qr1">Enouia Runtime · {nativeDate(now, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · {t('Device clock')} · UTC+8</div>
        <div className="bg-now" aria-label={`${t('Device clock')} ${clock.join(':')} UTC+8`}>{clock[0]}<span>:</span>{clock[1]}</div>
      </div>
      <div className="bg-home-sub"><VaultAdmissionNotice /><span className="bg-recording">{label}{open && vault?.rootName ? ` · ${vault.rootName}` : ''}</span></div>
    </div>
    <div className="bg-home-chart">
      <div className="bg-paper bg-paper-big" data-by={view.by} data-unavailable={!open || undefined}>
        <div className="bg-pane" style={{ width: '58%' }}>
          <div className="bg-pan bg-pan-grid" style={layer} aria-hidden="true">
            {Array.from({ length: 21 }, (_, i) => <span key={i} className="bg-day" style={{ left: `${i / 21 * 100}%` }}>{nativeDate(start + i * DAY, { month: 'short', day: 'numeric' })}</span>)}
          </div>
          <div className="bg-draw" role="img" aria-label={t('Latest Vault commit only; continuous trace unavailable')}>
            <div className="bg-pan bg-pan-ink" style={layer}>
              {commit != null && commit >= start && commit < end ? <span className="bg-mark" data-kind="vault-commit" style={{ left: `${fraction * 100}%`, top: '60%' }} /> : null}
            </div>
          </div>
          <h1 className="qr2 bg-here" lang="en">I'm here.</h1>
          <p className="bg-native-trace-note">{t('Latest Vault commit only; continuous trace unavailable')}</p>
        </div>
        {inView ? <svg key={view.seq} className="bg-leaders bg-native-leader" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
          <path d={`M${(0.58 * (commit - view.start) / view.span * 1000).toFixed(1)} 600 L587 46 H605`} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg> : null}
        <div className="qr13 bg-notes" style={{ left: '60.5%' }}>
          {notes.map((note, i) => <button key={i} onClick={note.route.go} className="qr12 bg-note" type="button">
            <span className="bg-note-time">{note.time}</span><span className="qr9">{note.title}</span>
            <span className="qr10">{note.line}</span><span className="qr11">{note.detail}</span>
          </button>)}
        </div>
      </div>
    </div>
    <div className="bg-home-foot">
      <div className="qr6 bg-legend"><span className="bg-legend-k">{t('Legend')}</span><span className="bg-legend-key"><i />{open ? t('Last commit') : t('unknown')}</span></div>
      <div className="qr15 bg-margin">
        <div className="qr9">{open ? t('Last commit') : label}</div>
        <div className="qr14">{commit == null ? '—' : nativeDate(commit, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) + ' · UTC+8'}</div>
      </div>
    </div>
  </section>;
}
