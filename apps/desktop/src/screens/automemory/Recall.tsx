import React, { useState } from 'react';
import { type RecallCase } from './fixture';
import { RECALL_CASES } from './dataset';
import { byId } from './model';
import { Glyph, Ref, StateTag } from './parts';
import type { ViewProps } from './types';

import { labels, msg, t } from '../../i18n/index.ts';
// Recall lab: one synthetic recall, drawn as a strip with five stations on one
// pen line. Eligibility is written before ranking because it happens before
// ranking. There are no sliders and no per-dimension scores; every row says why.
const isBudgetCut = (reason: string) => reason.startsWith('Eligible');
// Station names are interface labels; each case's notes stay as the fixture wrote them.
const STATION: Record<RecallCase['steps'][number]['label'], string> = labels({ 'Input and scope': msg('Input and scope'), Eligibility: msg('Eligibility'),
  'Retrieval and ranking': msg('Retrieval and ranking'), 'Budget and completeness': msg('Budget and completeness'), Capsule: msg('Capsule') });

export default function Recall({ sel, select, mode = 'pipeline' }: ViewProps & {mode?: 'pipeline' | 'suggestions'}) {
  const [ci, setCi] = useState(0);
  const c = RECALL_CASES[ci];
  if (!c) return <p className="am-empty">{t("No recall case belongs to this sample. Choose another demo state to inspect a complete invented recall.")}</p>;
  const eligibilityOut = c.excluded.filter((e) => !isBudgetCut(e.reason));
  const cut = c.excluded.filter((e) => isBudgetCut(e.reason));
  const pctOf = (n: number) => `${((n / c.budget.limit) * 100).toFixed(2)}%`;
  const total = c.included.reduce((a, b) => a + b.cost, 0);
  let acc = 0;
  return (
    <div className="am-recall">
      <div className="am-view-head">
        <h2 className="am-vh">{t(mode === 'suggestions' ? "Review suggestions" : "Recall lab")} <span>{t(mode === 'suggestions' ? "why revisit in this invented moment" : "why each memory was or was not offered")}</span></h2>
        <p className="am-stamp-line"><span className="am-stamp bg-inv">{t("Synthetic · no IPC · nothing saved")}</span> <span className="am-fine">{t("Two invented cases. Nothing is sent, read from a Vault or kept.")}</span></p>
      </div>
      <div className="am-cases" role="group" aria-label={t("Recall case")}>
        {RECALL_CASES.map((rc, i) => (
          <button key={rc.id} type="button" className="am-chip am-case" aria-pressed={i === ci} onClick={() => setCi(i)}>
            <b>{t("Case {n}", { n: i + 1 })}</b> {rc.query}
          </button>
        ))}
      </div>
      <p className="am-moment"><b>{t("Moment")}</b> {c.moment}</p>

      {mode === 'suggestions' ? <div className="am-suggestions" data-recall-case={c.id}>
        <p className="am-fine">{t("These cards restate this invented recall, not a live suggestion feed. Being left out does not delete a memory or change its state.")}</p>
        <p className="am-fine" id="am-suggestion-controls">{t("Reminders and dismissal need Memory support. These controls are unavailable; no action is recorded.")}</p>
        {(['included', 'excluded'] as const).map(group => <section key={group} className="am-suggestion-group" data-suggestion-group={group}>
          <h3 className="am-lbl">{t(group === 'included' ? "Why revisit in this case" : "Why this case leaves it out")} · {c[group].length}</h3>
          <ul className="am-suggestion-list">{c[group].map(entry => {
            const m = byId.get(entry.id)!;
            return <li key={entry.id} className="am-suggestion-card" data-suggestion-memory={entry.id}>
              <Ref m={m} onSelect={select} selected={m.id === sel} />
              <StateTag s={m.state} />
              <p className="am-suggestion-statement">{m.statement}</p>
              <p className="am-why" data-suggestion-reason>{entry.reason}</p>
              <div className="am-opt-row" aria-describedby="am-suggestion-controls">
                <button className="am-opt" type="button" disabled>{t("Remind later")}</button>
                <button className="am-opt" type="button" disabled>{t("Stop this type of suggestion")}</button>
              </div>
            </li>;
          })}</ul>
        </section>)}
      </div> : <ol className="am-steps" aria-label={t("Recall pipeline, five steps")}>
        <li>
          <span className="am-step-n">1</span>
          <div className="am-step-b">
            <h3>{STATION[c.steps[0].label]}</h3>
            <p>{c.steps[0].note}</p>
            <p className="am-q"><b>{t("Query")}</b> <span className="am-mono">“{c.query}”</span></p>
          </div>
        </li>
        <li>
          <span className="am-step-n">2</span>
          <div className="am-step-b">
            <h3>{STATION[c.steps[1].label]} <span className="am-tag">{t("before any ranking")}</span></h3>
            <p>{c.steps[1].note}</p>
            {eligibilityOut.length ? (
              <>
                <p className="am-lbl">{t("Not eligible · {n}", { n: eligibilityOut.length })}</p>
                <ul className="am-out">{eligibilityOut.map((e) => <li key={e.id}><Ref m={byId.get(e.id)!} onSelect={select} selected={e.id === sel} /><span className="am-why">{e.reason}</span></li>)}</ul>
              </>
            ) : null}
          </div>
        </li>
        <li>
          <span className="am-step-n">3</span>
          <div className="am-step-b">
            <h3>{STATION[c.steps[2].label]}</h3>
            <p>{c.steps[2].note}</p>
            <table className="am-rank">
              <caption className="am-sr">{t("Ranked memories and why each was included")}</caption>
              <thead><tr><th scope="col">{t("Rank")}</th><th scope="col">{t("Memory")}</th><th scope="col">{t("Reason")}</th><th scope="col">{t("Cost")}</th><th scope="col">{t("Source reachable")}</th></tr></thead>
              <tbody>
                {c.included.map((r) => (
                  <tr key={r.id}>
                    <td className="am-mono am-r-rank">{r.rank}</td>
                    <td><Ref m={byId.get(r.id)!} onSelect={select} selected={r.id === sel} /></td>
                    <td>{r.reason}</td>
                    <td className="am-mono">{t("{n} units", { n: r.cost })}</td>
                    <td>{r.sourceReachable ? t('yes') : t('no')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </li>
        <li>
          <span className="am-step-n">4</span>
          <div className="am-step-b">
            <h3>{STATION[c.steps[3].label]}</h3>
            <p>{c.steps[3].note}</p>
            <div className="am-budget" role="img" aria-label={t('Budget: {used} of {limit} units used. {state}', { used: c.budget.used, limit: c.budget.limit, state: c.budget.truncated ? t('Truncated.') : t('Not truncated.') })}>
              {c.included.map((r) => { const left = acc; acc += r.cost; return <span key={r.id} className="am-bseg" style={{ left: pctOf(left), width: pctOf(r.cost) }}><i>{r.rank}</i></span>; })}
              <span className="am-blimit">{t("limit {n}", { n: c.budget.limit })}</span>
            </div>
            <p className="am-bline"><b>{t("Used")}</b> <span className="am-mono">{t("{used} of {limit} units", { used: c.budget.used, limit: c.budget.limit })}</span> · <b>{t("Truncated")}</b> {c.budget.truncated ? <span className="am-yes">{t("yes · {n} cut", { n: cut.length })}</span> : t("no")}</p>
            {cut.length ? <ul className="am-out">{cut.map((e) => <li key={e.id}><Ref m={byId.get(e.id)!} onSelect={select} selected={e.id === sel} /><span className="am-why">{e.reason}</span></li>)}</ul> : null}
          </div>
        </li>
        <li>
          <span className="am-step-n">5</span>
          <div className="am-step-b">
            <h3>{STATION[c.steps[4].label]}</h3>
            <p>{c.steps[4].note}</p>
            <ul className="am-capsule">
              {c.included.map((r) => <li key={r.id}><Glyph s={byId.get(r.id)!.state} /><span>{byId.get(r.id)!.title}</span><span className="am-mono">{r.cost}</span></li>)}
              <li className="am-cap-total"><span>{t("Capsule, synthetic")}</span><span className="am-mono">{t("{n} units", { n: total })}</span></li>
            </ul>
          </div>
        </li>
      </ol>}
    </div>
  );
}
