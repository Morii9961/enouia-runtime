import React, { useState } from 'react';
import { AUTO_MEMORIES, KIND_LABEL, RANGE_NOTE, type Kind } from './fixture';
import { toMs } from './model';
import { OccurredLine, StateKey, StateTag, kindWord } from './parts';
import type { ViewProps } from './types';

// Memory grid: index slips on graph paper. Each slip carries only the title, a
// short statement, the kind, the state (words and mark) and which time it shows.
const KINDS = Object.keys(KIND_LABEL) as Kind[];

export default function Grid({ sel, select }: ViewProps) {
  // Local, session-only filter state. Nothing is stored.
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const items = [...AUTO_MEMORIES]
    .sort((a, b) => toMs(b.received) - toMs(a.received))
    .filter((m) => (kind === 'all' || m.kind === kind) && (!needle || (m.title + ' ' + m.statement).toLowerCase().includes(needle)));
  return (
    <div className="am-grid-view">
      <div className="am-view-head">
        <h2 className="am-vh">Memory grid <span>one slip per memory</span></h2>
        <p className="am-fine">Loaded sample only · {RANGE_NOTE} · ordered by when the material was received, newest first.</p>
      </div>
      <div className="am-filters" role="group" aria-label="Filters · loaded sample only">
        <label className="am-search">
          <span className="am-lbl">Literal search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Words in title or statement" aria-label="Literal search in the loaded sample" />
        </label>
        <div className="am-kinds">
          <span className="am-lbl">Kind</span>
          {(['all', ...KINDS] as const).map((k) => (
            <button key={k} type="button" className="am-chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'All kinds' : KIND_LABEL[k]}</button>
          ))}
        </div>
      </div>
      {items.length === 0 ? <p className="am-empty">Nothing here matches. No reading in the loaded sample for that filter. Clear the words or choose All kinds.</p> : (
        <ul className="am-slips">
          {items.map((m) => (
            <li key={m.id}>
              <button type="button" className="am-slip" aria-pressed={m.id === sel} data-s={m.state} onClick={() => select(m.id)}>
                <span className="am-slip-top"><span className="am-kind">{kindWord(m)}</span><span className="am-mono am-slip-id">{m.id}</span></span>
                <span className="am-slip-title">{m.title}</span>
                <span className="am-slip-text">{m.statement}</span>
                <StateTag s={m.state} />
                <OccurredLine m={m} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="am-foot"><StateKey /></div>
    </div>
  );
}
