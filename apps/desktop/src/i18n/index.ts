// Interface language: English, Simplified Chinese, Japanese (DESIGN.md §9).
// English text is the key; the two dictionaries map it to Chinese and Japanese, and a
// missing entry falls back to English. Only the interface is translated: memory text,
// session text and other user content keep their own language. The product name
// "Enouia Runtime" stays as it is everywhere.
//
//   t('Pause motion')                       → 暂停动效
//   t('{n} memories', { n: 12 })            → 12 条记忆   (placeholders in braces)
//   msg('Adopted by system')                → marks a string for translation without translating it yet
//
// The choice is System (follow Windows), English, 中文 or 日本語, kept in this browser
// only; `?lang=en|zh|ja` overrides it for screenshots. <html lang> follows, and the
// fonts follow <html lang> (theme/cjk-fonts.css). Only the active language's dictionary is
// loaded: main.tsx awaits ready() before the first render, and setLang() loads before it switches.
import { createElement, Fragment, useSyncExternalStore, type ReactNode } from 'react';

export type Lang = 'en' | 'zh-Hans' | 'ja';
export type LangPref = 'system' | Lang;
const DICTS: Partial<Record<Lang, Record<string, string>>> = {};
const LOADERS: Record<Exclude<Lang, 'en'>, () => Promise<{ default: Record<string, string> }>> = { 'zh-Hans': () => import('./zh-Hans.ts'), ja: () => import('./ja.ts') };
async function load(l: Lang) {
  if (l === 'en') return;
  // CJK face declarations stay out of the English entry stylesheet. Load them
  // with the dictionary before switching; actual WOFF2 slices remain on demand.
  const cached = DICTS[l];
  const [dictionary] = await Promise.all([
    cached ? Promise.resolve({ default: cached }) : LOADERS[l](),
    import('../theme/cjk-faces.css'),
  ]);
  DICTS[l] = dictionary.default;
}
/** Resolves once the dictionary for the starting language is loaded. */
export const ready = () => load(current);
const KEY = 'enouia.lang';

export const LANG_NAMES: { pref: LangPref; name: string }[] = [
  { pref: 'system', name: 'System' }, { pref: 'en', name: 'English' }, { pref: 'zh-Hans', name: '中文' }, { pref: 'ja', name: '日本語' },
];

const fromTag = (tag: string | null | undefined): Lang | null => {
  const s = (tag || '').toLowerCase();
  return s.startsWith('zh') ? 'zh-Hans' : s.startsWith('ja') ? 'ja' : s.startsWith('en') ? 'en' : null;
};
const systemLang = (): Lang => {
  for (const tag of (typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [])) { const l = fromTag(tag); if (l) return l; }
  return 'en';
};
const readPref = (): LangPref => {
  try { const v = localStorage.getItem(KEY); if (v === 'en' || v === 'zh-Hans' || v === 'ja') return v; } catch { /* storage unavailable: follow the system */ }
  return 'system';
};
const asked = typeof location !== 'undefined' ? fromTag(new URLSearchParams(location.search).get('lang')) : null;

let pref: LangPref = readPref();
let current: Lang = asked ?? (pref === 'system' ? systemLang() : pref);
const listeners = new Set<() => void>();
const apply = () => { if (typeof document !== 'undefined') document.documentElement.lang = current; };
apply();

export const lang = () => current;
export const langPref = () => pref;
export async function setLang(next: LangPref) {
  pref = next;
  try { if (next === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, next); } catch { /* not kept: still applies now */ }
  const target = next === 'system' ? systemLang() : next;
  listeners.forEach((f) => f()); // the choice shows at once; the text follows when its dictionary is in
  await load(target);
  if (pref !== next) return; // a newer choice won
  const was = current; current = target;
  if (current !== was) { apply(); fmtCache.clear(); }
  listeners.forEach((f) => f());
}
if (typeof window !== 'undefined') window.addEventListener('languagechange', () => { if (pref === 'system' && !asked) void setLang('system'); });
/** Re-render on a language change. The app root subscribes, so the whole tree follows. */
export const useLang = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current, () => current);
export const useLangPref = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => pref, () => pref);

const fill = (s: string, vars?: Record<string, string | number>) => vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
export function t(en: string, vars?: Record<string, string | number>): string {
  const d = DICTS[current];
  return fill((d && d[en]) || en, vars);
}
/** A sentence with elements inside it: t('Save as {path}.', …) where path is a React node. */
export function tj(en: string, nodes: Record<string, ReactNode>): ReactNode {
  return t(en).split(/(\{\w+\})/).map((part, i) => {
    const k = /^\{(\w+)\}$/.exec(part)?.[1];
    return createElement(Fragment, { key: i }, k && k in nodes ? nodes[k] : part);
  });
}
/** English plural; Chinese and Japanese use the `other` form's translation. */
export function tn(n: number, one: string, other: string, vars?: Record<string, string | number>): string {
  const v = { n: n.toLocaleString(locale()), ...vars };
  return current === 'en' && n === 1 ? fill(one, v) : t(other, v);
}
/** Identity: lets the checker see strings that are translated later through a variable. */
export const msg = (en: string) => en;
/**
 * A label table whose string values are translated each time they are read, so every use
 * site follows the current language. Keys and iteration are unchanged. Write values with msg().
 */
export function labels<T extends object>(table: T): T {
  return new Proxy(table, { get: (o, k, r) => { const v = Reflect.get(o, k, r); return typeof v === 'string' ? t(v) : v; } });
}

/** The locale for dates and numbers. Chinese uses zh-CN conventions, Japanese ja-JP. */
export const locale = () => (current === 'zh-Hans' ? 'zh-CN' : current === 'ja' ? 'ja-JP' : 'en-GB');
const fmtCache = new Map<string, Intl.DateTimeFormat>();
/** A cached date formatter in the current language. */
export function dateFmt(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = current + JSON.stringify(opts);
  let f = fmtCache.get(k); if (!f) { f = new Intl.DateTimeFormat(locale(), opts); fmtCache.set(k, f); }
  return f;
}
