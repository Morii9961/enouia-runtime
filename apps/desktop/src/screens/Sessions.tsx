import React from "react";
import type { DemoView } from "../App";
import { demoData as D } from "../demo-data";
import { sessionSpec, sessionStretch } from "../theme/mapSpecs";
import { clearViews, setWindow, useTimeView } from "../theme/timeview";

import { t } from '../i18n/index.ts';
// Turns sit on a time ruler: the space between two events is proportional to
// the real interval (2 px per minute, capped at 48 px). A checkpoint is a
// light bracket along the ruler over the turns it covers.
function rulerFor(sessionKey: string | undefined, count: number) {
  const session = D.SESS.find((x) => x.key === sessionKey);
  if (!session) return Array.from({ length: count }, () => ({ gap: 0, minutes: 0, bracket: undefined as string | undefined }));
  const at: number[] = []; const turnOf: (number | null)[] = [];
  session.turns.forEach((turn, i) => { at.push(Date.parse(turn[2])); turnOf.push(i + 1); session.checkpoints.filter((c) => c.after === i + 1).forEach((c) => { at.push(Date.parse(c.at)); turnOf.push(null); }); });
  const covered = session.checkpoints.map((c) => { const m = D.MEM.find((x) => x.key === c.mem); return m?.covered ?? [1, c.after]; });
  return at.map((t, i) => {
    const minutes = i ? Math.max(0, (t - at[i - 1]) / 60000) : 0;
    const n = turnOf[i]; let bracket: string | undefined;
    if (n != null) for (const [a, b] of covered) if (n >= a && n <= b) bracket = a === b ? 'only' : n === a ? 'start' : n === b ? 'end' : 'mid';
    return { gap: Math.min(48, Math.round(minutes * 2)), minutes: Math.round(minutes), bracket };
  });
}

type Anchor = { y: number; t: number };
/** Time at a scroll position, interpolating between the turns' positions (the ruler is proportional, not linear in scroll). */
const timeAt = (y: number, a: Anchor[], lo: number, hi: number) => {
  if (y <= a[0].y) return lo;
  if (y >= a[a.length - 1].y) return hi;
  let i = 1; while (a[i].y < y) i++;
  return a[i - 1].t + ((y - a[i - 1].y) / (a[i].y - a[i - 1].y || 1)) * (a[i].t - a[i - 1].t);
};
const scrollFor = (t: number, a: Anchor[]) => {
  if (t <= a[0].t) return 0;
  if (t >= a[a.length - 1].t) return a[a.length - 1].y;
  let i = 1; while (a[i].t < t) i++;
  return a[i - 1].y + ((t - a[i - 1].t) / (a[i].t - a[i - 1].t || 1)) * (a[i].y - a[i - 1].y);
};
const stillNow = () => typeof window !== 'undefined' && (!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !!document.querySelector('[data-motion="reduced"]'));

