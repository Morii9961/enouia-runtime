import React from "react";

export default function Context({ view }) {
  const { ctx, ctxScroll } = view;
  return (
<section data-screen-label="Context Surface" className="qr132">
<div className="qr99">
<div className="qr90">
<h1 className="qr18">
Context Surface
</h1>
<span className="qr9">
Fictional capsule snapshot · read only. No data is sent.
</span>
</div>
<div className="qr93">
<span>
Capsule{' '}
<span className="qr91">
{ctx.capId}
</span>
</span>
<span>
Compiled{' '}
<span className="qr92">
{ctx.at}
</span>
</span>
<span>
Query{' '}
<span className="qr91">
"vault adapter rebuild trigger"
</span>
</span>
</div>
<div className="qr15">
<div className="qr95">
{ctx.segs.map((sg, sgIndex) => <React.Fragment key={sg.key ?? sg.id ?? sg.k ?? sgIndex}>
<span title={sg.label} className="qr94" style={{"width": sg.w, "background": sg.c}}>

</span>
</React.Fragment>)}
</div>
<div className="qr98">
<span>
<span className="qr96">
2,427
</span>
 of{' '}
<span className="qr97">
4,096
</span>
 units
</span>
<span className="qr97">
utf8_bytes_v1 · 2,171 B + 256 reserve
</span>
<span>
Records admitted whole, never truncated
</span>
</div>
</div>
</div>
<div className="qr131">
<div className="qr105">
{ctx.sections.map((s, sIndex) => <React.Fragment key={s.key ?? s.id ?? s.k ?? sIndex}>
<button onClick={s.jump} className="qr102" style={{"background": s.bg}} type="button">
<span className="qr100" style={{"background": s.c}}>

</span>
<span>
{s.label}
</span>
<span className="qr101">
{s.count}
</span>
</button>
</React.Fragment>)}
<button onClick={ctx.jumpExcl} className="qr104" type="button">
<span className="qr103">

</span>
<span>
Excluded
</span>
<span className="qr101">
4
</span>
</button>
</div>
<div ref={ctxScroll} className="qr130">
<div className="qr129">
{ctx.sections.map((s, sIndex) => <React.Fragment key={s.key ?? s.id ?? s.k ?? sIndex}>
<div id={s.domId} className="qr121">
<div className="qr107">
<h2 className="qr106">
{s.label}
</h2>
<span className="qr101">
{s.field}
</span>
<div className="qr30">

</div>
<span className="qr101">
{s.bytes}
</span>
</div>
<div className="qr108">
{s.note}
</div>
<div className="qr120">
{s.items.map((it, itIndex) => <React.Fragment key={it.key ?? it.id ?? it.k ?? itIndex}>
<div className="qr119" style={{"background": it.bg}}>
<button onClick={it.toggle} aria-expanded={it.open} className="qr114" type="button">
<span className="qr42">
<span className="qr109">
{it.text}
</span>
<span className="qr110">
<span>
{it.srcLabel}
</span>
<span className="qr25">
{it.ref}
</span>
<span>
· {it.reason}
</span>
</span>
</span>
<span className="qr113">
<span>
{it.rank}
</span>
<span className="qr111">
{it.bytes}
</span>
<svg width="12" height="12" viewBox="0 0 12 12" className="qr112" style={{"transform": it.chev}}>
<path d="M4 2.5L7.5 6 4 9.5" fill="none" stroke="#9BA9B6" strokeWidth="1.2">

</path>
</svg>
</span>
</button>
{it.open ? <>
<div className="qr118">
{it.trace.map((tr, trIndex) => <React.Fragment key={tr.key ?? tr.id ?? tr.k ?? trIndex}>
<div className="qr117">
<span className="qr115">
{tr.n}
</span>
<span className="qr35">
{tr.k}
</span>
{tr.isLink ? <>
<button onClick={tr.onClick} className="qr116" type="button">
{tr.v}
</button>
</> : null}
{tr.isMono ? <>
<span className="qr62">
{tr.v}
</span>
</> : null}
{tr.isPlain ? <>
<span className="qr61">
{tr.v}
</span>
</> : null}
</div>
</React.Fragment>)}
</div>
</> : null}
</div>
</React.Fragment>)}
</div>
</div>
</React.Fragment>)}
<div id="ctx-excluded" className="qr128">
<h2 className="qr122">
Excluded
</h2>
<div className="qr108">
Considered and left out, each with an explicit reason.
</div>
<div className="qr120">
{ctx.excluded.map((ex, exIndex) => <React.Fragment key={ex.key ?? ex.id ?? ex.k ?? exIndex}>
<button onClick={ex.onClick} className="qr126" type="button">
<span className="qr124">
<span className="qr123">
{ex.text}
</span>
<span className="qr40">
{ex.ref}
</span>
</span>
<span className="qr125">
{ex.reason}
</span>
</button>
</React.Fragment>)}
</div>
<div className="qr127">
consumed by mock provider v1 · sha256 {ctx.hash}
</div>
</div>
</div>
</div>
</div>
</section>
  );
}
