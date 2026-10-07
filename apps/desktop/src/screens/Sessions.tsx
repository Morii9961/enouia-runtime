import React from "react";
import type { DemoView } from "../App";

export default function Sessions({ view }: { view: DemoView }) {
  const { ctx, nav, ses, sessList } = view;
  return (
<section data-screen-label="Sessions" className="qr171">
<aside className="qr136">
<div className="qr20">
<h1 className="qr18">
Sessions
</h1>
<div className="qr19">
Append-only. Nothing is rewritten.
</div>
</div>
<div className="qr135">
{sessList.map((ss, ssIndex) => <React.Fragment key={ss.key}>
<button onClick={ss.onClick} aria-pressed={ss.selected} className="qr134" style={{"background": ss.bg}} type="button">
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
<div className="qr161">
<div className="qr137">
<div className="qr29">
{ses.title}
</div>
<div className="qr19">
{ses.day}
</div>
</div>
<div className="qr160">
{ses.events.map((ev, evIndex) => <React.Fragment key={ses.title + ev.seq}>
<div className="qr159">
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
<button onClick={w.onClick} className="qr148" type="button">
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
Checkpoint created
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
Session
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
Checkpoints
</div>
{ses.noCheckpoints ? <>
<div className="qr108">
None yet.
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
Memory writes
</div>
{ses.noWrites ? <>
<div className="qr108">
None from this session.
</div>
</> : null}
{ses.writes.map((w, wIndex) => <React.Fragment key={w.key}>
<button onClick={w.onClick} className="qr167" type="button">
<span className="qr165">
{w.text}
</span>
<span className="qr166">
{w.label} · turn {w.turn}
</span>
</button>
</React.Fragment>)}
</div>
<div className="qr169">
<div className="qr55">
Context snapshot
</div>
<div className="qr85">
Session v1 does not persist capsules. The last compiled capsule is on the Context Surface.
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
