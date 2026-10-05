// The Memory client sends workspace IPC v1 envelopes through `memory_call`
// and native picks through `memory_pick` (ADR-025). A fake transport stands
// in for the shell; no Core or Vault is involved here. The pinned Core is
// covered by src-tauri/tests/memory_core.rs.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CallError, call, describe, pick, retryable, setTransport } from '../src/memory/client.ts';

const KEY = /^[A-Za-z0-9_-]{16,128}$/;
const REQUEST_ID = /^req_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function recorder(reply) {
  const sent = [];
  setTransport(async (command, args) => { sent.push({ command, args }); return reply(command, args); });
  return sent;
}

test('reads send a null key and return only the result', async () => {
  const sent = recorder(() => ({ kind: 'memory_page', result: { items: [] }, error: null }));
  const result = await call('memory_list', { includeInactive: false, cursor: null, limit: 25 });
  assert.deepEqual(result, { items: [] });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].command, 'memory_call');
  const { request } = sent[0].args;
  assert.deepEqual(Object.keys(request), ['schemaVersion', 'requestId', 'command', 'idempotencyKey', 'arguments']);
  assert.equal(request.schemaVersion, 1);
  assert.match(request.requestId, REQUEST_ID);
  assert.equal(request.command, 'memory_list');
  assert.equal(request.idempotencyKey, null);
  assert.deepEqual(request.arguments, { includeInactive: false, cursor: null, limit: 25 });
});

test('writes carry a valid key, and a retry can resend the same key', async () => {
  const sent = recorder(() => ({ kind: 'candidate_proposed', result: { state: 'pending' }, error: null }));
  await call('remember', { text: 'Synthetic note', claimKey: 'note.synthetic' });
  await call('remember', { text: 'Synthetic note', claimKey: 'note.synthetic' }, 'ui-retry-0000000000000001');
  const [first, retry] = sent.map((s) => s.args.request);
  assert.match(first.idempotencyKey, KEY);
  assert.ok(first.idempotencyKey.startsWith('ui-'));
  assert.equal(retry.idempotencyKey, 'ui-retry-0000000000000001');
  assert.notEqual(first.requestId, retry.requestId);
});

test('Core errors become CallError with code and rules only', async () => {
  recorder(() => ({ kind: 'memory_error', result: null, error: { code: 'vault_locked', retryable: true, rules: ['workspace.locked'] } }));
  await assert.rejects(call('memory_list', {}), (err) => {
    assert.ok(err instanceof CallError);
    assert.deepEqual(err.error, { code: 'vault_locked', retryable: true, rules: ['workspace.locked'] });
    assert.equal(retryable(err), true);
    assert.equal(describe(err), 'The Vault is not open, or it is locked (workspace.locked)');
    return true;
  });
  const unknown = new CallError({ code: 'offline', retryable: false, rules: [] });
  assert.equal(describe(unknown), 'offline');
  assert.equal(retryable(unknown), false);
});

test('host failures are described but never retried', () => {
  assert.equal(describe('permission_denied'), 'This window may not reach Memory');
  assert.equal(describe('worker_failed'), 'The Memory worker stopped unexpectedly');
  assert.equal(describe(new Error('x')), 'The Memory call failed');
  assert.equal(retryable('worker_failed'), false);
});

test('picks return a token, null on cancel, and CallError on refusal', async () => {
  const sent = recorder((_, args) => args.kind === 'vault_root'
    ? { token: 'tok_0123456789abcdef0123456789abcdef', displayName: 'vault', bytes: null }
    : args.kind === 'import_file' ? { cancelled: true }
      : { error: { code: 'invalid_request', rules: ['workspace.pick_kind'] } });
  assert.deepEqual(await pick('vault_root'), { token: 'tok_0123456789abcdef0123456789abcdef', displayName: 'vault', bytes: null });
  assert.equal(await pick('import_file'), null);
  await assert.rejects(pick('backup_destination'), (err) => err instanceof CallError && err.error.retryable === false);
  assert.deepEqual(sent.map((s) => s.command), ['memory_pick', 'memory_pick', 'memory_pick']);
  assert.deepEqual(sent.map((s) => s.args), [{ kind: 'vault_root' }, { kind: 'import_file' }, { kind: 'backup_destination' }]);
});
