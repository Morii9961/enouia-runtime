import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { dictionary } from './i18n-keys.mjs';

const assets = new URL('../src/assets/fonts/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('cjk-manifest.json', assets), 'utf8'));
const points = range => new Set(range.split(',').filter(Boolean).flatMap(part => {
  const [a, b = a] = part.slice(2).split('-').map(x => Number.parseInt(x, 16));
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}));
const familyPoints = family => new Set(manifest.files.filter(f => f.family === family).flatMap(f => [...points(f.unicodeRange)]));

test('CJK label subsets cover current dictionaries with the recorded bundled body fallback', () => {
  for (const [language, label, body] of [['zh-Hans', 'Sarasa Mono SC', 'Enouia Text SC'], ['ja', 'M PLUS 1 Code', 'Zen Kaku Gothic New']]) {
    const available = new Set([...familyPoints(label), ...familyPoints(body)]);
    const wanted = [...new Set([...dictionary(language).values()].join(''))].map(c => c.codePointAt(0)).filter(cp => cp >= 0x2E80);
    assert.deepEqual(wanted.filter(cp => !available.has(cp)), []);
    const labelOnly = familyPoints(label);
    const source = manifest.sources.find(s => s.family === label);
    assert.deepEqual([...new Set(wanted)].filter(cp => !labelOnly.has(cp)).sort((a, b) => a - b), [...points(source.labelFallbackCharacters || '')]);
  }
});

test('body slices keep the complete original character coverage and shipped files match their manifest', () => {
  for (const source of manifest.sources.filter(s => s.fullCharacterSet)) {
    const selectors = new Set(source.variationPairs.map(pair => pair[1]));
    assert.equal([...familyPoints(source.family)].filter(cp => !selectors.has(cp)).length, source.characters);
  }
  for (const file of manifest.files) {
    assert.equal(statSync(new URL(file.file, assets)).size, file.bytes);
    assert.ok(file.file.endsWith('.woff2'));
  }
});

test('original IPA choice requires the original face and never silently retains the derivative', async () => {
  const previous = { document: globalThis.document, localStorage: globalThis.localStorage };
  const stored = new Map();
  globalThis.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) };
  globalThis.document = { documentElement: { dataset: {} }, fonts: { load: async () => [] } };
  try {
    const { setScBody } = await import('../src/theme/sc-body.ts');
    await assert.rejects(setScBody('original'), /original_font_unavailable/);
    assert.equal(document.documentElement.dataset.scBody, 'bundled');
    assert.equal(stored.size, 0);
    document.fonts.load = async () => { throw new Error('local face missing'); };
    await assert.rejects(setScBody('original'));
    assert.equal(document.documentElement.dataset.scBody, 'bundled');
    document.fonts.load = async () => [{}]; // controlled font-availability model
    await setScBody('original');
    assert.equal(document.documentElement.dataset.scBody, 'original');
    assert.equal(stored.get('enouia.sc-body'), 'original');
    await setScBody('bundled');
    assert.equal(document.documentElement.dataset.scBody, 'bundled');
    assert.equal(stored.size, 0);
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});
