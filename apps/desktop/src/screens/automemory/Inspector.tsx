import React from 'react';
import { STATE_HINT, type AutoMemory } from './fixture';
import { SURFACING_TEXT, byId, fmtStamp, occurredText, validText } from './model';
import { Ref, StateTag, kindWord } from './parts';

import { msg, t } from '../../i18n/index.ts';
const NOTE_ID = 'am-optional-note';

/** The one Inspector shared by all five views. A region, not a modal: nothing here traps focus. */
export function Inspector({ m, select }: { m: AutoMemory; select: (id: string) => void }) {
  const occ = occurredText(m.occurred);
  const valid = validText(m.valid);
  const surf = SURFACING_TEXT[m.surfacing];
  const changes = [
    [msg('Supersedes'), m.supersedes], [msg('Superseded by'), m.supersededBy], [msg('Conflicts with'), m.conflictsWith],
  ] as const;
  const anyChange = changes.some(([, id]) => id);
  return (
    <aside className="am-inspector" aria-label={t("Automatic memory inspector")} tabIndex={-1} id="am-inspector">
      <header className="am-i-head">
        <p className="am-i-id"><span className="am-mono">{m.id}</span> <span className="am-mono">{m.rev}</span></p>
        <h2 className="am-i-title">{m.title}</h2>
        <StateTag s={m.state} className="am-state-lg" />
        <p className="am-hint">{STATE_HINT[m.state]}</p>
        <p className="am-i-kind"><b>{t("Kind")}</b> {kindWord(m)}</p>
      </header>
      <p className="am-statement">{m.statement}</p>

      <section className="am-i-sec" aria-label={t("Times")}>
        <h3>{t("Five times, kept apart")}</h3>
        <p className="am-fine am-tz">All times are Asia/Shanghai (UTC+8), the same as the rest of this demo. The browser's own zone is not used.</p>
        <dl className="am-times">
          <dt>{t("Occurred")}</dt><dd><span className="am-mono">{occ.text}</span> <em>{occ.tag}</em></dd>
          <dt>{t("Valid")}</dt><dd><span className="am-mono">{valid.text}</span> <em>{valid.note}</em></dd>
          <dt>{t("Received")}</dt><dd><span className="am-mono">{fmtStamp(m.received)}</span> <em>{t("when the material arrived")}</em></dd>
          <dt>{t("Known to system")}</dt><dd>{m.known ? <span className="am-mono">{fmtStamp(m.known)}</span> : <span>{t("Not adopted")}</span>} {m.known ? <em>{t("when it was adopted")}</em> : null}</dd>
          <dt>{t("Revised")}</dt><dd><span className="am-mono">{fmtStamp(m.revised)}</span> <em>{m.rev}</em></dd>
        </dl>
      </section>

      <section className="am-i-sec" aria-label={t("Why")}>
        <h3>{t("Why")} <span className="am-tag">{t("Model’s explanation")}</span></h3>
        <p>{m.why}</p>
      </section>

      <section className="am-i-sec" aria-label={t("Support")}>
        <h3>{t("Support")} <span className="am-tag">{t("evidence")}</span></h3>
        {m.support.length === 0 ? <p className="am-none">{t("No support recorded.")}</p> : (
          <ul className="am-evidence">
            {m.support.map((e, i) => (
              <li key={i}>
                <p className="am-ev-src"><span>{e.source}</span> <span className="am-role">{e.role}</span> <span className="am-mono">{e.rev}</span></p>
                <blockquote>{e.excerpt}</blockquote>
                <p className="am-evid-time"><b>{t("Received")}</b> <span className="am-mono">{fmtStamp(e.received)}</span></p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="am-i-sec" aria-label={t("Context dependencies")}>
        <h3>{t("Context dependencies")} <span className="am-tag">{t("not support")}</span></h3>
        <p className="am-fine">{t("What was in the model’s context when this formed. It is not evidence for the statement.")}</p>
        {m.contextDeps.length === 0 ? <p className="am-none">{t("None recorded.")}</p> : (
          <ul className="am-evidence am-deps">
            {m.contextDeps.map((d, i) => <li key={i}><p className="am-mono">{d.capsule}</p><p>{d.note}</p></li>)}
          </ul>
        )}
      </section>

      <section className="am-i-sec" aria-label={t("Changes")}>
        <h3>{t("Changes")}</h3>
        {anyChange ? (
          <ul className="am-changes">
            {changes.map(([label, id]) => id && byId.get(id) ? <li key={label}><span className="am-ch-k">{t(label)}</span><Ref m={byId.get(id)!} onSelect={select} /></li> : null)}
          </ul>
        ) : <p className="am-none">{t("No supersession or conflict recorded.")}</p>}
      </section>

      <section className="am-i-sec" aria-label={t("Surfacing")}>
        <h3>{t("Surfacing")}</h3>
        <p><b>{surf.word}.</b> {surf.hint}</p>
      </section>

      <section className="am-i-sec am-optional" aria-label={t("Optional controls")}>
        <h3>{t("Optional controls")}</h3>
        <div className="am-opt-row">
          {['Correct', 'Withdraw', 'History'].map((b) => <button key={b} type="button" className="am-opt" disabled aria-describedby={NOTE_ID}>{b}</button>)}
        </div>
        <p className="am-fine" id={NOTE_ID}>{t("Optional control · needs the automatic Memory contract")}</p>
      </section>
    </aside>
  );
}
