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

// A transition runs its update only after capturing the old frame. A second
// move inside that gap (Ctrl+2 then Ctrl+3) would otherwise read the state the
// first move replaces, and the engine may run the skipped first update last,
// leaving the earlier page. Each move therefore applies a still-held update
// first; callers that read current state before moving settle it too.
let held: { update: () => void; applied: boolean } | null = null;

/** Applies a move whose transition has not run its update yet. */
export function settleMoves() {
  const step = held;
  held = null;
  if (step && !step.applied) { step.applied = true; flushSync(step.update); }
}

/** Runs `update` inside a view transition tagged with `kind` (and a direction along the nav order). */
export function moveAlong(kind: Move, update: () => void, dir?: 'fwd' | 'back') {
  settleMoves();
  const doc = document as Document & Starter;
  if (!doc.startViewTransition || motionReduced()) { update(); return; }
  const root = document.documentElement;
  root.dataset.vt = kind;
  if (dir) root.dataset.vtDir = dir; else delete root.dataset.vtDir;
  const step = { update, applied: false };
  held = step;
  const run = doc.startViewTransition(() => {
    if (held === step) held = null;
    if (step.applied) return;
    step.applied = true;
    flushSync(update);
  });
  void run.finished.finally(() => {
    if (root.dataset.vt !== kind) return;
    delete root.dataset.vt; delete root.dataset.vtDir;
  });
}
