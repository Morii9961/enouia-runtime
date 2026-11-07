import React, { useState } from 'react';
import { KIND_LABEL, RANGE_NOTE, STATE_LABEL, THEMES, THEME_NOTE, type AutoState, type Kind } from './fixture';
import { AUTO_MEMORIES } from './dataset';
import { STATE_ORDER, toMs } from './model';
import { OccurredLine, StateKey, StateTag, kindWord } from './parts';
import type { ViewProps } from './types';

import { t } from '../../i18n/index.ts';
// Memory grid: index slips on graph paper. Each slip carries only the title, a
// short statement, the kind, the state (words and mark) and which time it shows.
const KINDS = Object.keys(KIND_LABEL) as Kind[];

export default function Grid({ sel, select }: ViewProps) {
  // Local, session-only filter state. Nothing is stored.
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const [q, setQ] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [state, setState] = useState<AutoState | 'all'>('all');
  const [theme, setTheme] = useState('all');
  const needle = q.trim().toLowerCase();
  const items = [...AUTO_MEMORIES]
    .sort((a, b) => toMs(b.received) - toMs(a.received))
    .filter((m) => (kind === 'all' || m.kind === kind) && (state === 'all' || m.state === state) && (theme === 'all' || m.themes.includes(theme)) && (!needle || (m.title + ' ' + m.statement).toLowerCase().includes(needle)));
  return (
    <div className="am-grid-view">
      <div className="am-view-head">
        <h2 className="am-vh">{t(layout === 'grid' ? "Memory grid" : "Memory list")} <span>{t("one slip per memory")}</span></h2>
        <p className="am-fine">{t('Loaded sample only')} · {t(RANGE_NOTE, { n: AUTO_MEMORIES.length })} · {t('ordered by when the material was received, newest first.')}</p>
      </div>
      <div className="am-time-modes" role="group" aria-label={t("Memory layouts")}>
        <button type="button" className="am-chip" data-grid-layout="grid" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}>{t("Cards")}</button>
        <button type="button" className="am-chip" data-grid-layout="list" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}>{t("List")}</button>
      </div>
      <div className="am-filters" role="group" aria-label={t("Filters · loaded sample only")}>
        <label className="am-search">
          <span className="am-lbl">{t("Literal search")}</span>
          <input data-memory-filter="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Words in title or statement")} aria-label={t("Literal search in the loaded sample")} />
        </label>
        <div className="am-kinds">
          <span className="am-lbl">{t("Kind")}</span>
          {(['all', ...KINDS] as const).map((k) => (
            <button key={k} data-memory-kind={k} type="button" className="am-chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'all' ? t('All kinds') : KIND_LABEL[k]}</button>
          ))}
        </div>
        <label className="am-select-filter"><span className="am-lbl">{t("State")}</span><select data-memory-filter="state" value={state} onChange={e => setState(e.target.value as AutoState | 'all')}>
          <option value="all">{t("All states")}</option>{STATE_ORDER.map(s => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
        </select></label>
        <label className="am-select-filter"><span className="am-lbl">{t("Suggested theme")}</span><select data-memory-filter="theme" value={theme} onChange={e => setTheme(e.target.value)}>
          <option value="all">{t("All themes")}</option>{THEMES.map(th => <option key={th.id} value={th.id}>{th.name}</option>)}
        </select></label>
        <button type="button" className="am-chip" data-clear-memory-filters disabled={!q && kind === 'all' && state === 'all' && theme === 'all'} onClick={() => {setQ('');setKind('all');setState('all');setTheme('all');}}>{t("Clear filters")}</button>
      </div>
      <p className="am-fine">{t("{shown} of {total} loaded records", {shown:items.length,total:AUTO_MEMORIES.length})} · {t(THEME_NOTE)}</p>
      {!items.some(m => m.id === sel) ? <p className="am-fine" role="status">{t("The selected memory is outside these filters. Its Inspector stays open.")}</p> : null}
      {items.length === 0 ? <p className="am-empty">{t("No matching record in the loaded sample. Clear filters to see all loaded records.")}</p> : (
        <ul className="am-slips" data-layout={layout} onKeyDown={e => {
          if (layout !== 'list' || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
          const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('.am-slip')];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (index < 0) return;
          e.preventDefault();
          const next = Math.max(0, Math.min(items.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)));
          buttons[next].focus(); select(items[next].id);
        }}>
          {items.map((m) => (
            <li key={m.id}>
              <button type="button" className="am-slip" data-memory-record={m.id} aria-pressed={m.id === sel} data-s={m.state} onClick={() => select(m.id)}>
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
