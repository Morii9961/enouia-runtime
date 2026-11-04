// Colour only (DESIGN.md §2): Tile Blue (dark) or Xuan Paper (light). It follows the system
// unless the viewer picks one in Settings; the choice is a local preference that the main
// window and Quick Search share. The browser demo's ?theme=dark|light still wins, for screenshots.
// Browser state is read in startTheme(), so modules that only render Settings also load in Node.
import { useSyncExternalStore } from 'react';
import { moveAlong } from './motion';

export type ThemePref = 'system' | 'dark' | 'light';
const KEY = 'enouia.theme';
const stored = (value: string | null): ThemePref => value === 'dark' || value === 'light' ? value : 'system';
let pref: ThemePref = 'system', asked: string | null = null, media: MediaQueryList | null = null;
const listeners = new Set<() => void>();

const target = () => asked === 'light' || asked === 'dark' ? asked : pref !== 'system' ? pref : media?.matches ? 'light' : 'dark';
const apply = () => { document.documentElement.dataset.theme = target(); };
// A change develops the window into the other palette (DESIGN.md §7); no motion when it stays the same.
const change = () => { if (document.documentElement.dataset.theme !== target()) moveAlong('theme', apply); };

export function startTheme() {
  asked = new URLSearchParams(location.search).get('theme');
  media = matchMedia('(prefers-color-scheme: light)');
  try { pref = stored(localStorage.getItem(KEY)); } catch { pref = 'system'; }
  apply();
  media.addEventListener('change', change);
  // Another window's choice: follow it without writing it back.
  window.addEventListener('storage', (event) => {
    if (event.storageArea !== localStorage || (event.key !== KEY && event.key !== null)) return;
    pref = stored(event.newValue); listeners.forEach((f) => f()); change();
  });
}

export function setThemePref(next: ThemePref) {
  try { if (next === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, next); } catch { /* not kept: still applies now */ }
  pref = next; listeners.forEach((f) => f()); change();
}

export const useThemePref = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => pref, () => pref);
