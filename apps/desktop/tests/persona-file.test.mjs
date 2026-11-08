// The page renders the public persona file from a preview. The fixtures are
// Enouia Memory's synthetic Core output at the pinned revision 731edd5
// (tests/fixtures/persona/{preview,receipt,options}.json, unchanged copies).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXPORTED_AT_SLOT, fileText, sha256Hex } from '../src/memory/persona.ts';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/persona/${name}.json`, import.meta.url), 'utf8'));
const preview = fixture('preview');
const receipt = fixture('receipt');

test('the preview text with the receipt timestamp is byte for byte the file Memory wrote', async () => {
  const text = fileText(preview, receipt.exportedAt, receipt.memoryVersion);
  assert.equal(await sha256Hex(text), receipt.fileSha256);
  assert.equal(new TextEncoder().encode(text).length, receipt.bytes);
  assert.ok(text.endsWith('}\n') && !text.includes('\r'));
});

test('key order comes from sorting, not from the order the page received', async () => {
  const shuffled = JSON.parse(JSON.stringify(preview, (_, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).reverse()) : value));
  assert.equal(await sha256Hex(fileText(shuffled, receipt.exportedAt, receipt.memoryVersion)), receipt.fileSha256);
});

test('before the receipt only exported_at is unknown, and it appears exactly once', () => {
  const text = fileText(preview, EXPORTED_AT_SLOT, preview.memoryVersion);
  const parts = text.split(JSON.stringify(EXPORTED_AT_SLOT));
  assert.equal(parts.length, 2);
  assert.equal(parts.join(JSON.stringify(receipt.exportedAt)), fileText(preview, receipt.exportedAt, receipt.memoryVersion));
});

test('a changed projection no longer matches the receipt', async () => {
  const changed = structuredClone(preview);
  changed.projection.display_name += '。';
  assert.notEqual(await sha256Hex(fileText(changed, receipt.exportedAt, receipt.memoryVersion)), receipt.fileSha256);
});
