import React from "react";
import type { DemoView } from "../App";
import { demoData as D } from "../demo-data";
import { Paper, Trace } from "../theme/RecordStrip";
import { pct, pen, xOf, yAt } from "../theme/chart";

// The week's chart, enlarged. Each status line is an annotation whose leader
// runs back to the moment it was recorded on the trace.
const NOTES_LEFT = 0.575;
const NOTE_TOPS = [0.05, 0.29, 0.53, 0.77];

export default function Home({ view }: { view: DemoView }) {
  const { home, nav, still } = view;
  const lastWrite = D.MEM.filter((m) => m.status === 'active' && m.kind !== 'session_checkpoint').map((m) => m.created).sort().slice(-1)[0];
  const lastTurn = D.SESS[0].turns[D.SESS[0].turns.length - 1][2];
  const checkpointAt = D.MEM.find((m) => m.key === 'm7')?.created ?? lastTurn;
  const compiledAt = '2026-10-01T06:44:02.318Z';
  const targets = [lastWrite, compiledAt, lastTurn, checkpointAt];
  return (
<section data-screen-label="Home" className="qr17 bg-home">
<div className="bg-home-head">
<div className="bg-readout">
<div className="qr1">
Enouia Runtime · Thursday 1 October 2026 · <span className="bg-clock">demo clock</span>
</div>
<div className="bg-now" aria-label="Demo clock 14:44">14<span>:</span>44</div>
</div>
<div className="bg-home-sub">
<span className="bg-recording">Recording.</span> {home.memoryLine}.
</div>
</div>
<div className="bg-home-chart">
<Paper variant="memory" className="bg-paper-big">
<Trace still={!!still} draw />
<svg className="bg-leaders" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
{targets.map((at, i) => <React.Fragment key={i}>
<path d={`M${(xOf(at) * 1000).toFixed(1)} ${(yAt(at) * 1000).toFixed(1)} L${(NOTES_LEFT * 1000 - 18).toFixed(1)} ${(NOTE_TOPS[i] * 1000).toFixed(1)} H${(NOTES_LEFT * 1000).toFixed(1)}`} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
</React.Fragment>)}
</svg>
<h1 className="qr2 bg-here" style={{ right: pct(1 - pen.x), top: pct(pen.y + 0.1) }}>
I'm here.
</h1>
<div className="qr13 bg-notes" style={{ left: pct(NOTES_LEFT) }}>
<button onClick={nav.memory.go} className="qr12 bg-note" style={{ top: pct(NOTE_TOPS[0]) }} type="button">
<span className="bg-note-time">{D.tTime(lastWrite)}</span>
<span className="qr9">
Memory Vault
</span>
<span className="qr10">
{home.memoryLine}
</span>
<span className="qr11">
model_only
</span>
</button>
<button onClick={nav.context.go} className="qr12 bg-note" style={{ top: pct(NOTE_TOPS[1]) }} type="button">
<span className="bg-note-time">{home.capTime}</span>
<span className="qr9">
Context
</span>
<span className="qr10">
Compiled at {home.capTime} for “vault adapter rebuild trigger”
</span>
<span className="qr11">
{home.capShort}
</span>
</button>
<button onClick={nav.sessions.go} className="qr12 bg-note" style={{ top: pct(NOTE_TOPS[2]) }} type="button">
<span className="bg-note-time">{home.sesTime}</span>
<span className="qr9">
Current session
</span>
<span className="qr10">
Vault adapter planning · 12 turns, last at {home.sesTime}
</span>
<span className="qr11">
{home.sesShort}
</span>
</button>
<button onClick={home.openCheckpoint} className="qr12 bg-note" style={{ top: pct(NOTE_TOPS[3]) }} type="button">
<span className="bg-note-time">{home.cpTime}</span>
<span className="qr9">
Checkpoint
</span>
<span className="qr10">
Turns 1–8 covered at {home.cpTime}
</span>
<span className="qr11">
{home.cpShort}
</span>
</button>
</div>
</Paper>
</div>
<div className="bg-home-foot">
<div className="qr6 bg-legend">
<span className="bg-legend-k">Legend</span>
<span className="qr3">

</span>
<span>
Fictional demo on this device
</span>
<span className="qr4">
·
</span>
<span>
Core models v1
</span>
<span className="qr4">
·
</span>
<span>
Mock provider
</span>
<span className="qr4">
·
</span>
<span className="qr5">
Vault adapter not connected
</span>
<span className="bg-legend-key"><i data-kind="canonical" /> canonical write <i data-kind="candidate" /> candidate <i data-kind="checkpoint" /> checkpoint</span>
</div>
<div className="qr15 bg-margin">
<div className="qr9">
Left open last time
</div>
<div className="qr14">
Choose the index rebuild trigger.
</div>
<div className="qr14">
Accept the first Windows port boundary.
</div>
</div>
</div>
</section>
  );
}
