// 08-negative · the few moments that move (DESIGN.md §7): a page or view advances
// like film, a selection moves like the inverted cursor, the theme develops.
// Uses the View Transitions API of WebView2 / Chromium. Where it is missing
// (Happy DOM, older engines) or motion is reduced, the update is applied at once.
import { flushSync } from 'react-dom';

export type Move = 'page' | 'view' | 'select' | 'theme';
type Starter = { startViewTransition?: (update: () => void) => { finished: Promise<void> } };

export function motionReduced() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches || document.querySelector('[data-motion="reduced"]') !== null;
}

/** Runs `update` inside a view transition tagged with `kind` (and a direction along the nav order). */
export function moveAlong(kind: Move, update: () => void, dir?: 'fwd' | 'back') {
  const doc = document as Document & Starter;
  if (!doc.startViewTransition || motionReduced()) { update(); return; }
  const root = document.documentElement;
  root.dataset.vt = kind;
  if (dir) root.dataset.vtDir = dir; else delete root.dataset.vtDir;
  const run = doc.startViewTransition(() => flushSync(update));
  void run.finished.finally(() => {
    if (root.dataset.vt !== kind) return;
    delete root.dataset.vt; delete root.dataset.vtDir;
  });
}
