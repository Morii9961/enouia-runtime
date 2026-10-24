import React from 'react';
import { KIND_LABEL, STATE_LABEL, type AutoMemory, type AutoState } from './fixture';
import { STATE_ORDER, occurredText } from './model';

/** One state, drawn as a mark on the chart paper. Always paired with its words. */
export function Glyph({ s, className = '' }: { s: AutoState; className?: string }) {
  return <i className={'am-g am-fill ' + className} data-s={s} aria-hidden="true" />;
}
export function StateTag({ s, className = '' }: { s: AutoState; className?: string }) {
  return <span className={'am-state ' + className}><Glyph s={s} /><span>{STATE_LABEL[s]}</span></span>;
}
export const kindWord = (m: AutoMemory) => KIND_LABEL[m.kind];

/** Time semantics on one line: which time, in which precision. */
export function OccurredLine({ m }: { m: AutoMemory }) {
  const { text, tag } = occurredText(m.occurred);
  return <span className="am-occ"><b>Occurred</b> <span className="am-mono">{text}</span> <em>{tag}</em></span>;
}

/** The ten states and their marks. Words are the primary reading; the mark is the second. */
export function StateKey() {
  return (
    <ul className="am-key" aria-label="State marks">
      {STATE_ORDER.map((s) => <li key={s}><Glyph s={s} />{STATE_LABEL[s]}</li>)}
    </ul>
  );
}

/** A selectable memory reference inside lists: glyph, title, id. */
export function Ref({ m, onSelect, selected }: { m: AutoMemory; onSelect: (id: string) => void; selected?: boolean }) {
  return (
    <button type="button" className="am-ref" aria-pressed={selected} onClick={() => onSelect(m.id)}>
      <Glyph s={m.state} />
      <span className="am-ref-t">{m.title}</span>
      <span className="am-mono am-ref-id">{m.id}</span>
    </button>
  );
}
