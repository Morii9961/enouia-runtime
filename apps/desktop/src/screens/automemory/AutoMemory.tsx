import React, { useEffect, useRef, useState } from 'react';
import { AUTO_LABEL, AUTO_NOTE, RANGE_NOTE } from './fixture';
import { AUTO_MEMORIES, DATASET, DATASETS, EMPTY_NOTE, HELD_NOTE } from './dataset';
const AUTO_COUNT = AUTO_MEMORIES.length;
import { UNKNOWN_KEY, UNKNOWN_PACKET } from './state-fixtures';
import { byId } from './model';
import Formation from './Formation';
import Grid from './Grid';
import Timeline from './Timeline';
import Constellation from './Constellation';
import Recall from './Recall';
import StarMap from './StarMap';
import { Inspector } from './Inspector';
import type { ViewId } from './types';
import { setAutoMode } from '../../theme/autoMode';
import { moveAlong } from '../../theme/motion';

import { msg, t } from '../../i18n/index.ts';
// Automatic memory · synthetic preview (browser demo only, invented fixture).
// Five views share one Inspector and one selection. Local state only: no IPC,
// no fetch, no storage, nothing logged. The real Vault still uses owner review.
const VIEWS: { id: ViewId; name: string; hint: string }[] = [
  { id: 'formation', name: msg('Formation'), hint: msg('what the system did') },
  { id: 'grid', name: msg('Memory grid'), hint: msg('one slip each') },
  { id: 'timeline', name: msg('Timeline'), hint: msg('when it happened') },
  { id: 'stars', name: msg('Constellation'), hint: msg('what touches it') },
  { id: 'starmap', name: msg('Star map'), hint: msg('the whole generated sample') },
  { id: 'recall', name: msg('Recall lab'), hint: msg('why offered') },
];

export default function AutoMemory({ onExit }: { onExit: () => void }) {
  const [view, setView] = useState<ViewId>('formation');
  const [sel, setSel] = useState<string | null>(() => byId.has('am_05') ? 'am_05' : AUTO_MEMORIES[0]?.id ?? null);
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { setAutoMode(true); head.current?.focus(); return () => setAutoMode(false); }, []);
  const m = sel === null ? undefined : byId.get(sel);
  // Views advance along their order; a new selection turns the Inspector (DESIGN.md §7).
  const order = VIEWS.map((v) => v.id);
  const showView = (id: ViewId) => { if (id !== view) moveAlong('view', () => setView(id), order.indexOf(id) > order.indexOf(view) ? 'fwd' : 'back'); };
  const choose = (id: string) => { if (id !== sel) moveAlong('select', () => setSel(id)); };
  const body = !m ? <p className="am-empty">{t(EMPTY_NOTE)}</p> : view === 'formation' ? <Formation sel={m.id} select={choose} />
    : view === 'grid' ? <Grid sel={m.id} select={choose} />
    : view === 'timeline' ? <Timeline sel={m.id} select={choose} />
    : view === 'stars' ? <Constellation sel={m.id} select={choose} />
    : <Recall sel={m.id} select={choose} />;
  return (
    <section data-screen-label="Memory Vault" className="am" data-view={view}
      // ArrowUp/Down belong to the lists in this preview; the demo Vault's global
      // selection shortcut would otherwise move a hidden selection (spec note in critique-log).
      onKeyDown={(e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') e.stopPropagation(); }}>
      <header className="am-head">
        <div className="am-head-row">
          <h1 className="am-h1" tabIndex={-1} ref={head}>{t("Automatic memory")} <span>{t("synthetic preview")}</span></h1>
          <p className="am-stamp bg-inv">{t(AUTO_LABEL)}</p>
          <button type="button" className="am-back" onClick={onExit}>{t("Back to Vault · owner review")}</button>
        </div>
        <p className="am-note">{t(AUTO_NOTE)}</p>
        <div className="am-demo-states" role="group" aria-label={t("Demo state")}>
          {DATASETS.map(d => {
            const url = new URL(location.href); url.searchParams.set('auto-dataset', d.id);
            return <a key={d.id} className="am-chip" href={url.href} aria-current={d.id === DATASET ? 'true' : undefined}>{t(d.label)}</a>;
          })}
        </div>
        {DATASET === 'held' ? <p className="am-note">{t(HELD_NOTE)}</p> : null}
        {DATASET === 'source-missing' ? <p className="am-note">{t("The original source is missing in this synthetic state. The statement and times remain readable. Choose another demo state to see source excerpts.")}</p> : null}
        {DATASET === 'read-only' ? <p className="am-note">{t("This synthetic sample is read-only. Inspect records and switch views; changes need the automatic Memory contract.")}</p> : null}
        {DATASET === 'unknown-result' ? <details className="am-unknown-result">
          <summary>{t("Result unknown · retained demo packet and key")}</summary>
          <p className="am-fine">{t("The result is unknown. Keep the original packet and key; do not submit the action again. This display is invented, and result lookup is unavailable in the browser preview.")}</p>
          <code>{UNKNOWN_KEY}</code><pre lang="en">{UNKNOWN_PACKET}</pre>
          <button type="button" className="am-chip" disabled>{t("Look up original result · unavailable in preview")}</button>
        </details> : null}
        <div className="am-head-row am-head-views">
          <div className="am-views" role="group" aria-label={t("Automatic memory views")}>
            {VIEWS.map((v) => (
              <button key={v.id} type="button" className="am-view" data-auto-view={v.id} aria-pressed={view === v.id} title={t(v.hint)} onClick={() => showView(v.id)}>
                <span className="am-vn">{t(v.name)}</span>
              </button>
            ))}
          </div>
          <p className="am-range">{t(RANGE_NOTE, { n: AUTO_COUNT })}</p>
          <a className="am-skip" href="#am-inspector" onClick={(e) => { e.preventDefault(); document.getElementById('am-inspector')?.focus(); }}>{t("Skip to inspector")}</a>
        </div>
      </header>
      {view === 'starmap' && DATASET === 'original' ? (
        // The star map has its own sample (700 generated memories by default) and its own panel.
        <div className="am-body"><div className="am-main sm-host" id="am-main"><StarMap /></div></div>
      ) : (
        <div className="am-body">
          <div className="am-main" id="am-main">{view === 'starmap' && m ? <p className="am-empty">{t("The star map uses a separate generated sample. Choose Original sample to open it.")}</p> : body}</div>
          {m ? <Inspector m={m} select={choose} /> : <aside className="am-inspector" id="am-inspector" tabIndex={-1} aria-label={t("Automatic memory inspector")}><p className="am-empty">{t(EMPTY_NOTE)}</p></aside>}
        </div>
      )}
    </section>
  );
}
