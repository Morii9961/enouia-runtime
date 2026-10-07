import React from "react";
import type { DemoView } from "../App";

export default function Activity({ view }: { view: DemoView }) {
  const { actDays, actFilters } = view;
  return (
<section data-screen-label="Activity" className="qr187">
<div className="qr186">
<div className="qr174">
<div className="qr149">
<h1 className="qr18">
Activity
</h1>
<div className="qr19">
What happened, in order. Expand a row for its record.
</div>
</div>
<div className="qr30">

</div>
<div role="group" aria-label="Filter events" className="qr173">
{actFilters.map((f, fIndex) => <React.Fragment key={f.label}>
<button aria-pressed={f.active} onClick={f.onClick} className="qr172" style={{"background": f.bg, "color": f.fg}} type="button">
{f.label}
</button>
</React.Fragment>)}
</div>
</div>
{actDays.map((dd, ddIndex) => <React.Fragment key={dd.key}>
<div className="qr65">
<div className="qr175">
{dd.label}
</div>
{dd.items.map((a, aIndex) => <React.Fragment key={a.key}>
<div className="qr184" style={{"background": a.bg}}>
<button onClick={a.toggle} aria-expanded={a.open} className="qr179" type="button">
<span className="qr11">
{a.time}
</span>
<span className="qr47" style={{"background": a.color}}>

</span>
<span className="qr133">
{a.title}
</span>
<span className="qr176">
{a.text}
</span>
<span className="qr177">
{a.origin}
</span>
<svg width="12" height="12" viewBox="0 0 12 12" className="qr178" style={{"transform": a.chev}}>
<path d="M4 2.5L7.5 6 4 9.5" fill="none" stroke="#7F8D9A" strokeWidth="1.2">

</path>
</svg>
</button>
{a.open ? <>
<div className="qr183">
{a.details.map((r, rIndex) => <React.Fragment key={r.k}>
<div className="qr181">
<span className="qr35">
{r.k}
</span>
<span className="qr180">
{r.v}
</span>
</div>
</React.Fragment>)}
{a.hasLink ? <>
<button onClick={a.onLink} className="qr182" type="button">
{a.linkLabel}
</button>
</> : null}
</div>
</> : null}
</div>
</React.Fragment>)}
</div>
</React.Fragment>)}
<div className="qr185">
Fictional event examples · no live stream connected. Activity producer data stays outside Memory and Context.
</div>
</div>
</section>
  );
}
