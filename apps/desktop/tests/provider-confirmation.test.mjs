import test from 'node:test';
import assert from 'node:assert/strict';
import { call, setTransport } from '../src/memory/client.ts';
import { holdProviderConfirmation } from '../src/memory/providerConfirmation.ts';

const plan = (kind = 'grant') => ({ kind, inspection: 'Exact synthetic plan', planId: 'plan_synthetic', diffHash: 'hash_synthetic' });

test('repeated confirmation of a held plan keeps one real IPC payload/key after a lost receipt', async () => {
  const requests = [];
  setTransport(async (_, { request }) => {
    requests.push(request);
    if (requests.length === 1) return { kind: 'memory_error', error: { code: 'busy', retryable: true, rules: [] } };
    return { kind: 'memory_page', result: { kind: 'grant', committed: true } };
  });
  const held = holdProviderConfirmation(plan(), call);
  await assert.rejects(held.confirm(), /busy/);
  assert.equal((await held.confirm()).committed, true);
  assert.equal(requests[0].idempotencyKey, requests[1].idempotencyKey);
  assert.notEqual(requests[0].requestId, requests[1].requestId);
  assert.deepEqual(requests[0].arguments, { planId: 'plan_synthetic', diffHash: 'hash_synthetic' });
  assert.deepEqual(requests[0].arguments, requests[1].arguments);
  assert.equal(requests[0].command, 'provider_confirm');
});

test('a held confirmation copies its displayed content and identity before the original row changes', async () => {
  const source = plan('interrupt');
  let sent;
  const held = holdProviderConfirmation(source, async (...args) => { sent = args; });
  Object.assign(source, { kind: 'revoke', inspection: 'Changed', planId: 'other', diffHash: 'other' });
  assert.deepEqual(held.plan, plan('interrupt'));
  assert.throws(() => { held.plan.diffHash = 'changed'; }, TypeError);
  await held.confirm();
  assert.deepEqual(sent.slice(0, 2), ['provider_confirm', { planId: 'plan_synthetic', diffHash: 'hash_synthetic' }]);
});

test('separate held plans have separate keys and old confirmations never borrow a replacement identity', async () => {
  const sent = [];
  const request = async (...args) => { sent.push(args); };
  const first = holdProviderConfirmation(plan(), request);
  const second = holdProviderConfirmation({ ...plan('revoke'), planId: 'replacement', diffHash: 'replacement-hash' }, request);
  await first.confirm();
  await second.confirm();
  await first.confirm();
  assert.notEqual(sent[0][2], sent[1][2]);
  assert.equal(sent[0][2], sent[2][2]);
  assert.deepEqual(sent[0][1], sent[2][1]);
  assert.equal(sent[1][1].planId, 'replacement');
});
