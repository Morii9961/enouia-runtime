import assert from 'node:assert/strict';
import test from 'node:test';
import { automationRead, setAutomationTransport, snapshotKey } from '../src/memory/automation.ts';
const response = { schema_version: 2, capability: 'memory-native-read-1', effect: 'native_read', kind: 'runtime_memory_automation_status', mode: 'synthetic_only', state: 'disabled' };
test('automatic reads use the independent native capability, not legacy IPC', async () => {
  const sent = [];
  setAutomationTransport(async (command, args) => { sent.push({ command, args }); return response; });
  assert.equal((await automationRead({ operation: 'status' })).state, 'disabled');
  assert.deepEqual(sent, [{ command: 'memory_automation', args: { request: { schema_version: 2, capability: 'memory-native-read-1', query: { operation: 'status' } } } }]);
});
test('unknown versions, effects, kinds and modes fail before business interpretation', async () => {
  for (const changed of [{ schema_version: 99 }, { capability: 'future-read' }, { effect: 'synthetic_fixture' }, { kind: 'owner_confirmed' }, { mode: 'production' }]) {
    setAutomationTransport(async () => ({ ...response, ...changed }));
    await assert.rejects(automationRead({ operation: 'status' }));
  }
  setAutomationTransport(async () => response);
  await assert.rejects(automationRead({ operation: 'page' }));
});
test('snapshot identity is order independent and rejects missing or unsafe watermarks', () => {
  const a = { vault_id: 'synthetic-vault', base_commit_id: 'synthetic-commit', primary_epoch: 1, policy_watermark: 1, deletion_watermark: 1 };
  assert.equal(snapshotKey(a), snapshotKey({ deletion_watermark: 1, policy_watermark: 1, primary_epoch: 1, base_commit_id: 'synthetic-commit', vault_id: 'synthetic-vault' }));
  assert.throws(() => snapshotKey({ ...a, policy_watermark: 0 }));
  assert.throws(() => snapshotKey({ ...a, deletion_watermark: 9007199254740992 }));
});

test('only pure reads reobserve explicit native Busy with the original query', async () => {
  const query = { operation: 'status' };
  let calls = 0;
  setAutomationTransport(async (_command, args) => {
    calls += 1;
    assert.equal(args.request.query.operation, 'status');
    if (calls === 1) { query.operation = 'lock'; throw 'automation_busy'; }
    return response;
  });
  await automationRead(query);
  assert.equal(calls, 2);
});
test('controls and unknown or stale outcomes are never replayed', async () => {
  for (const [operation, error] of [['lock', 'automation_busy'], ['unlock', 'automation_busy'], ['page', 'automation_stale'], ['status', 'worker_failed']]) {
    let calls = 0;
    setAutomationTransport(async () => { calls += 1; throw error; });
    await assert.rejects(automationRead({ operation }), actual => actual === error);
    assert.equal(calls, 1);
  }
});

test('lifecycle acknowledgements carry a control effect, never a read or memory receipt', async () => {
  setAutomationTransport(async () => ({ ...response, effect: 'native_control', state: 'locked' }));
  assert.equal((await automationRead({ operation: 'lock' })).effect, 'native_control');
  await assert.rejects(automationRead({ operation: 'status' }));
});
