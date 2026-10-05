// Quick search (ADR-026): the hotkey window. Read-only literal search over
// approved memories; the shell scopes this window to `memory_search`. Focus
// clears it, blur and Escape clear it, Escape hides it. Ported from Memory's
// reference overlay.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { call, shell, type J } from "./client";
import { useLatestRead } from "./hooks";
import { ErrorBox, Tag } from "./ui";

export default function QuickSearch({ readPage = call }: { readPage?: typeof call }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<J[]>([]);
  const reads = useLatestRead();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const clear = () => { reads.clear(); setItems([]); setQuery(""); };
    const focus = () => { clear(); input.current?.focus(); };
    // On the window, not the page root: a click on text or padding moves
    // focus to <body>, outside React's container.
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") { clear(); void shell.hideWindow(); }
    };
    window.addEventListener("focus", focus);
    window.addEventListener("blur", clear);
    window.addEventListener("keydown", escape);
    focus();
    return () => {
      window.removeEventListener("focus", focus);
      window.removeEventListener("blur", clear);
      window.removeEventListener("keydown", escape);
    };
  }, [reads.clear]);

  const clear = () => { reads.clear(); setItems([]); setQuery(""); };
  const run = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) { clear(); return; }
    setItems([]);
    void reads.run(() => readPage("memory_search", { query, includeHistorical: false, cursor: null, limit: 8 }), (page) => setItems(page.items));
  };

  return (
    <main className="mem-quick" aria-busy={reads.busy}>
      <form role="search" className="qr22" onSubmit={run}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#7F8D9A" strokeWidth="1.2" aria-hidden="true">
          <circle cx="6" cy="6" r="4.2" /><path d="M9.2 9.2L12.5 12.5" />
        </svg>
        <label htmlFor="mem-q" className="mem-sr">Search memories</label>
        <input id="mem-q" ref={input} className="qr21" value={query} autoComplete="off" spellCheck={false}
          onChange={(e) => { if (!e.target.value.trim()) clear(); else setQuery(e.target.value); }}
          placeholder="Search approved memories · Enter · Esc closes" />
      </form>
      <ErrorBox error={reads.error} />
      {reads.busy && <p role="status" className="mem-muted">Searching…</p>}
      <ul className="mem-quick-results" aria-live="polite">
        {items.map((h) => (
          <li key={h.memoryId}>
            {h.currency && h.currency !== "current" && <Tag>{h.currency}</Tag>} <span className="mem-content">{h.snippet}</span>
          </li>
        ))}
      </ul>
      <div className="mem-actions">
        <button type="button" className="mem-link" onClick={() => void shell.showMain()}>Open Enouia Runtime</button>
      </div>
    </main>
  );
}
