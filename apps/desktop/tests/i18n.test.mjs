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

// Dictionary coverage only sees marked strings. Visible JSX text and accessible names
// written as plain literals bypass t() entirely, so the parser looks for them. English
// stays only where the element says so with lang="en", inside code, and for paths and links.
test('JSX text and accessible names go through the translation functions', async () => {
  const { parseSync } = await import('vite');
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join, relative } = await import('node:path');
  const { SRC } = await import('./i18n-keys.mjs');
  const files = (dir) => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? (f === 'i18n' ? [] : files(p)) : p.endsWith('.tsx') ? [p] : [];
  });
  // The product name, the fixed UTC+8 zone label, units and key names stay as they are.
  const words = (s) => /[A-Za-z]{3,}/.test(s.replace(/Enouia Runtime|UTC\+8|GiB|Ctrl\+Alt\+\w+/g, '')) && !/^(%\w+%|https?:\/\/)\S*$/.test(s.trim());
  const found = [];
  for (const file of files(SRC)) {
    const { program, errors } = parseSync(file, readFileSync(file, 'utf8'));
    assert.deepEqual(errors, [], file);
    const visit = (node, english) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { for (const n of node) visit(n, english); return; }
      if (node.type === 'JSXElement') english ||= ['code', 'kbd', 'samp'].includes(node.openingElement.name.name) ||
        node.openingElement.attributes.some((a) => a.name?.name === 'lang' && a.value?.value === 'en');
      if (!english && node.type === 'JSXText' && words(node.value)) found.push(`${relative(SRC, file)}: ${node.value.trim()}`);
      if (!english && node.type === 'JSXAttribute' && ['aria-label', 'title', 'placeholder', 'alt'].includes(node.name.name)) {
        const value = node.value?.type === 'JSXExpressionContainer' ? node.value.expression : node.value;
        const literal = value?.type === 'Literal' ? [value.value] : value?.type === 'TemplateLiteral' ? value.quasis.map((q) => q.value.cooked) : [];
        for (const text of literal) if (typeof text === 'string' && words(text)) found.push(`${relative(SRC, file)}: ${node.name.name}=${text.trim()}`);
      }
      // Literals that become child text through an expression: {a ? 'yes' : 'no'}, {x + ' units'}.
      const child = (e) => {
        if (e?.type === 'Literal' && typeof e.value === 'string' && words(e.value)) found.push(`${relative(SRC, file)}: ${e.value.trim()}`);
        else if (e?.type === 'TemplateLiteral') { for (const q of e.quasis) if (words(q.value.cooked)) found.push(`${relative(SRC, file)}: ${q.value.cooked.trim()}`); }
        else if (e?.type === 'ParenthesizedExpression') child(e.expression);
        else if (e?.type === 'ConditionalExpression') { child(e.consequent); child(e.alternate); }
        else if (e?.type === 'LogicalExpression' || (e?.type === 'BinaryExpression' && e.operator === '+')) { child(e.left); child(e.right); }
      };
      if (!english && (node.type === 'JSXElement' || node.type === 'JSXFragment')) for (const c of node.children) if (c.type === 'JSXExpressionContainer') child(c.expression);
      for (const [key, value] of Object.entries(node)) if (key !== 'type') visit(value, english);
    };
    visit(program, false);
  }
  assert.deepEqual(found, []);
});
