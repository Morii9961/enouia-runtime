// Interface strings: every t('…') / tn(…, '…', '…') / msg('…') literal in src, and the
// dictionaries' entries. Used by tests/i18n.test.mjs and, with --list or --missing, by hand.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SRC = path.join(here, '..', 'src');
const str = String.raw`(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|` + '`' + String.raw`((?:[^` + '`' + String.raw`\\$]|\\.)*)` + '`)';
const CALL = new RegExp(String.raw`\b(?:t|tj|msg)\(\s*` + str, 'g');
const PLURAL = new RegExp(String.raw`\btn\([^,]+,\s*` + str + String.raw`\s*,\s*` + str, 'g');
const unescape = (s) => s.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');

function files(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { if (f !== 'i18n') files(p, out); }
    else if (/\.(tsx?|mjs)$/.test(f) && !f.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** Map of English key → files that use it. */
export function usedKeys() {
  const keys = new Map();
  const add = (k, f) => { if (!keys.has(k)) keys.set(k, new Set()); keys.get(k).add(path.relative(SRC, f)); };
  for (const f of files(SRC)) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(CALL)) add(unescape(m[1] ?? m[2] ?? m[3]), f);
    for (const m of src.matchAll(PLURAL)) { add(unescape(m[1] ?? m[2] ?? m[3]), f); add(unescape(m[4] ?? m[5] ?? m[6]), f); }
    // t(cond ? 'A' : 'B') and t(x ?? 'A'): the literals that can become the key
    for (const m of src.matchAll(/\bt\((?=[^'"`\s)])/g)) {
      let i = m.index + m[0].length, depth = 0; const start = i;
      for (; i < src.length; i++) {
        const c = src[i];
        if (c === "'" || c === '"' || c === '`') { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } continue; }
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') { if (!depth) break; depth--; }
        else if (c === ',' && !depth) break;
      }
      const arg = src.slice(start, i);
      for (const k of arg.matchAll(/(?:\?|:|\?\?|\|\|)\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")/g)) { const v = unescape(k[1] ?? k[2]); if (v) add(v, f); }
    }
  }
  return keys;
}

/** Dictionary entries, read from the TS source (keys and values are plain string literals). */
export function dictionary(name) {
  const src = fs.readFileSync(path.join(SRC, 'i18n', name + '.ts'), 'utf8');
  const entry = new RegExp(str + String.raw`\s*:\s*` + str, 'g');
  const d = new Map();
  for (const m of src.matchAll(entry)) d.set(unescape(m[1] ?? m[2] ?? m[3]), unescape(m[4] ?? m[5] ?? m[6]));
  return d;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const used = usedKeys();
  if (process.argv.includes('--list')) for (const [k, fs_] of used) console.log(JSON.stringify(k) + '\t' + [...fs_].join(','));
  if (process.argv.includes('--missing')) {
    for (const name of ['zh-Hans', 'ja']) { const d = dictionary(name); const miss = [...used.keys()].filter((k) => !d.has(k)); console.log(name + ': ' + miss.length + ' missing of ' + used.size); for (const k of miss) console.log('  ' + JSON.stringify(k)); }
  }
}
