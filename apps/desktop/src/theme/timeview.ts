// 08-negative · the time map's view state: which stretch of time a chart shows.
// Presentation only. It lives in this module, not in App's state: it holds a
// start time and a span per chart, is never persisted and reaches no backend.
// The map in the record strip and the chart in the page both read it; moving
// the frame (pointer, buttons or arrow keys) pans the chart.
import { useSyncExternalStore } from 'react';

/** 'home', 'timeline' or 'sessions:<session key>'. */
export type ViewKey = string;
/** Who moved the frame last. A drag follows the pointer; the rest glide. A scroll comes from the chart itself. */
export type ViewBy = 'init' | 'map' | 'drag' | 'scroll';
export interface TimeView {
  /** Start of the visible stretch (ms since epoch). */
  start: number;
  /** Length of the visible stretch (ms). */
  span: number;
  /** The whole recorded stretch the map shows. */
  domain: readonly [number, number];
  by: ViewBy;
  /** Bumped on every change, so effects can tell a new request from a re-render. */
  seq: number;
}

const views = new Map<ViewKey, TimeView>();
const subscribers = new Set<() => void>();
const emit = () => subscribers.forEach((f) => f());
const subscribe = (cb: () => void) => { subscribers.add(cb); return () => { subscribers.delete(cb); }; };

const clamp = (start: number, span: number, domain: readonly [number, number]) => Math.max(domain[0], Math.min(domain[1] - span, start));

/** Read a chart's view, creating it from `init` the first time. Stable between changes. */
export function useTimeView(key: ViewKey, init: () => Pick<TimeView, 'start' | 'span' | 'domain'>): TimeView {
  return useSyncExternalStore(subscribe, () => {
    let v = views.get(key);
    if (!v) { const i = init(); v = { ...i, start: clamp(i.start, i.span, i.domain), by: 'init', seq: 0 }; views.set(key, v); }
    return v;
  }, () => {
    let v = views.get(key);
    if (!v) { const i = init(); v = { ...i, start: clamp(i.start, i.span, i.domain), by: 'init', seq: 0 }; views.set(key, v); }
    return v;
  });
}

/** Read without subscribing (event handlers). */
export const peekView = (key: ViewKey) => views.get(key);

/** Move the frame so the view starts at `start` (clamped to the domain). */
export function panTo(key: ViewKey, start: number, by: ViewBy = 'map') {
  const v = views.get(key); if (!v) return;
  const next = clamp(start, v.span, v.domain);
  if (next === v.start && by === v.by) return;
  views.set(key, { ...v, start: next, by, seq: v.seq + 1 }); emit();
}

/** Replace the visible span and start together (a chart whose own scroll decides what is visible). */
export function setWindow(key: ViewKey, start: number, span: number, domain: readonly [number, number], by: ViewBy) {
  const v = views.get(key);
  if (v && v.start === start && v.span === span && v.domain[0] === domain[0] && v.domain[1] === domain[1] && v.by === by) return;
  views.set(key, { start, span, domain, by, seq: (v?.seq ?? 0) + 1 }); emit();
}

/** Forget the views whose key starts with `prefix` when their page closes, so the next visit starts at the default. */
export function clearViews(prefix: string) {
  let any = false;
  for (const k of [...views.keys()]) if (k === prefix || k.startsWith(prefix + ':')) { views.delete(k); any = true; }
  if (any) emit();
}
