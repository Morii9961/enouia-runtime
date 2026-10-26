// Interface translations: every string the source marks with t(), tj(), tn() or msg()
// has a Simplified Chinese and a Japanese entry, entries keep the English placeholders,
// and no dictionary carries keys the source no longer uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dictionary, usedKeys } from './i18n-keys.mjs';

const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const used = usedKeys();

for (const name of ['zh-Hans', 'ja']) {
  const dict = dictionary(name);
  test(`${name}: every interface string is translated`, () => {
    const missing = [...used.keys()].filter((k) => !dict.has(k));
    assert.deepEqual(missing, [], `${missing.length} strings have no ${name} entry`);
  });
  test(`${name}: placeholders match the English`, () => {
    const wrong = [...dict].filter(([k, v]) => holes(k) !== holes(v)).map(([k]) => k);
    assert.deepEqual(wrong, []);
  });
  test(`${name}: no unused entries`, () => {
    const extra = [...dict.keys()].filter((k) => !used.has(k));
    assert.deepEqual(extra, []);
  });
  test(`${name}: entries are not left in English`, () => {
    // allowed to stay as they are: names, codes, paths and quoted search text
    const same = [...dict].filter(([k, v]) => k === v && /[a-z]{3}/.test(k) && !/^[\w.\/\\%:"· +-]+$/.test(k)).map(([k]) => k);
    assert.deepEqual(same, []);
  });
}
