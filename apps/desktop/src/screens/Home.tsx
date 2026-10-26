import React from "react";
import type { DemoView } from "../App";
import { demoData as D } from "../demo-data";
import { Trace } from "../theme/RecordStrip";
import { DEMO_CLOCK, DOM_CELLS, DOM_MS, DOM_START, domMarks, domPath, domPen, pct, yAt } from "../theme/chart";
import { homeSpec } from "../theme/mapSpecs";
import { clearViews, useTimeView } from "../theme/timeview";

import { t } from '../i18n/index.ts';
// The record chart, enlarged. The page shows four days of a three-week record;
// the time map in the strip under the title bar moves the frame, and this
// chart pans with it. Each status line is a note whose leader runs back to the
// moment it was recorded on the trace (when that moment is on screen).
const PANE = 0.58;          // the chart's share of the paper; the notes take the rest
const NOTES_LEFT = 0.605;
const NOTE_TOPS = [0.04, 0.28, 0.52, 0.76];

export default function Home({ view }: { view: DemoView }) {
  const { home, nav, still } = view;
  const v = useTimeView('home', homeSpec.init);
  // Leaders are drawn in screen space, so they wait until the chart has settled.
  const [settled, setSettled] = React.useState(true);
  React.useEffect(() => {
    if (v.seq === 0) return;
    setSettled(false);
    const id = setTimeout(() => setSettled(true), 360);
    return () => clearTimeout(id);
  }, [v.seq]);
  React.useEffect(() => () => clearViews('home'), []);

  const lastWrite = D.MEM.filter((m) => m.status === 'active' && m.kind !== 'session_checkpoint').map((m) => m.created).sort().slice(-1)[0];
  const lastTurn = D.SESS[0].turns[D.SESS[0].turns.length - 1][2];
  const checkpointAt = D.MEM.find((m) => m.key === 'm7')?.created ?? lastTurn;
  const compiledAt = '2026-10-01T06:44:02.318Z';
  const targets = [lastWrite, compiledAt, lastTurn, checkpointAt];

  const inPane = (ms: number) => (ms - v.start) / v.span;      // 0 at the pane's left edge, 1 at its right edge
  const penFrac = inPane(DEMO_CLOCK);
  const penOn = penFrac >= 0 && penFrac <= 1;
  const panWidth = (DOM_MS / v.span) * 100;                    // the three weeks laid out at pane scale, in % of the pane
  const shift = -((v.start - DOM_START) / DOM_MS) * 100;       // % of the laid-out width
  const layer = { width: panWidth.toFixed(3) + '%', transform: `translateX(${shift.toFixed(4)}%)` };
  const showLeaders = settled || !!still;
  return (
<section data-screen-label="Home" className="qr17 bg-home">
<div className="bg-home-head">
<div className="bg-readout">
<div className="qr1">
Enouia Runtime · Thursday 1 October 2026 · <span className="bg-clock">{t("demo clock")}</span>
</div>
<div className="bg-now" aria-label={t("Demo clock 14:44")}>14<span>:</span>44</div>
</div>
<div className="bg-home-sub">
<span className="bg-recording">{t("Recording.")}</span> {home.memoryLine}.
</div>
</div>
<div className="bg-home-chart">
<div className="bg-paper bg-paper-big" data-by={v.by}>
<div className="bg-pane" style={{ width: pct(PANE) }}>
<div className="bg-pan bg-pan-grid" style={layer} aria-hidden="true">
{DOM_CELLS.map((c) => <span key={c.i} className="bg-day" data-today={c.today || undefined} style={{ left: pct(c.i / DOM_CELLS.length) }}>{c.dow} <b>{c.date}</b></span>)}
</div>
<div className="bg-draw" data-draw={!still ? 'on' : undefined} role="img" aria-label={`Fictional demo trace of the conversation, four days at a time, drawn up to the demo clock, Thursday 1 October 14:44. The frame in the time map above shows which four days are on screen.`}>
<div className="bg-pan bg-pan-ink" style={layer}>
<Trace d={domPath} marks={domMarks} penAt={domPen} still={!!still} draw={false} />
</div>
</div>
<h1 className="qr2 bg-here" data-away={!penOn || undefined} style={{ right: pct(penOn ? 1 - penFrac + 0.04 : 0.03) }}>
{t("I'm here.")}
</h1>
</div>
<svg className="bg-leaders" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true" data-hidden={!showLeaders || undefined}>
{targets.map((at, i) => { const f = inPane(Date.parse(at)); return f >= 0 && f <= 1 ? <path key={i} d={`M${(PANE * f * 1000).toFixed(1)} ${(yAt(at) * 1000).toFixed(1)} L${(NOTES_LEFT * 1000 - 18).toFixed(1)} ${(NOTE_TOPS[i] * 1000 + 6).toFixed(1)} H${(NOTES_LEFT * 1000).toFixed(1)}`} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" /> : null; })}
</svg>
<div className="qr13 bg-notes" style={{ left: pct(NOTES_LEFT) }}>
<button onClick={nav.memory.go} className="qr12 bg-note" style={{ top: pct(NOTE_TOPS[0]) }} type="button">
<span className="bg-note-time">{D.tTime(lastWrite)}</span>
<span className="qr9">
{t("Memory Vault")}
</span>
<span className="qr10">
{home.memoryLine}
</span>
<span className="qr11">
{t("model_only")}
</span>
</button>
<button onClick={nav.context.go} className="qr12 bg-note" style={{ top: pct(NOTE_TOPS[1]) }} type="button">
<span className="bg-note-time">{home.capTime}</span>
<span className="qr9">
{t("Context")}
</span>
<span className="qr10">
{t('Compiled at {time} for “{query}”', { time: home.capTime, query: 'vault adapter rebuild trigger' })}
</span>
<span className="qr11">
{home.capShort}
</span>
</button>
<button onClick={nav.sessions.go} className="qr12 bg-note" style={{ top: pct(NOTE_TOPS[2]) }} type="button">
<span className="bg-note-time">{home.sesTime}</span>
<span className="qr9">
{t("Current session")}
</span>
<span className="qr10">
Vault adapter planning · {t('{n} turns, last at {time}', { n: 12, time: home.sesTime })}
</span>
<span className="qr11">
{home.sesShort}
</span>
</button>
<button onClick={home.openCheckpoint} className="qr12 bg-note" style={{ top: pct(NOTE_TOPS[3]) }} type="button">
<span className="bg-note-time">{home.cpTime}</span>
<span className="qr9">
{t("Checkpoint")}
</span>
<span className="qr10">
{t('Turns {a}–{b} covered at {time}', { a: 1, b: 8, time: home.cpTime })}
</span>
<span className="qr11">
{home.cpShort}
</span>
</button>
</div>
</div>
</div>
<div className="bg-home-foot">
<div className="qr6 bg-legend">
<span className="bg-legend-k">{t("Legend")}</span>
<span className="qr3">

</span>
<span>
{t("Fictional demo on this device")}
</span>
<span className="qr4">
·
</span>
<span>
{t("Core models v1")}
</span>
<span className="qr4">
·
</span>
<span>
{t("Mock provider")}
</span>
<span className="qr4">
·
</span>
<span className="qr5">
{t("Vault adapter not connected")}
</span>
<span className="bg-legend-key"><i data-kind="canonical" /> {t("canonical write")} <i data-kind="candidate" /> {t("candidate")} <i data-kind="checkpoint" /> {t("checkpoint")}</span>
</div>
<div className="qr15 bg-margin">
<div className="qr9">
{t("Left open last time")}
</div>
<div className="qr14">
{t("Choose the index rebuild trigger.")}
</div>
<div className="qr14">
{t("Accept the first Windows port boundary.")}
</div>
</div>
</div>
</section>
  );
}
