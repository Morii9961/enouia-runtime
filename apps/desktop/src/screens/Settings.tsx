import React from "react";
import type { DemoView } from "../App";

import { LANG_NAMES, setLang, t, useLangPref } from '../i18n/index.ts';
export default function Settings({ view }: { view: DemoView }) {
  const { keyboardHint, memorySettings, motionOpts, shellSettings } = view;
  const pref = useLangPref();
  return (
<section data-screen-label="Settings" className="qr187">
<div className="qr219">
<div className="qr149">
<h1 className="qr18">
{t("Settings")}
</h1>
<div className="qr19">
{t("Only what the runtime supports today.")}
</div>
</div>
<div className="qr65">
<div className="qr198">
{t("Appearance")}
</div>
<div className="qr213">
<div className="qr135">
<span className="qr211">
{t("Motion")}
</span>
<span className="qr108">
{t("The trace is drawn once on Home and the time map glides for 320 ms. Reduced makes both instant.")}
</span>
</div>
<div className="qr173">
{motionOpts.map((f, fIndex) => <React.Fragment key={f.label}>
<button onClick={f.onClick} aria-pressed={f.active} className="qr212" type="button">
{f.label}
</button>
</React.Fragment>)}
</div>
</div>
<div className="qr213">
<div className="qr135">
<span className="qr211">
{t("Language")}
</span>
<span className="qr108">
{t("The interface language. Memories and sessions keep the language they were written in.")}
</span>
</div>
<div className="qr173" role="group" aria-label={t("Language")}>
{LANG_NAMES.map((l) => <button key={l.pref} onClick={() => void setLang(l.pref)} aria-pressed={pref === l.pref} className="qr212" type="button" lang={l.pref === 'system' ? undefined : l.pref}>
{l.pref === 'system' ? t('Follow system') : l.name}
</button>)}
</div>
</div>
<div className="qr213">
<div className="qr135">
<span className="qr211">
{t("Theme")}
</span>
<span className="qr108">
{t("Tile Blue when the system is dark, Xuan Paper when it is light.")}
</span>
</div>
<span className="qr9">
{t("Negative")}
</span>
</div>
</div>
{memorySettings ?? <>
<div className="qr65">
<div className="qr198">
{t("Vault")}
</div>
<div className="qr216">
<span className="qr35">
{t("Location")}
</span>
<span className="qr5">
{t("Not configured · Vault adapter pending")}
</span>
</div>
<div className="qr216">
<span className="qr35">
{t("Identity files")}
</span>
<span className="qr217">
{t("core.md · runtime_rules.md")}
</span>
</div>
</div>
</>}
{shellSettings}
<div className="qr218">
{keyboardHint ?? t('Keyboard: Ctrl+1–6 switches surfaces · ↑ ↓ moves through memories and sessions.')}
</div>
</div>
</section>
  );
}
