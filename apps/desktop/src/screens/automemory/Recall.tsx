import React, { useState } from 'react';
import { RECALL_CASES } from './fixture';
import { byId } from './model';
import { Glyph, Ref } from './parts';
import type { ViewProps } from './types';

// Recall lab: one synthetic recall, drawn as a strip with five stations on one
// pen line. Eligibility is written before ranking because it happens before
// ranking. There are no sliders and no per-dimension scores; every row says why.
const isBudgetCut = (reason: string) => reason.startsWith('Eligible');

export default function Recall({ sel, select }: ViewProps) {
  const [ci, setCi] = useState(0);
  const c = RECALL_CASES[ci];
  const eligibilityOut = c.excluded.filter((e) => !isBudgetCut(e.reason));
  const cut = c.excluded.filter((e) => isBudgetCut(e.reason));
  const pctOf = (n: number) => `${((n / c.budget.limit) * 100).toFixed(2)}%`;
  const total = c.included.reduce((a, b) => a + b.cost, 0);
  let acc = 0;
  return (
    <div className="am-recall">
      <div className="am-view-head">
        <h2 className="am-vh">Recall lab <span>why each memory was or was not offered</span></h2>
        <p className="am-stamp-line"><span className="am-stamp">Synthetic · no IPC · nothing saved</span> <span className="am-fine">Two invented cases. Nothing is sent, read from a Vault or kept.</span></p>
      </div>
      <div className="am-cases" role="group" aria-label="Recall case">
        {RECALL_CASES.map((rc, i) => (
          <button key={rc.id} type="button" className="am-chip am-case" aria-pressed={i === ci} onClick={() => setCi(i)}>
            <b>Case {i + 1}</b> {rc.query}
          </button>
        ))}
      </div>
      <p className="am-moment"><b>Moment</b> {c.moment}</p>

      <ol className="am-steps" aria-label="Recall pipeline, five steps">
        <li>
          <span className="am-step-n">1</span>
          <div className="am-step-b">
            <h3>{c.steps[0].label}</h3>
            <p>{c.steps[0].note}</p>
            <p className="am-q"><b>Query</b> <span className="am-mono">“{c.query}”</span></p>
          </div>
        </li>
        <li>
          <span className="am-step-n">2</span>
          <div className="am-step-b">
            <h3>{c.steps[1].label} <span className="am-tag">before any ranking</span></h3>
            <p>{c.steps[1].note}</p>
            {eligibilityOut.length ? (
              <>
                <p className="am-lbl">Not eligible · {eligibilityOut.length}</p>
                <ul className="am-out">{eligibilityOut.map((e) => <li key={e.id}><Ref m={byId.get(e.id)!} onSelect={select} selected={e.id === sel} /><span className="am-why">{e.reason}</span></li>)}</ul>
              </>
            ) : null}
          </div>
        </li>
        <li>
          <span className="am-step-n">3</span>
          <div className="am-step-b">
            <h3>{c.steps[2].label}</h3>
            <p>{c.steps[2].note}</p>
            <table className="am-rank">
              <caption className="am-sr">Ranked memories and why each was included</caption>
              <thead><tr><th scope="col">Rank</th><th scope="col">Memory</th><th scope="col">Reason</th><th scope="col">Cost</th><th scope="col">Source reachable</th></tr></thead>
              <tbody>
                {c.included.map((r) => (
                  <tr key={r.id}>
                    <td className="am-mono am-r-rank">{r.rank}</td>
                    <td><Ref m={byId.get(r.id)!} onSelect={select} selected={r.id === sel} /></td>
                    <td>{r.reason}</td>
                    <td className="am-mono">{r.cost} units</td>
                    <td>{r.sourceReachable ? 'yes' : 'no'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </li>
        <li>
          <span className="am-step-n">4</span>
          <div className="am-step-b">
            <h3>{c.steps[3].label}</h3>
            <p>{c.steps[3].note}</p>
            <div className="am-budget" role="img" aria-label={`Budget: ${c.budget.used} of ${c.budget.limit} units used. ${c.budget.truncated ? 'Truncated.' : 'Not truncated.'}`}>
              {c.included.map((r) => { const left = acc; acc += r.cost; return <span key={r.id} className="am-bseg" style={{ left: pctOf(left), width: pctOf(r.cost) }}><i>{r.rank}</i></span>; })}
              <span className="am-blimit">limit {c.budget.limit}</span>
            </div>
            <p className="am-bline"><b>Used</b> <span className="am-mono">{c.budget.used} of {c.budget.limit} units</span> · <b>Truncated</b> {c.budget.truncated ? <span className="am-yes">yes · {cut.length} cut</span> : 'no'}</p>
            {cut.length ? <ul className="am-out">{cut.map((e) => <li key={e.id}><Ref m={byId.get(e.id)!} onSelect={select} selected={e.id === sel} /><span className="am-why">{e.reason}</span></li>)}</ul> : null}
          </div>
        </li>
        <li>
          <span className="am-step-n">5</span>
          <div className="am-step-b">
            <h3>{c.steps[4].label}</h3>
            <p>{c.steps[4].note}</p>
            <ul className="am-capsule">
              {c.included.map((r) => <li key={r.id}><Glyph s={byId.get(r.id)!.state} /><span>{byId.get(r.id)!.title}</span><span className="am-mono">{r.cost}</span></li>)}
              <li className="am-cap-total"><span>Capsule, synthetic</span><span className="am-mono">{total} units</span></li>
            </ul>
          </div>
        </li>
      </ol>
    </div>
  );
}
