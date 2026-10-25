import test from 'node:test';
import assert from 'node:assert/strict';
import { historyTaskObservation, historyTaskListObservation, validHistoryTaskRequest, sameHistoryTaskRequest, historyCostMicrousd } from '../src/memory/historyTasks.ts';
import { historyTask, historyTaskRequest } from './history-task-fixture.ts';

const selection = { vaultId: 'synthetic-vault', taskId: 'synthetic-history-task' };
test('saved local job creation stays separate from extraction and invocation outcomes', () => {
  const complete = historyTask();
  complete.batches[0].state = 'paused'; complete.batches[0].invocationState = 'outcome_unknown';
  assert.equal(historyTaskObservation(complete, { ...selection, request: historyTaskRequest() }), complete);
  for (const indices of [[], [1]]) {
    const partial = historyTask(indices);
    assert.equal(historyTaskObservation(partial, selection), partial);
    assert.equal(partial.materializationComplete, false);
  }
});

test('a task receipt must retain its original Vault, selection order, model and quotas', () => {
  const mutations = [
    x => x.identity.vaultId = 'another-vault', x => x.taskId = 'another-task', x => x.identity.taskId = 'another-task',
    x => x.request.batchIndices.reverse(), x => x.request.model = 'another-model', x => x.request.importId = 'another-import',
    x => x.request.importRevision++, x => x.request.maxCandidates++, x => x.request.maxPending++,
    x => x.request.maxReservedTokens++, x => x.request.maxReservedCostMicrousd = 0, x => x.request.planHash = 'd'.repeat(64),
  ];
  for (const mutate of mutations) {
    const value = historyTask(); mutate(value);
    assert.throws(() => historyTaskObservation(value, { ...selection, request: historyTaskRequest() }), /mismatch/);
  }
});

test('invented completion, duplicate children, wrong order and lost missing indices cannot be displayed', () => {
  const mutations = [x => x.batches.reverse(), x => x.batches[1].batchIndex = 1, x => x.batches[1].sessionId = x.batches[0].sessionId,
    x => x.batches[1].runId = x.batches[0].runId, x => x.batches[1].inputEventId = x.batches[0].inputEventId,
    x => x.missingBatchIndices = [0], x => x.materializationComplete = false, x => x.coordinatorInputId = null,
    x => x.batches[0].state = 'approved', x => x.batches[0].applied = 9, x => x.batches[0].invocationState = 'ready',
    x => x.materializationPlanHash = 'unverified', x => x.readOnly = false];
  for (const mutate of mutations) { const value = historyTask(); mutate(value); assert.throws(() => historyTaskObservation(value, selection), /mismatch/); }
  const partial = historyTask([1]); partial.materializationComplete = true;
  assert.throws(() => historyTaskObservation(partial, selection), /mismatch/);
});

test('unknown cost and a zero ceiling remain distinct and all local bounds are explicit', () => {
  const request = historyTaskRequest(); assert.equal(validHistoryTaskRequest(request), true);
  const zero = { ...request, maxReservedCostMicrousd: 0 };
  assert.equal(validHistoryTaskRequest(zero), true); assert.equal(sameHistoryTaskRequest(request, zero), false);
  for (const change of [{ batchIndices: [] }, { batchIndices: [0, 0] }, { batchIndices: Array.from({ length: 33 }, (_, i) => i) },
    { maxReservedTokens: Number.MAX_SAFE_INTEGER + 1 }, { maxPending: 501 }, { maxCandidates: 0 }, { maxReservedCostMicrousd: -1 }])
    assert.equal(validHistoryTaskRequest({ ...request, ...change }), false);
});

test('decimal cost entry preserves six-place precision without rounding or inventing unknown prices', () => {
  assert.equal(historyCostMicrousd(''), null); assert.equal(historyCostMicrousd('0'), 0);
  assert.equal(historyCostMicrousd('0.000001'), 1); assert.equal(historyCostMicrousd('1.234567'), 1234567);
  assert.equal(historyCostMicrousd('9007199254.740991'), Number.MAX_SAFE_INTEGER);
  for (const input of ['1.0000001', '-1', '1e3', '9007199254.740992', 'unknown']) assert.equal(historyCostMicrousd(input), undefined);
});

test('saved task discovery rejects mixed Vaults, duplicate rows and malformed continuation tokens', () => {
  const value = { identity: historyTask().identity, readOnly: true, items: [historyTask()], nextCursor: null };
  assert.equal(historyTaskListObservation(value, selection.vaultId, 20), value);
  for (const mutate of [x => x.identity.vaultId = 'another-vault', x => x.items.push(x.items[0]),
    x => x.nextCursor = 'another-head:1', x => x.nextCursor = 'synthetic-task-head:1:extra']) {
    const copy = structuredClone(value); mutate(copy);
    assert.throws(() => historyTaskListObservation(copy, selection.vaultId, 1), /mismatch/);
  }
});
