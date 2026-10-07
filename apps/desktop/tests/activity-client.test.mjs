// The Activity client sends Activity IPC v1 requests through `activity_call`
// and package choices through `activity_setup` (ADR-028). A fake transport
// stands in for the shell; no runner or store is involved here.
import assert from 'node:assert/strict';
import test from 'node:test';
import { ActivityError, activity, describe, describeSetup, retryable, setTransport } from '../src/activity/client.ts';

function recorder(reply) {
  const sent = [];
  setTransport(async (command, args) => { sent.push({ command, args }); return reply(command, args); });
  return sent;
}

test('each operation sends exactly its IPC v1 request shape', async () => {
  const sent = recorder((command, { request }) => {
    const kind = {
      activity_get_overview: 'activity_overview', activity_preview_public_payload: 'activity_public_preview',
      activity_get_days: 'activity_days', activity_run_now: 'activity_run_accepted', activity_retry_pending: 'activity_run_accepted',
      activity_set_paused: 'activity_pause_acknowledged', activity_get_run: 'activity_run_status',
    }[request.operation];
    return { schemaVersion: 1, kind, runId: 'run-1', paused: request.paused };
  });
  await activity.overview();
  await activity.preview();
  await activity.days('codex', '2026-09-01', '2026-09-30');
  await activity.runNow();
  await activity.retryPending();
  await activity.setPaused(true);
  await activity.run('run-1');
  assert(sent.every((s) => s.command === 'activity_call'));
  assert.deepEqual(sent.map((s) => s.args.request), [
    { operation: 'activity_get_overview' },
    { operation: 'activity_preview_public_payload' },
    { operation: 'activity_get_days', source: 'codex', from: '2026-09-01', to: '2026-09-30' },
    { operation: 'activity_run_now' },
    { operation: 'activity_retry_pending' },
    { operation: 'activity_set_paused', paused: true },
    { operation: 'activity_get_run', runId: 'run-1' },
  ]);
});

test('structured errors surface as stable text, never subprocess output', async () => {
  recorder(() => ({ schemaVersion: 1, kind: 'activity_error', error: { code: 'busy', component: 'activity_archive', retryable: true } }));
  const error = await activity.overview().catch((e) => e);
  assert(error instanceof ActivityError);
  assert.equal(error.error.code, 'busy');
  assert.equal(retryable(error), true);
  assert.match(describe(error), /busy/);
  assert.equal(describe(new Error('C:\Users\private\path')), 'The Activity call failed');
});

test('a wrong kind or version is a contract failure, not data', async () => {
  for (const reply of [{ schemaVersion: 2, kind: 'activity_overview' }, { schemaVersion: 1, kind: 'activity_days' }, null]) {
    recorder(() => reply);
    const error = await activity.overview().catch((e) => e);
    assert.equal(error.error.code, 'contract_invalid');
    assert.equal(retryable(error), false);
  }
});

test('package setup goes through its own command and maps refusal codes', async () => {
  const sent = recorder(() => ({ configured: false, error: 'binary_changed' }));
  const result = await activity.setup('select');
  assert.deepEqual(sent, [{ command: 'activity_setup', args: { action: 'select' } }]);
  assert.match(describeSetup(result.error), /hash/);
});
