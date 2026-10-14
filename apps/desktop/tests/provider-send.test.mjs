import test from 'node:test';
import assert from 'node:assert/strict';
import { call, setTransport } from '../src/memory/client.ts';
import { holdProviderSend } from '../src/memory/providerSend.ts';

const prepared = () => ({ callId: 'call_synthetic', wireHash: 'hash_synthetic', body: 'Exact synthetic text', model: 'synthetic-model' });

test('lost send receipt and explicit recovery replay one keyed operation through the real client envelope', async () => {
  const requests = [];
  let sends = 0;
  const admitted = new Map();
  setTransport(async (_, { request }) => {
    requests.push(request);
    if (!admitted.has(request.idempotencyKey)) {
      sends++;
      admitted.set(request.idempotencyKey, { operationId: 'op_synthetic', kind: 'external_send' });
    }
    if (requests.length === 1) return { kind: 'memory_error', error: { code: 'busy', retryable: true, rules: [] } };
    return { kind: 'memory_page', result: admitted.get(request.idempotencyKey) };
  });
  const held = holdProviderSend(prepared(), call);
  assert.equal(held.submitted(), false);
  await assert.rejects(held.send(), /busy/);
  assert.equal(held.submitted(), true);
  assert.equal((await held.send()).operationId, 'op_synthetic');
  assert.equal(sends, 1);
  assert.equal(requests[0].idempotencyKey, requests[1].idempotencyKey);
  assert.notEqual(requests[0].requestId, requests[1].requestId);
  assert.deepEqual(requests[0].arguments, { callId: 'call_synthetic', wireHash: 'hash_synthetic' });
  assert.deepEqual(requests[0].arguments, requests[1].arguments);
});

test('recovery remains bound to the exact reviewed body and identity after its source row changes', async () => {
  const source = prepared();
  let sent;
  const held = holdProviderSend(source, async (...args) => { sent = args; return { operationId: 'op_synthetic', kind: 'external_send' }; });
  Object.assign(source, { body: 'Changed', callId: 'other', wireHash: 'other' });
  assert.deepEqual(held.prepared, prepared());
  assert.throws(() => { held.prepared.body = 'Changed'; }, TypeError);
  await held.send();
  assert.deepEqual(sent.slice(0, 2), ['external_send', { callId: 'call_synthetic', wireHash: 'hash_synthetic' }]);
});

test('new prepared calls receive new keys without changing an older recovery closure', async () => {
  const sent = [];
  const request = async (...args) => { sent.push(args); return { operationId: 'op_synthetic', kind: 'external_send' }; };
  const old = holdProviderSend(prepared(), request);
  const next = holdProviderSend({ ...prepared(), callId: 'next' }, request);
  await old.send(); await next.send(); await old.send();
  assert.notEqual(sent[0][2], sent[1][2]);
  assert.equal(sent[0][2], sent[2][2]);
  assert.deepEqual(sent[0][1], sent[2][1]);
});

test('missing or foreign start identities cannot become the watched model operation', async () => {
  for (const response of [null, {}, { operationId: '' }, { operationId: 1, kind: 'external_send' }, { operationId: 'op', kind: 'import' }]) {
    const held = holdProviderSend(prepared(), async () => response);
    await assert.rejects(held.send(), /invalid_request/);
    assert.equal(held.submitted(), true);
  }
});
