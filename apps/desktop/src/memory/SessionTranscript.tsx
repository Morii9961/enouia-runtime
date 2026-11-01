import { useCallback, useEffect, useMemo, useRef, type CSSProperties, type RefObject } from 'react';
import { call, type J } from './client';
import { SessionEventBody, SessionEventMetadata } from './SessionEventBody';
import { sessionRuler } from './sessionTime';
import { lendMap, type MapSpec } from '../theme/TimeMap';
import { clearViews, setWindow, useTimeView } from '../theme/timeview';
import { nativeDate } from '../theme/nativeTime';
import { motionReduced } from '../theme/motion';
import { msg, t } from '../i18n/index';

type Props = {
  detail: J; branch: { sessionId: string; branchId: string }; disabled: boolean; mapUnavailable: boolean;
  inspect: (id: string) => void; request: typeof call; scroller: RefObject<HTMLDivElement | null>;
};
type Anchor = { y: number; at: number };

export default function SessionTranscript({ detail, branch, disabled, mapUnavailable, inspect, request, scroller }: Props) {
  const track = useRef<HTMLOListElement>(null);
  const ruler = useMemo(() => sessionRuler(detail.transcript), [detail]);
  const key = `native-session:${branch.sessionId}:${branch.branchId}`;
  const spec = useMemo<MapSpec | null>(() => {
    if (!ruler.ordered) return null;
    const times = ruler.times as number[];
    const lo = times[0] - 60_000, hi = times[times.length - 1] + 60_000, len = hi - lo;
    const time = (at: number) => nativeDate(at, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return {
      key, label: msg('Time map of loaded session events'), cells: Math.max(8, Math.min(60, Math.ceil(len / 60_000))),
      ticks: times.map((at, i) => ({ at: (at - lo) / len, tall: detail.transcript[i].kind === 'checkpoint_created' })),
      labels: [0, 0.25, 0.5, 0.75].map(f => ({ at: f, text: nativeDate(lo + f * len, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) })),
      step: Math.max(60_000, Math.round(len / 8 / 60_000) * 60_000), unit: msg('few minutes'),
      readout: (start, span) => `${time(start)} – ${time(start + span)} · UTC+8`,
      init: () => ({ start: lo, span: len, domain: [lo, hi] }),
    };
  }, [detail, ruler, key]);

  return <>
    {spec && !mapUnavailable && <TranscriptTimeMap spec={spec} times={ruler.times as number[]} scroller={scroller} track={track} />}
    <p className="bg-ruler-note">{t('Saved event spacing · 2 px per minute, capped at 48 px · UTC+8')}</p>
    {!ruler.ordered && <p className="mem-muted" role="note">{t('A time map needs known event times in recorded order. The transcript stays in its saved order.')}</p>}
    <ol ref={track} className="mem-transcript mem-native-transcript" aria-describedby={detail.transcript.length >= 200 ? 'mem-transcript-bound' : undefined}>
      {detail.transcript.map((event: J, i: number) => <li key={event.eventId} className={`mem-event mem-event-${event.kind}`}
        data-checkpoint={event.kind === 'checkpoint_created' || undefined} style={{ '--event-gap': `${ruler.gaps[i].pixels}px` } as CSSProperties}>
        <div className="native-event-clock">
          {ruler.gaps[i].minutes >= 4 && <span className="native-event-gap" aria-hidden="true">+{ruler.gaps[i].minutes} min</span>}
          {ruler.times[i] == null ? <span>{t('time unavailable')}</span> : <time dateTime={event.occurredAt} title={event.occurredAt}>{nativeDate(ruler.times[i]!, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })}</time>}
        </div>
        <div className="native-event-body">
          <span className="mem-muted mem-mono"><SessionEventMetadata kind={event.kind} deliveryState={event.deliveryState} showTime={false} /></span>
          {event.text != null && <SessionEventBody kind={event.kind} text={event.text} context={{ ...branch, disabled, inspect, request }} />}
        </div>
      </li>)}
    </ol>
  </>;
}


function TranscriptTimeMap({ spec, times, scroller, track }: {
  spec: MapSpec; times: number[]; scroller: RefObject<HTMLDivElement | null>; track: RefObject<HTMLOListElement | null>;
}) {
  const key = spec.key;
  const view = useTimeView(key, spec.init);
  useEffect(() => {
    lendMap(spec);
    return () => lendMap(null);
  }, [spec]);
  useEffect(() => () => clearViews(key), [key]);

  const anchors = useCallback((): Anchor[] => {
    const sc = scroller.current, list = track.current;
    if (!sc || !list) return [];
    const base = sc.getBoundingClientRect().top + sc.clientTop - sc.scrollTop;
    return Array.from(list.children).map((el, i) => ({ y: el.getBoundingClientRect().top - base, at: times[i] }));
  }, [scroller, times]);
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const { domain } = spec.init();
    const report = () => {
      const points = anchors();
      if (points.length < 1 || sc.clientHeight <= 0) return;
      const timeAt = (y: number) => {
        if (y <= points[0].y) return domain[0];
        if (y >= points[points.length - 1].y) return domain[1];
        let i = 1; while (points[i].y < y) i++;
        const a = points[i - 1], b = points[i];
        return a.at + (y - a.y) / (b.y - a.y || 1) * (b.at - a.at);
      };
      const top = timeAt(sc.scrollTop), bottom = timeAt(sc.scrollTop + sc.clientHeight);
      const span = Math.min(domain[1] - domain[0], Math.max(60_000, bottom - top));
      setWindow(key, Math.min(top, domain[1] - span), span, domain, 'scroll');
    };
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(report); };
    report();
    sc.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(sc); if (track.current) observer?.observe(track.current);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); sc.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, [scroller, spec, key, anchors]);
  useEffect(() => {
    if ((view.by !== 'map' && view.by !== 'drag')) return;
    const points = anchors(), sc = scroller.current;
    if (!sc || points.length === 0) return;
    let top = 0;
    if (view.start >= points[points.length - 1].at) top = points[points.length - 1].y;
    else if (view.start > points[0].at) {
      let i = 1; while (points[i].at < view.start) i++;
      const a = points[i - 1], b = points[i];
      top = a.y + (view.start - a.at) / (b.at - a.at || 1) * (b.y - a.y);
    }
    sc.scrollTo({ top, behavior: view.by === 'map' && !motionReduced() ? 'smooth' : 'auto' });
  }, [view, scroller, anchors, spec]);

  return null;
}
