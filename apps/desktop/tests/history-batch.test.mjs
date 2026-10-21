import test from 'node:test';
import assert from 'node:assert/strict';
import { HistoryBatchOwner, batchPreparationObservation, prepareHistoryBatch } from '../src/memory/historyBatch.ts';
import { historyTask } from './history-task-fixture.ts';

const args = { taskId: 'synthetic-history-task', batchIndex: 1, policyId: 'synthetic-policy', outputTokens: 1024 };
const prepared = () => ({ ...args, sessionId: 'synthetic-child-1', runId: 'synthetic-run-1', inputEventId: 'synthetic-input-1',
  callId: 'synthetic-call', dispatchId: 'synthetic-dispatch', api: 'openai', model: 'synthetic-model', endpoint: 'https://example.invalid/synthetic',
  body: '{"synthetic":true}', wireHash: 'a'.repeat(64), estimatedInputTokens: 50, expiresInMs: 60000, streaming: false });
test('exact preparation keys survive returning to the same parameters and never cross Vault/task/batch/policy/token choices', async () => {
  const owner = new HistoryBatchOwner(), key = await owner.key('vault', args);
  for (const [field, value] of Object.entries({ taskId: 'other', batchIndex: 0, policyId: 'other', outputTokens: 2 }))
    assert.notEqual(await owner.key('vault', { ...args, [field]: value }), key);
  assert.notEqual(await owner.key('other-vault', args), key);
  assert.equal(await owner.key('vault', { ...args }), key);
  const calls = [];
  await prepareHistoryBatch(owner, 'vault', args, async (...call) => { calls.push(call); });
  assert.deepEqual(calls, [['history_batch_prepare', args, key]]);
  owner.markSubmitted('vault', args);
  assert.equal(owner.wasSubmitted('vault', args.taskId, 1), true);
  assert.equal(owner.wasSubmitted('vault', args.taskId, 0), false);
});

test('a new owner reconstructs the original preparation key without stored request state', async () => {
  const original = await new HistoryBatchOwner().key('vault', args);
  const reopened = new HistoryBatchOwner();
  assert.equal(await reopened.key('vault', { ...args }), original);
  assert.match(original, /^[A-Za-z0-9_-]{16,128}$/);
  assert.equal(reopened.selection, null);
  assert.equal(reopened.wasSubmitted('vault', args.taskId, args.batchIndex), false);
  assert.deepEqual(reopened.draft('vault', args.taskId, args.batchIndex), { policy: '', output: '1024' });
});
test('inspection refuses mixed child/run/input/model/request identity and invalid handle/hash/TTL fields', () => {
  assert.equal(batchPreparationObservation(prepared(), historyTask(), args).batchIndex, 1);
  for (const [field, value] of Object.entries({ taskId: 'other', batchIndex: 0, sessionId: 'other', runId: 'other', inputEventId: 'other',
    api: 'anthropic', model: 'other', outputTokens: 1, wireHash: 'bad', callId: '', dispatchId: '', endpoint: '', body: '',
    expiresInMs: 0, estimatedInputTokens: -1, streaming: null })) {
    assert.throws(() => batchPreparationObservation({ ...prepared(), [field]: value }, historyTask(), args), /mismatch/, field);
  }
});
