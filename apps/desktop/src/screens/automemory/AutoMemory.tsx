import React, { useEffect, useRef, useState } from 'react';
import { AUTO_LABEL, AUTO_NOTE, RANGE_NOTE } from './fixture';
import { byId } from './model';
import Formation from './Formation';
import Grid from './Grid';
import Timeline from './Timeline';
import Constellation from './Constellation';
import Recall from './Recall';
import { Inspector } from './Inspector';
import type { ViewId } from './types';
import { setAutoMode } from '../../theme/autoMode';
import { moveAlong } from '../../theme/motion';

// Automatic memory · synthetic preview (browser demo only, invented fixture).
// Five views share one Inspector and one selection. Local state only: no IPC,
// no fetch, no storage, nothing logged. The real Vault still uses owner review.
const VIEWS: { id: ViewId; name: string; hint: string }[] = [
  { id: 'formation', name: 'Formation', hint: 'what the system did' },
  { id: 'grid', name: 'Memory grid', hint: 'one slip each' },
  { id: 'timeline', name: 'Timeline', hint: 'when it happened' },
  { id: 'stars', name: 'Constellation', hint: 'what touches it' },
  { id: 'recall', name: 'Recall lab', hint: 'why offered' },
];

export default function AutoMemory({ onExit }: { onExit: () => void }) {
  const [view, setView] = useState<ViewId>('formation');
  const [sel, setSel] = useState('am_05');
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { setAutoMode(true); head.current?.focus(); return () => setAutoMode(false); }, []);
  const m = byId.get(sel)!;
  // Views advance along their order; a new selection turns the Inspector (DESIGN.md §7).
  const order = VIEWS.map((v) => v.id);
  const showView = (id: ViewId) => { if (id !== view) moveAlong('view', () => setView(id), order.indexOf(id) > order.indexOf(view) ? 'fwd' : 'back'); };
  const choose = (id: string) => { if (id !== sel) moveAlong('select', () => setSel(id)); };
  const body = view === 'formation' ? <Formation sel={sel} select={choose} />
    : view === 'grid' ? <Grid sel={sel} select={choose} />
    : view === 'timeline' ? <Timeline sel={sel} select={choose} />
    : view === 'stars' ? <Constellation sel={sel} select={choose} />
    : <Recall sel={sel} select={choose} />;
  return (
    <section data-screen-label="Memory Vault" className="am" data-view={view}
      // ArrowUp/Down belong to the lists in this preview; the demo Vault's global
      // selection shortcut would otherwise move a hidden selection (spec note in critique-log).
      onKeyDown={(e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') e.stopPropagation(); }}>
      <header className="am-head">
        <div className="am-head-row">
          <h1 className="am-h1" tabIndex={-1} ref={head}>Automatic memory <span>synthetic preview</span></h1>
          <p className="am-stamp bg-inv">{AUTO_LABEL}</p>
          <button type="button" className="am-back" onClick={onExit}>Back to Vault · owner review</button>
        </div>
        <p className="am-note">{AUTO_NOTE}</p>
        <div className="am-head-row am-head-views">
          <div className="am-views" role="group" aria-label="Automatic memory views">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" className="am-view" aria-pressed={view === v.id} title={v.hint} onClick={() => showView(v.id)}>
                <span className="am-vn">{v.name}</span>
              </button>
            ))}
          </div>
          <p className="am-range">{RANGE_NOTE}</p>
          <a className="am-skip" href="#am-inspector" onClick={(e) => { e.preventDefault(); document.getElementById('am-inspector')?.focus(); }}>Skip to inspector</a>
        </div>
      </header>
      <div className="am-body">
        <div className="am-main" id="am-main">{body}</div>
        <Inspector m={m} select={choose} />
      </div>
    </section>
  );
}
