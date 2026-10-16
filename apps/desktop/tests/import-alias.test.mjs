import test from 'node:test';
import assert from 'node:assert/strict';
import { validImportAlias } from '../src/memory/importAlias.ts';

test('import aliases preserve the pinned Core ASCII alphabet and exact upper boundary', () => {
  for (const value of ['a', '0', 'acct-main', 'fixture_2-a', 'a'.repeat(64)]) assert.equal(validImportAlias(value), true, value);
});

test('invalid import aliases never pass through whitespace or Unicode boundary behavior', () => {
  for (const value of ['', 'A', '_acct', '-acct', 'a'.repeat(65), ' acct', 'acct ', 'a b', 'a\n', 'a\r', 'a\t', 'é', 'a😀', 'ａ', 'a/b']) {
    assert.equal(validImportAlias(value), false, JSON.stringify(value));
  }
});
