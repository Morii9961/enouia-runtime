import test from 'node:test';
import assert from 'node:assert/strict';
import { operationObservation, operationListObservation } from '../src/memory/observationIdentity.ts';

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

test('missing or malformed progress is refused before rendering, including terminal reads', () => {
  for (const progress of [null, undefined, [], {}, { done: 0 }, { done: -1, total: null },
    { done: 0.5, total: null }, { done: Infinity, total: null }, { done: '0', total: null },
    { done: 0, total: -1 }, { done: 0, total: 1.5 }, { done: 0, total: {} }]) {
    assert.throws(() => operationObservation({ ...status('succeeded'), progress }, id), /fields mismatch/);
  }
  for (const progress of [{ done: 0, total: null }, { done: 2, total: 3 }, { done: 3, total: 2 }]) {
    const saved = { ...status(), progress };
    assert.equal(operationObservation(saved, id), saved);
  }
});

test('operation state and cancellation acknowledgement keep the fixed Core field types', () => {
  for (const state of [null, undefined, 'unknown', 'constructor', {}]) {
    assert.throws(() => operationObservation({ ...status(), state }, id), /fields mismatch/);
  }
  for (const cancelRequested of [null, undefined, 0, 1, 'false', {}]) {
    assert.throws(() => operationObservation({ ...status(), cancelRequested }, id), /fields mismatch/);
  }
  const acknowledged = { ...status(), cancelRequested: true };
  assert.equal(operationObservation(acknowledged, id), acknowledged);
});

test('operation lists retain exact valid rows and the actual empty list', () => {
  for (const items of [[], [status()], [status(), { ...status(), operationId: 'op_backup', kind: 'backup_export' }]]) {
    const page = { items };
    assert.equal(operationListObservation(page), page);
  }
});

test('bad pages, invalid rows and duplicate IDs cannot replace a valid operation list', () => {
  for (const page of [null, {}, { items: null }, { items: {} }, { items: [null] },
    { items: [{ ...status(), operationId: '' }] }, { items: [{ ...status(), progress: null }] },
    { items: [status(), status('succeeded')] }]) {
    assert.throws(() => operationListObservation(page), /mismatch/);
  }
});
