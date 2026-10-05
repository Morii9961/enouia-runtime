// Runtime window, pinned Memory QuickSearch scope: search only, no writes.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { call } from '../memory/client';
import { useLatestRead } from '../memory/hooks';
import { ErrorBox } from '../memory/ui';
import './quick-search.css';

type Hit = { memoryId: string; currency: string; snippet: string };
type SearchPage = { items: Hit[] };

export default function QuickSearch() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Hit[]>([]);
  const [searched, setSearched] = useState(false);
  const [hostError, setHostError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const reads = useLatestRead();
  const clear = useCallback(() => {
    reads.clear(); setItems([]); setQuery(''); setSearched(false); setHostError('');
  }, [reads.clear]);
  useEffect(() => {
    let stopped = false;
    let unlisten: (() => void) | undefined;
    const focus = () => { clear(); input.current?.focus(); };
    window.addEventListener('focus', focus);
    window.addEventListener('blur', clear);
    const subscription = listen('overlay-clear', focus);
    void subscription.then((dispose) => { if (stopped) dispose(); else unlisten = dispose; }).catch(() => {
      if (!stopped) setHostError('Quick Search window events are unavailable. Close and reopen Runtime.');
    });
    focus();
    return () => {
      stopped = true; clear();
      window.removeEventListener('focus', focus); window.removeEventListener('blur', clear);
      unlisten?.();
    };
  }, [clear]);

  const windowAction = async (command: 'shell_hide' | 'shell_show') => {
    clear();
    try { await invoke(command); }
    catch { setHostError('The window action failed. Try again.'); }
  };
  const search = (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) { clear(); return; }
    setItems([]); setSearched(false);
    void reads.run(
      () => call('memory_search', { query, includeHistorical: false, cursor: null, limit: 8 }) as Promise<SearchPage>,
      (page) => { setItems(page.items); setSearched(true); },
    );
  };

  return (
    <main className="quick-search" aria-label="Quick Search" aria-busy={reads.busy}
      onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); void windowAction('shell_hide'); } }}>
      <header><h1>Quick Search</h1><span className="mem-muted">Approved Memory · read only</span></header>
      <form onSubmit={search} role="search">
        <label className="mem-sr" htmlFor="quick-query">Search approved memories</label>
        <input id="quick-query" className="mem-input" ref={input} value={query} autoComplete="off" spellCheck={false}
          placeholder="Search approved memories…" onChange={(event) => {
            // Editing invalidates any previous response, including delayed errors.
            reads.clear(); setItems([]); setSearched(false); setQuery(event.target.value);
          }} />
        <button className="mem-button mem-primary" type="submit" disabled={!query.trim() || reads.busy}>Search</button>
      </form>
      <div className="quick-results">
        <ErrorBox error={reads.error} />
        {hostError && <p role="alert" className="mem-error">{hostError}</p>}
        {reads.busy && <p role="status" className="mem-muted">Searching…</p>}
        {searched && !items.length && <p role="status" className="mem-muted">No approved memories match.</p>}
        {!searched && !reads.busy && !reads.error && <p className="mem-muted">Enter literal text and press Enter. Open the main window to inspect a memory.</p>}
        <ul aria-live="polite">
          {items.map((item) => <li key={item.memoryId}>
            <span className="mem-tag">{item.currency}</span><p className="mem-content">{item.snippet}</p>
          </li>)}
        </ul>
      </div>
      <footer><span className="mem-muted">Esc to close · cleared when hidden</span>
        <button type="button" className="mem-link" onClick={() => void windowAction('shell_show')}>Open main window</button></footer>
    </main>
  );
}
