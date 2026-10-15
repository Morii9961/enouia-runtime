import test from 'node:test';
import assert from 'node:assert/strict';
import { call, setTransport } from '../src/memory/client.ts';
import { readSavedMockContext } from '../src/memory/savedMockContext.ts';

const reference = { sessionId: 'ses_synthetic', branchId: 'br_synthetic', dispatchId: 'dsp_synthetic', requestHash: 'a'.repeat(64) };
const dispatch = () => ({ dispatchId: reference.dispatchId, capsuleId: 'cap_synthetic', requestHash: reference.requestHash, verified: true, destination: { kind: 'local_mock' } });
const context = () => ({ capsule: { capsule_id: 'cap_synthetic', session_id: reference.sessionId, branch_id: reference.branchId, destination: { kind: 'local_mock' } }, inspection: { capsule_id: 'cap_synthetic' }, dispatches: [{ dispatchId: reference.dispatchId, requestHash: reference.requestHash }] });

test('saved Mock context resolution uses only keyed-null saved reads and returns the observed capsule', async () => {
  const requests = [];
  setTransport(async (_, { request }) => {
    requests.push(request);
    return { kind: 'memory_page', result: request.command === 'dispatch_inspect' ? dispatch() : context() };
  });
  assert.equal(await readSavedMockContext(reference, call), 'cap_synthetic');
  assert.deepEqual(requests.map(r => [r.command, r.arguments, r.idempotencyKey]), [
    ['dispatch_inspect', { dispatchId: reference.dispatchId }, null],
    ['context_inspect', { capsuleId: 'cap_synthetic' }, null],
  ]);
});

test('unverified, foreign, external or hash-mismatched dispatches never trigger a capsule read', async () => {
  for (const changed of [null, {}, ...[{ dispatchId: 'other' }, { capsuleId: '' }, { capsuleId: null }, { verified: false }, { verified: 'true' }, { requestHash: 'other' }, { destination: { kind: 'external_provider' } }].map(patch => ({ ...dispatch(), ...patch }))]) {
    const calls = [];
    await assert.rejects(readSavedMockContext(reference, async command => { calls.push(command); return changed; }), /invalid_request/);
    assert.deepEqual(calls, ['dispatch_inspect']);
  }
});

test('capsule must belong to the selected branch and retain its matching dispatch and hash', async () => {
  const original = context();
  const bad = [null, {}, { ...original, capsule: { ...original.capsule, capsule_id: 'other' } },
    ...['session_id', 'branch_id'].map(key => ({ ...original, capsule: { ...original.capsule, [key]: 'other' } })),
    { ...original, capsule: { ...original.capsule, destination: { kind: 'external_provider' } } },
    { ...original, inspection: { capsule_id: 'other' } }, { ...original, dispatches: null },
    ...[[], [null], [{ dispatchId: 'other', requestHash: reference.requestHash }], [{ dispatchId: reference.dispatchId, requestHash: 'other' }], [...original.dispatches, ...original.dispatches]].map(dispatches => ({ ...original, dispatches }))];
  for (const changed of bad) {
    await assert.rejects(readSavedMockContext(reference, async command => command === 'dispatch_inspect' ? dispatch() : changed), /invalid_request/);
  }
});

test('saved read failure is propagated without generating or sending a replacement answer', async () => {
  const calls = [];
  const failure = new Error('synthetic read failure');
  await assert.rejects(readSavedMockContext(reference, async command => { calls.push(command); if (command === 'context_inspect') throw failure; return dispatch(); }), error => error === failure);
  assert.deepEqual(calls, ['dispatch_inspect', 'context_inspect']);
});
