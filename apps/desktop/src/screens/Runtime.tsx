import React from "react";
import type { DemoView } from "../App";

import { t } from '../i18n/index.ts';
export default function Runtime({ view }: { view: DemoView }) {
  const { rt, rtList, rtStrip, rtSubtitle } = view;
  return (
<section data-screen-label="Runtime Inspector" className="qr210">
<aside className="qr191">
<div className="qr20">
<h1 className="qr18">
{t("Runtime")}
</h1>
<div className="qr101">
{rtSubtitle ?? t('architecture v0.3 · documentation reference')}
</div>
</div>
<div className="qr27">
{rtList.map((c, cIndex) => <React.Fragment key={c.code}>
<button onClick={c.onClick} className="qr190" data-selected={c.name === rt.name || undefined} type="button">
<span className="qr188">
{c.name}
</span>
<span className="qr189" data-tone={c.tone}>
<span className="qr36" style={{"background": c.color}}>

</span>
{c.state}
</span>
</button>
</React.Fragment>)}
</div>
</aside>
<div className="qr209">
<div className="qr208">
<div className="qr193">
{rtStrip.map((s, sIndex) => <React.Fragment key={s.k}>
<div className="qr192">
<span className="qr56">
{s.k}
</span>
<span className="qr61">
{s.v}
</span>
</div>
</React.Fragment>)}
</div>
<div className="qr15">
<div className="qr196">
<h2 className="qr194">
{rt.name}
</h2>
<span className="qr195">
{rt.state}
</span>
</div>
<div className="qr197">
{rt.desc}
</div>
</div>
<div className="qr204">
<div className="qr65">
<div className="qr198">
{t("State")}
</div>
{rt.rows.map((r, rIndex) => <React.Fragment key={r.k}>
<div className="qr199">
<span className="qr35">
{r.k}
</span>
<span className="qr180">
{r.v}
</span>
</div>
</React.Fragment>)}
</div>
<div className="qr203">
<div className="qr65">
<div className="qr198">
{t("Verification")}
</div>
{rt.checks.map((r, rIndex) => <React.Fragment key={r.k}>
<div className="qr201">
<span className="qr61">
{r.k}
</span>
<span className="qr200">
{r.v}
</span>
</div>
</React.Fragment>)}
</div>
<div className="qr65">
<div className="qr198">
{t("Not yet")}
</div>
{rt.limits.map((l, lIndex) => <React.Fragment key={lIndex}>
<div className="qr202">
<span className="qr56">
—
</span>
{l}
</div>
</React.Fragment>)}
</div>
</div>
</div>
<div className="qr65">
<div className="qr198">
{t("Health")}
</div>
<div className="qr207">
{rtList.map((c, cIndex) => <React.Fragment key={c.code}>
<div className="qr206" data-tone={c.tone}>
<span className="qr36" style={{"background": c.color}}>

</span>
<span className="qr61">
{c.code}
</span>
<span className="qr205">
{c.tone}
</span>
</div>
</React.Fragment>)}
</div>
</div>
</div>
</div>
</section>
  );
}
