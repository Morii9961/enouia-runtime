import test from 'node:test';
import assert from 'node:assert/strict';
import { operationObservation } from '../src/memory/observationIdentity.ts';

const id = 'op_synthetic_selected';
const status = (state = 'running') => ({ operationId: id, kind: 'external_send', state,
  cancelRequested: false, progress: { done: 0, total: null }, result: state === 'succeeded' ? { finish: 'completed' } : null });

test('matching operation observations preserve exact active and terminal outcomes', () => {
  for (const state of ['queued', 'running', 'succeeded', 'failed', 'cancelled']) {
    const saved = status(state);
    assert.equal(operationObservation(saved, id, 'external_send'), saved);
  }
});

test('foreign or missing identities cannot be accepted as the selected terminal outcome', () => {
  for (const operationId of ['op_synthetic_other', null, undefined, 1]) {
    assert.throws(() => operationObservation({ ...status('succeeded'), operationId }, id), /identity mismatch/);
  }
  for (const result of [null, undefined, {}, { ...status('succeeded'), operationId: undefined }]) {
    assert.throws(() => operationObservation(result, id), /identity mismatch/);
  }
});

test('the operation kind must match the known model call or an earlier observation', () => {
  for (const kind of ['import', 'backup_export', '', null, undefined, 1]) {
    assert.throws(() => operationObservation({ ...status('succeeded'), kind }, id, 'external_send'), /identity mismatch/);
  }
  const first = operationObservation(status(), id);
  assert.throws(() => operationObservation({ ...status('succeeded'), kind: 'import' }, id, first.kind), /identity mismatch/);
});

test('a generic watcher can bind a first Core kind and then accept only that kind', () => {
  const first = { ...status(), kind: 'backup_export' };
  assert.equal(operationObservation(first, id), first);
  const finished = { ...first, state: 'succeeded', result: { files: 3, sequence: 1 } };
  assert.equal(operationObservation(finished, id, first.kind), finished);
  for (const kind of ['', null, undefined, {}]) {
    assert.throws(() => operationObservation({ ...first, kind }, id), /identity mismatch/);
  }
});
