import React from 'react';
import { STATE_LABEL, STREAM, type AutoState } from './fixture';
import { STEP_LABEL, dayHeading, dayKey, daysBetween, fmtClock, toMs } from './model';
import { Glyph } from './parts';
import type { ViewProps } from './types';

// Formation: the pen's remarks, newest first. Each step the system took is one
// stroke on the ruler; nothing here waits for Morii. Held and conflicting
// statements wait for new evidence, and the only mark that is Morii's is the
// correction.
const STAGES: { key: string; label: string; steps: (AutoState | 'extracted')[] }[] = [
  { key: 'received', label: 'Received', steps: ['received'] },
  { key: 'extracted', label: 'Extracted', steps: ['extracted'] },
  { key: 'decided', label: 'Adopted · held · in conflict', steps: ['adopted', 'held', 'conflict'] },
  { key: 'rechecked', label: 'Re-evaluating', steps: ['reevaluating'] },
  { key: 'folded', label: 'Consolidated · superseded', steps: ['consolidated', 'superseded'] },
  { key: 'faded', label: 'Surfacing less · archived', steps: ['fading', 'archived'] },
  { key: 'yours', label: 'Your correction', steps: ['corrected'] },
];

export default function Formation({ sel, select }: ViewProps) {
  const counts = new Map(STAGES.map((s) => [s.key, STREAM.filter((e) => s.steps.includes(e.step)).length]));
  const days: { key: string; at: string; rows: typeof STREAM }[] = [];
  STREAM.forEach((e) => { const k = dayKey(e.at); const last = days[days.length - 1]; if (last && last.key === k) last.rows.push(e); else days.push({ key: k, at: e.at, rows: [e] }); });
  return (
    <div className="am-formation">
      <div className="am-view-head">
        <h2 className="am-vh">Formation <span>what the system did, newest first</span></h2>
        <p className="am-fine">Read-only. The system takes these steps itself; held and conflicting statements wait for new evidence, not for you. Counts cover this sample only.</p>
      </div>
      <ol className="am-pipe" aria-label="Formation stages and how many steps in this sample">
        {STAGES.map((s) => (
          <li key={s.key} data-yours={s.key === 'yours' || undefined}>
            <span className="am-pipe-g">{s.steps.filter((x): x is AutoState => x !== 'extracted').slice(0, 3).map((x) => <Glyph key={x} s={x} />)}{s.key === 'extracted' ? <Glyph s="held" className="am-g-ghost" /> : null}</span>
            <span className="am-pipe-l">{s.label}</span>
            <span className="am-mono am-pipe-n">{counts.get(s.key)}</span>
          </li>
        ))}
      </ol>
      <div className="am-log" role="list" aria-label="Formation log">
        {days.map((d, di) => (
          <section key={d.key} className="am-day" role="listitem" aria-label={dayHeading(d.at)}>
            {di > 0 ? (() => { const gap = daysBetween(toMs(d.at), toMs(days[di - 1].at)); return gap >= 2 ? <p className="am-gap"><span>{gap} days between</span></p> : null; })() : null}
            <h3 className="am-day-h">{dayHeading(d.at)}</h3>
            <ul>
              {d.rows.map((e, i) => (
                <li key={e.id + e.step + e.at + i}>
                  <button type="button" className="am-ev" aria-pressed={e.id === sel} data-step={e.step} data-yours={e.step === 'corrected' || undefined} onClick={() => select(e.id)}>
                    <span className="am-ev-time am-mono">{fmtClock(toMs(e.at))}</span>
                    <span className="am-ev-rule">{e.step === 'extracted' ? <Glyph s="held" className="am-g-ghost" /> : <Glyph s={e.step} />}</span>
                    <span className="am-ev-body">
                      <span className="am-ev-step">{STEP_LABEL(e.step, STATE_LABEL)}{e.step === 'corrected' ? <i> · recorded as yours</i> : null}</span>
                      <span className="am-ev-title">{e.title} <span className="am-mono am-ev-id">{e.id}</span></span>
                      <span className="am-ev-note">{e.note}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
