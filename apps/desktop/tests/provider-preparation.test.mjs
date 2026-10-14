import test from 'node:test';
import assert from 'node:assert/strict';
import { call, setTransport } from '../src/memory/client.ts';
import { holdProviderPreparation } from '../src/memory/providerPreparation.ts';

test('preparation receipt recovery keeps the original saved request payload and key', async () => {
  for (const command of ['external_prepare', 'extraction_prepare']) {
    const sent = [], saved = new Map();
    setTransport(async (_, { request }) => {
      sent.push(request);
      if (!saved.has(request.idempotencyKey)) saved.set(request.idempotencyKey, { sessionId: 'synthetic-session', runId: 'synthetic-run' });
      if (sent.length === 1) return { kind: 'memory_error', error: { code: 'busy', retryable: true, rules: [] } };
      return { kind: 'memory_page', result: saved.get(request.idempotencyKey) };
    });
    const args = command === 'external_prepare' ? { sessionId: 'synthetic', branchId: 'synthetic', text: 'Original draft', api: 'openai' }
      : { sourceId: 'synthetic', sourceRevision: 1, startByte: 0, endByte: 20, api: 'anthropic' };
    const held = holdProviderPreparation(command, args, call);
    await assert.rejects(held.prepare(), /busy/);
    assert.equal((await held.prepare()).sessionId, 'synthetic-session');
    assert.equal(saved.size, 1);
    assert.equal(sent[0].idempotencyKey, sent[1].idempotencyKey);
    assert.notEqual(sent[0].requestId, sent[1].requestId);
    assert.deepEqual(sent[0].arguments, args);
    assert.deepEqual(sent[0].arguments, sent[1].arguments);
    assert.equal(sent[0].command, command);
  }
});

test('mutating the draft or source range cannot change the held recovery payload', async () => {
  const original = { text: 'Original draft', sourceId: 'synthetic', sourceRevision: 1, startByte: 0, endByte: 20 };
  const expected = { ...original };
  let sent;
  const held = holdProviderPreparation('external_prepare', original, async (...args) => { sent = args; });
  Object.assign(original, { text: 'Later draft', sourceRevision: 2, endByte: 40 });
  assert.deepEqual(held.arguments, expected);
  assert.throws(() => { held.arguments.text = 'Changed'; }, TypeError);
  await held.prepare();
  assert.deepEqual(sent.slice(0, 2), ['external_prepare', expected]);
});

test('a separately prepared request gets a new key while the older retry stays bound', async () => {
  const sent = [];
  const request = async (...args) => { sent.push(args); };
  const old = holdProviderPreparation('extraction_prepare', { sourceId: 'old' }, request);
  const next = holdProviderPreparation('extraction_prepare', { sourceId: 'next' }, request);
  await old.prepare(); await next.prepare(); await old.prepare();
  assert.notEqual(sent[0][2], sent[1][2]);
  assert.equal(sent[0][2], sent[2][2]);
  assert.deepEqual(sent[0][1], sent[2][1]);
});
