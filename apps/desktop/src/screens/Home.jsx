import React from "react";

export default function Home({ view }) {
  const { home, nav, ring } = view;
  return (
<section data-screen-label="Home" className="qr17">
<div className="qr16">
<div className="qr8">

      {ring}

<div className="qr7">
<div className="qr1">
Enouia Runtime
</div>
<h1 className="qr2">
I'm here.
</h1>
<div className="qr6">
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
</div>
</div>
</div>
<div className="qr13">
<button onClick={nav.memory.go} className="qr12" type="button">
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
<button onClick={nav.context.go} className="qr12" type="button">
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
<button onClick={nav.sessions.go} className="qr12" type="button">
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
<button onClick={home.openCheckpoint} className="qr12" type="button">
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
<div className="qr15">
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
