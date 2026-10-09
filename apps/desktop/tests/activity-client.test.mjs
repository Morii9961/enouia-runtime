// The Activity client sends Activity IPC v1 requests through `activity_call`
// and package choices through `activity_setup` (ADR-028). A fake transport
// stands in for the shell; no runner or store is involved here.
import assert from 'node:assert/strict';
import test from 'node:test';
import { ActivityError, activity, describe, describeSetup, retryable, setTransport } from '../src/activity/client.ts';
import { overview, preview } from './activity-fixtures.mjs';

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
    if (kind === 'activity_overview') return overview();
    if (kind === 'activity_public_preview') return preview();
    if (kind === 'activity_days') return { schemaVersion: 1, kind, source: request.source, days: [] };
    return { schemaVersion: 1, kind, runId: 'run-1', paused: request.paused, stage: 'completed', error: null };
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

test('malformed data and private error text become local contract failures', async () => {
  const missingSource = overview(); delete missingSource.sources.codex;
  const roundedTotal = overview(); roundedTotal.sources.codex.total = 9007199254740992;
  const missingCalendar = preview(); delete missingCalendar.data.sources.claude;
  for (const [read, reply] of [
    [activity.overview, missingSource], [activity.overview, roundedTotal], [activity.preview, missingCalendar],
    [activity.overview, { schemaVersion: 1, kind: 'activity_error', error: { code: 'C:\\private\\path', retryable: true } }],
    [activity.overview, { schemaVersion: 1, kind: 'activity_error', error: null }],
    [activity.runNow, { schemaVersion: 1, kind: 'activity_run_accepted', runId: '../private' }],
  ]) {
    recorder(() => reply);
    const error = await read().catch(e => e);
    assert(error instanceof ActivityError);
    assert.equal(error.error.code, 'contract_invalid');
    assert.doesNotMatch(describe(error), /private/);
  }
  assert.doesNotMatch(describeSetup('C:\\private\\path'), /private/);
});

test('each Activity source keeps its own unit and day boundary in both replies', async () => {
  for (const id of ['github', 'codex', 'claude']) {
    for (const field of ['timezone', 'metric']) {
      const o = overview();
      o.sources[id][field] = field === 'timezone' ? (id === 'codex' ? 'GitHub' : 'Codex') : (id === 'github' ? 'tokens' : 'contributions');
      const p = preview();
      p.data.sources[id] = { updatedAt: o.sources[id].lastSuccessAt, timezone: o.sources[id].timezone, metric: o.sources[id].metric, days: [] };
      for (const [read, reply] of [[activity.overview, o], [activity.preview, p]]) {
        recorder(() => reply);
        await assert.rejects(read(), e => e instanceof ActivityError && e.error.code === 'contract_invalid');
      }
    }
  }
});

test('Activity calendar replies reject impossible, duplicate, unsorted and unsafe days', async () => {
  const cases = [
    [{ date: '2026-02-30', value: 1 }], [{ date: '2026-02-29', value: 1 }],
    [{ date: '2026-1-01', value: 1 }], [{ date: 'private', value: 1 }],
    [{ date: '2026-10-06', value: 1 }, { date: '2026-10-06', value: 2 }],
    [{ date: '2026-10-07', value: 1 }, { date: '2026-10-06', value: 2 }],
    [{ date: '2026-10-06', value: -1 }], [{ date: '2026-10-06', value: Number.MAX_SAFE_INTEGER + 1 }],
    [{ date: '2026-10-06', value: Number.MAX_SAFE_INTEGER }, { date: '2026-10-07', value: 1 }],
  ];
  for (const days of cases) {
    const p = preview(); p.data.sources.github.days = days;
    for (const [read, reply] of [[activity.preview, p], [() => activity.days('github', '2026-01-01', '2026-12-31'), { schemaVersion: 1, kind: 'activity_days', source: 'github', days }]]) {
      recorder(() => reply);
      await assert.rejects(read(), e => e instanceof ActivityError && e.error.code === 'contract_invalid');
    }
  }
  const p = preview(); p.data.sources.github.days = [{ date: '2024-02-29', value: 0 }, { date: '2026-10-07', value: 12 }];
  recorder(() => p);
  assert.deepEqual((await activity.preview()).data.sources.github.days, p.data.sources.github.days);
});

test('Activity overview date ranges and the public source set stay canonical', async () => {
  for (const mutate of [o => o.sources.github.firstDate = '2026-02-30', o => o.sources.github.lastDate = '2026-01-01',
    o => o.sources.github.firstDate = null, o => o.sources.claude_design = o.sources.claude]) {
    const o = overview(); mutate(o); recorder(() => o);
    await assert.rejects(activity.overview(), e => e.error.code === 'contract_invalid');
  }
  const p = preview(); p.data.sources.claude_design = p.data.sources.claude;
  recorder(() => p);
  await assert.rejects(activity.preview(), e => e.error.code === 'contract_invalid');
});