export default function Sessions({ view }: { view: DemoView }) {
  const { ctx, nav, ses, sessList } = view;
  const key = sessList.find((x) => x.selected)?.key ?? D.SESS[0].key;
  const ruler = rulerFor(key, ses.events.length);

  // The time map above the page follows this transcript's scroll, and moving its frame scrolls the transcript.
  const spec = React.useMemo(() => sessionSpec(key), [key]);
  const stretch = React.useMemo(() => sessionStretch(key), [key]);
  const v = useTimeView(spec.key, spec.init);
  const scroller = React.useRef<HTMLDivElement>(null);
  const track = React.useRef<HTMLDivElement>(null);
  const anchors = React.useCallback((): Anchor[] => {
    const sc = scroller.current, tr = track.current; if (!sc || !tr) return [];
    const base = sc.getBoundingClientRect().top - sc.scrollTop;
    return (Array.from(tr.children) as HTMLElement[]).map((el, i) => ({ y: el.getBoundingClientRect().top - base + (parseFloat(el.style.getPropertyValue('--gap')) || 0) + 21, t: stretch.at[i] })).filter((a) => a.t != null);
  }, [stretch]);
  React.useEffect(() => {
    const sc = scroller.current; if (!sc) return;
    sc.scrollTop = 0;
    let raf = 0;
    const report = () => {
      const a = anchors(); if (a.length < 2) return;
      const [lo, hi] = stretch.domain;
      const top = timeAt(sc.scrollTop, a, lo, hi), bottom = timeAt(sc.scrollTop + sc.clientHeight, a, lo, hi);
      setWindow(spec.key, top, Math.max(bottom - top, 60e3), stretch.domain, 'scroll');
    };
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(report); };
    report();
    sc.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { cancelAnimationFrame(raf); sc.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, [spec, stretch, anchors]);
  React.useEffect(() => { if (v.by === 'map' || v.by === 'drag') { const sc = scroller.current, a = anchors(); if (sc && a.length > 1) sc.scrollTo({ top: Math.max(0, scrollFor(v.start, a)), behavior: v.by === 'map' && !stillNow() ? 'smooth' : 'auto' }); } }, [v.seq]);
  React.useEffect(() => () => clearViews('sessions'), []);
  return (
<section data-screen-label="Sessions" className="qr171">
<aside className="qr136">
<div className="qr20">
<h1 className="qr18">
{t("Sessions")}
</h1>
<div className="qr19">
{t("Append-only. Nothing is rewritten.")}
</div>
</div>
<div className="qr135">
{sessList.map((ss, ssIndex) => <React.Fragment key={ss.key}>
<button onClick={ss.onClick} aria-pressed={ss.selected} className="qr134" type="button">
<span className="qr133">
{ss.title}
</span>
<span className="qr19">
{ss.meta}
</span>
</button>
</React.Fragment>)}
</div>
</aside>
<div className="qr161" ref={scroller}>
<div className="qr137">
<div className="qr29">
{ses.title}
</div>
<div className="qr19">
{ses.day}
</div>
<div className="qr30" />
<div className="bg-ruler-note">Spacing = real time · 2 px per minute, capped</div>
</div>
<div className="qr160" ref={track}>
{ses.events.map((ev, evIndex) => <React.Fragment key={ses.title + ev.seq}>
<div className="qr159 bg-turn" data-bracket={ruler[evIndex]?.bracket} data-checkpoint={ev.isCheckpoint || undefined} style={{ '--gap': (ruler[evIndex]?.gap ?? 0) + 'px' } as React.CSSProperties}>
{(ruler[evIndex]?.minutes ?? 0) >= 4 ? <span className="bg-gap" aria-hidden="true">+{ruler[evIndex].minutes} min</span> : null}
<span className="qr138">
{ev.seq}
</span>
<span className="qr139">
{ev.time}
</span>
<span className="qr142">
<span className="qr140">

</span>
<span className="qr141" style={{"width": ev.dot, "height": ev.dot, "background": ev.dotColor}}>

</span>
</span>
<div className="qr158">
{ev.isTurn ? <>
<div className="qr149">
<div className="qr145">
<span className="qr143" style={{"color": ev.roleColor}}>
{ev.role}
</span>
<span className="qr144">
turn {ev.n} · {ev.turnShort}
</span>
</div>
<div className="qr146" style={{"color": ev.textColor}}>
{ev.text}
</div>
{ev.writes.map((w, wIndex) => <React.Fragment key={w.key}>
<button onClick={w.onClick} className="qr148" data-kind={w.label.startsWith('Candidate') ? 'candidate' : 'canonical'} type="button">
<span className="qr36" style={{"background": w.color}}>

</span>
<span>
{w.label}
</span>
<span className="qr147">
{w.ref}
</span>
</button>
</React.Fragment>)}
</div>
</> : null}
{ev.isCheckpoint ? <>
<div className="qr157">
<div className="qr153">
<span className="qr150">
{t("Checkpoint created")}
</span>
<span className="qr151">
covers turns {ev.covered}
</span>
<div className="qr30">

</div>
<button onClick={ev.onClick} className="qr152" type="button">
{ev.ref}
</button>
</div>
<div className="qr154">
{ev.lastState}
</div>
{ev.loops.map((o, oIndex) => <React.Fragment key={oIndex}>
<div className="qr156">
<span className="qr155">

</span>
{o}
</div>
</React.Fragment>)}
</div>
</> : null}
</div>
</div>
</React.Fragment>)}
</div>
</div>
<aside className="qr170">
<div className="qr15">
<div className="qr55">
{t("Session")}
</div>
{ses.meta.map((r, rIndex) => <React.Fragment key={r.k}>
<div className="qr162">
<span className="qr35">
{r.k}
</span>
<span className="qr62">
{r.v}
</span>
</div>
</React.Fragment>)}
</div>
<div className="qr164">
<div className="qr55">
{t("Checkpoints")}
</div>
{ses.noCheckpoints ? <>
<div className="qr108">
{t("None yet.")}
</div>
</> : null}
{ses.checkpoints.map((c, cIndex) => <React.Fragment key={c.ref}>
<button onClick={c.onClick} className="qr163" type="button">
<span>
Turns {c.covered}
</span>
<span className="qr147">
{c.ref}
</span>
</button>
</React.Fragment>)}
</div>
<div className="qr164">
<div className="qr55">
{t("Memory writes")}
</div>
{ses.noWrites ? <>
<div className="qr108">
{t("None from this session.")}
</div>
</> : null}
{ses.writes.map((w, wIndex) => <React.Fragment key={w.key}>
<button onClick={w.onClick} className="qr167" type="button">
<span className="qr165">
{w.text}
</span>
<span className="qr166">
{w.label} · {t('turn {n}', { n: w.turn ?? '' })}
</span>
</button>
</React.Fragment>)}
</div>
<div className="qr169">
<div className="qr55">
{t("Context snapshot")}
</div>
<div className="qr85">
{t("Session v1 does not persist capsules. The last compiled capsule is on the Context Surface.")}
</div>
{ses.hasCapsule ? <>
<button onClick={nav.context.go} className="qr168" type="button">
{ctx.capShort}
</button>
</> : null}
</div>
</aside>
</section>
  );
}
