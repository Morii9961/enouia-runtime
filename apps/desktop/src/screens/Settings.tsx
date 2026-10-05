import React from "react";
import type { DemoView } from "../App";

export default function Settings({ view }: { view: DemoView }) {
  const { keyboardHint, memorySettings, motionOpts, paused, sw, togglePaused } = view;
  return (
<section data-screen-label="Settings" className="qr187">
<div className="qr219">
<div className="qr149">
<h1 className="qr18">
Settings
</h1>
<div className="qr19">
Only what the runtime supports today.
</div>
</div>
<div className="qr65">
<div className="qr198">
Appearance
</div>
<div className="qr213">
<div className="qr135">
<span className="qr211">
Motion
</span>
<span className="qr108">
The presence ring breathes on a 6-second cycle unless reduced.
</span>
</div>
<div className="qr173">
{motionOpts.map((f, fIndex) => <React.Fragment key={f.label}>
<button onClick={f.onClick} aria-pressed={f.active} className="qr212" style={{"background": f.bg, "color": f.fg}} type="button">
{f.label}
</button>
</React.Fragment>)}
</div>
</div>
<div className="qr213">
<div className="qr135">
<span className="qr211">
Theme
</span>
<span className="qr108">
Dark. A light theme is not designed yet.
</span>
</div>
<span className="qr9">
Dark
</span>
</div>
</div>
<div className="qr65">
<div className="qr198">
Activity producer
</div>
<div className="qr213">
<div className="qr135">
<span className="qr211">
Pause scheduled runs · demo
</span>
<span className="qr101">
Demo switch only · scheduler is not connected
</span>
</div>
<button role="switch" aria-checked={paused} aria-label="Pause scheduled runs" onClick={togglePaused} className="qr215" style={{"border": "1px solid " + (sw.border), "background": sw.bg}} type="button">
<span className="qr214" style={{"left": sw.left, "background": sw.knob}}>

</span>
</button>
</div>
</div>
{memorySettings ?? <>
<div className="qr65">
<div className="qr198">
Vault
</div>
<div className="qr216">
<span className="qr35">
Location
</span>
<span className="qr5">
Not configured · Vault adapter pending
</span>
</div>
<div className="qr216">
<span className="qr35">
Identity files
</span>
<span className="qr217">
core.md · runtime_rules.md
</span>
</div>
</div>
</>}
<div className="qr218">
{keyboardHint ?? 'Keyboard: Ctrl+1–7 switches surfaces · ↑ ↓ moves through memories and sessions.'}
</div>
</div>
</section>
  );
}
