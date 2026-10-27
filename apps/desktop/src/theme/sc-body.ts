// Local appearance preference only; never reads a Vault or changes native settings.
import { useSyncExternalStore } from 'react';

type ScBody = 'bundled' | 'original';
const KEY = 'enouia.sc-body';
let current: ScBody = 'bundled';
try { if (localStorage.getItem(KEY) === 'original') current = 'original'; } catch { /* local preference unavailable */ }
const listeners = new Set<() => void>();
const apply = () => { if (typeof document !== 'undefined') document.documentElement.dataset.scBody = current; };
apply();

export const useScBody = () => useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current, () => current);

export async function setScBody(next: ScBody) {
  if (next === 'original') {
    // This face has local() sources only. Never claim restoration when absent.
    const faces = await document.fonts.load('14px "IPAexGothic"', '漢字');
    if (faces.length === 0) throw new Error('original_font_unavailable');
  }
  current = next;
  try { if (next === 'original') localStorage.setItem(KEY, next); else localStorage.removeItem(KEY); } catch { /* still applies in this window */ }
  apply();
  listeners.forEach(cb => cb());
}
