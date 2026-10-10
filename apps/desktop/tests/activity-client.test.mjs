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
    if (kind === 'activity_pause_acknowledged') return { schemaVersion: 1, kind, paused: request.paused };
    if (kind === 'activity_run_status') return { schemaVersion: 1, kind, runId: request.runId, stage: 'completed', error: null };
    return { schemaVersion: 1, kind, runId: 'run-1' };
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

test('setup accepts only the native status, selection and clear reply shapes', async () => {
  const installed = { configured: true, mode: 'sandbox', taskName: 'Enouia-Activity-Test_1', folder: 'installed & independent' };
  for (const [action, reply] of [['status', installed], ['status', { ...installed, mode: 'production', folder: null }],
    ['status', { configured: false }], ['status', { ...installed, taskName: 'Enouia-Activity-' + 'a'.repeat(80), folder: '合成目录' }],
    ['select', { ...installed, saved: false }], ['select', { ...installed, saved: true }],
    ['select', { cancelled: true }], ['clear', { configured: false, saved: true }],
    ...['not_found', 'not_a_package', 'binary_changed'].map(error => ['select', { configured: false, error }])]) {
    const sent = recorder(() => reply);
    assert.deepEqual(await activity.setup(action), reply);
    assert.deepEqual(sent, [{ command: 'activity_setup', args: { action } }]);
  }
});

test('setup refuses malformed fields and mismatched action replies before the page sees them', async () => {
  const installed = { configured: true, mode: 'sandbox', taskName: 'Enouia-Activity-Test_1', folder: 'package' };
  const cases = [null, [], {}, { ...installed, mode: 'future' }, { ...installed, folder: 'C:\\private\\package' },
    { ...installed, taskName: '../private' }, { ...installed, taskName: 'Enouia-Activity-Test_1\n' }, { ...installed, taskName: 'Enouia-Activity-' + 'a'.repeat(81) },
    { ...installed, folder: '' }, { ...installed, folder: '..' }, { ...installed, folder: '/private' }, { ...installed, folder: 'private\0package' },
    { ...installed, rawConfig: 'SYNTHETIC_PRIVATE_MARKER' }, { ...installed, cancelled: true },
    { ...installed, saved: 'yes' }, { configured: false, error: 'constructor' }, { cancelled: true }];
  for (const reply of cases) {
    recorder(() => reply);
    await assert.rejects(activity.setup('status'), e => e instanceof ActivityError && e.error.code === 'contract_invalid' && !retryable(e));
  }
  for (const [action, reply] of [['select', installed], ['select', { configured: false }],
    ['select', { configured: false, error: 'C:\\private\\package' }], ['clear', installed],
    ['clear', { configured: false }], ['clear', { configured: false, saved: true, cancelled: true }]]) {
    recorder(() => reply);
    await assert.rejects(activity.setup(action), e => e instanceof ActivityError && e.error.code === 'contract_invalid');
  }
});

test('setup refusal text never resolves inherited object entries', () => {
  for (const code of ['constructor', 'toString', '__proto__', 'SYNTHETIC_PRIVATE_MARKER']) {
    assert.equal(describeSetup(code), 'The installed package could not be selected');
  }
});

test('native setup busy errors explain that the running producer must finish', () => {
  assert.match(describe('busy'), /busy with another run/);
  for (const text of ['constructor', 'C:/synthetic-private', 'unknown']) {
    assert.equal(describe(text), 'The Activity call failed');
  }
});

test('configured status accepts an optional verified saved flag, never arbitrary metadata', async () => {
  const installed={configured:true,mode:'sandbox',taskName:'Enouia-Activity-Test',folder:'package'};
  for(const saved of [true,false]) {recorder(()=>({...installed,saved}));assert.deepEqual(await activity.setup('status'),{...installed,saved});}
  for(const saved of ['yes',null,0]) {recorder(()=>({...installed,saved}));await assert.rejects(activity.setup('status'),e=>e.error.code==='contract_invalid');}
});

test('unconfigured status preserves an explicit clear outcome without accepting private metadata', async () => {
  for (const saved of [true, false]) {
    const reply = { configured: false, saved };
    recorder(() => reply);
    assert.deepEqual(await activity.setup('status'), reply);
  }
  for (const reply of [{ configured: false, saved: null }, { configured: false, saved: 'no' },
    { configured: false, saved: false, installRoot: 'C:/synthetic-private' }]) {
    recorder(() => reply);
    await assert.rejects(activity.setup('status'), e => e.error.code === 'contract_invalid');
  }
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

test('pending sequences refuse zero, negative, fractional, unsafe and nonnumeric values', async () => {
  const pending = { sequence: 1, createdAt: null, ageSeconds: 0, exactSha256: 'b'.repeat(64), failureCount: 0, nextEligibleAt: null, lastErrorCode: null };
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1']) {
    for (const field of ['delivery', 'pending']) {
      const o = overview();
      if (field === 'delivery') o.delivery.pendingSequence = value;
      else { o.delivery.pendingSequence = 1; o.pending = { ...pending, sequence: value }; }
      recorder(() => o);
      await assert.rejects(activity.overview(), error => error instanceof ActivityError && error.error.code === 'contract_invalid', `${field}: ${value}`);
    }
  }
});

test('pending sequences keep exact positive limits and legitimate empty state', async () => {
  const empty = overview(); empty.producer.highestReserved = 0;
  recorder(() => empty); assert.deepEqual(await activity.overview(), empty);
  for (const sequence of [1, Number.MAX_SAFE_INTEGER]) {
    const o = overview();
    o.delivery.pendingSequence = sequence;
    o.pending = { sequence, createdAt: null, ageSeconds: 0, exactSha256: 'b'.repeat(64), failureCount: 0, nextEligibleAt: null, lastErrorCode: null };
    o.producer.highestReserved = sequence;
    recorder(() => o); assert.deepEqual(await activity.overview(), o);
  }
});

test('diagnostic and payload replies reject extra fields at every exported boundary', async () => {
  const marker = 'SYNTHETIC_PRIVATE_MARKER';
  const overviewCases = [
    o => o.rawConfig = marker,
    o => o.sources.github.rawTitle = marker,
    o => o.schedule.configPath = marker,
    o => o.schedule.task.rawXml = marker,
    o => o.delivery.rawStderr = marker,
    o => o.producer.environment = marker,
    o => o.health.push({ id: 'activity_archive', state: 'healthy', mode: 'idle', observedAt: null, lastSuccessAt: null, ageSeconds: null, privatePath: marker }),
  ];
  const pending = { sequence: 1, createdAt: null, ageSeconds: 0, exactSha256: 'b'.repeat(64), failureCount: 0, nextEligibleAt: null, lastErrorCode: null };
  overviewCases.push(o => o.pending = { ...pending, rawReceipt: marker });
  for (const mutate of overviewCases) {
    const o = overview(); mutate(o); recorder(() => o);
    await assert.rejects(activity.overview(), e => e.error.code === 'contract_invalid' && !describe(e).includes(marker));
  }
  for (const mutate of [p => p.rawConfig = marker, p => p.data.privatePath = marker,
    p => p.data.sources.github.rawReport = marker, p => p.data.sources.github.days[0].rawTitle = marker]) {
    const p = preview(); mutate(p); recorder(() => p);
    await assert.rejects(activity.preview(), e => e.error.code === 'contract_invalid');
  }
  recorder(() => ({ schemaVersion: 1, kind: 'activity_days', source: 'github', days: [], privatePath: marker }));
  await assert.rejects(activity.days('github', '2026-01-01', '2026-12-31'), e => e.error.code === 'contract_invalid');
});

test('exported time and component fields cannot carry raw text', async () => {
  const marker = 'C:/synthetic-private/config.json';
  for (const mutate of [o => o.generatedAt = marker, o => o.sources.codex.lastSuccessAt = marker,
    o => o.schedule.nextTriggerAt = marker, o => o.delivery.lastTransportAt = marker,
    o => o.health.push({ id: marker, state: 'healthy', mode: 'idle', observedAt: null, lastSuccessAt: null, ageSeconds: null })]) {
    const o = overview(); mutate(o); recorder(() => o);
    await assert.rejects(activity.overview(), e => e.error.code === 'contract_invalid');
  }
  const p = preview(); p.data.sources.github.updatedAt = marker; recorder(() => p);
  await assert.rejects(activity.preview(), e => e.error.code === 'contract_invalid');
  for (const error of [{ code: 'busy', component: marker, retryable: true },
    { code: 'busy', component: 'activity_archive', retryable: true, rawStderr: marker }]) {
    recorder(() => ({ schemaVersion: 1, kind: 'activity_error', error }));
    await assert.rejects(activity.overview(), e => e.error.code === 'contract_invalid');
  }
});

test('supported dates and explicit-offset times remain valid without host-zone parsing', async () => {
  for (const time of ['2024-02-29', '2026-10-08T00:00Z', '2026-10-08T08:00:00+08:00', '2026-10-08T00:00:00.123456Z']) {
    const p = preview(); p.data.sources.github.updatedAt = time; recorder(() => p);
    assert.equal((await activity.preview()).data.sources.github.updatedAt, time);
  }
  for (const time of ['2026-02-30T00:00:00Z', '2026-10-08T24:00:00Z', '2026-10-08T00:00:00+24:00', '2026-10-08T00:00:00', 'Thu, 08 Oct 2026 00:00:00 GMT']) {
    const p = preview(); p.data.sources.github.updatedAt = time; recorder(() => p);
    await assert.rejects(activity.preview(), e => e.error.code === 'contract_invalid');
  }
});

test('run status must identify the requested run and keep its documented fields', async () => {
  for (const reply of [
    { schemaVersion: 1, kind: 'activity_run_status', runId: 'another-run', stage: 'completed', error: null },
    { schemaVersion: 1, kind: 'activity_run_status', runId: '../private', stage: 'completed', error: null },
    { schemaVersion: 1, kind: 'activity_run_status', runId: 'run-1', stage: 'completed', error: null, privatePath: 'SYNTHETIC_PRIVATE' },
    { schemaVersion: 1, kind: 'activity_run_status', runId: 'run-1', stage: 'completed', error: null, operation: 'memory_list' },
  ]) {
    recorder(() => reply);
    await assert.rejects(activity.run('run-1'), e => e instanceof ActivityError && e.error.code === 'contract_invalid');
  }
  const valid = { schemaVersion: 1, kind: 'activity_run_status', runId: 'run-1', stage: 'running', error: null, operation: 'activity_run_now', summary: null };
  recorder(() => valid);
  assert.deepEqual(await activity.run('run-1'), valid);
});

test('filtered days cannot switch sources or escape the requested inclusive date range', async () => {
  for (const reply of [
    { schemaVersion: 1, kind: 'activity_days', source: 'codex', days: [] },
    { schemaVersion: 1, kind: 'activity_days', source: 'github', days: [{ date: '2026-08-31', value: 1 }] },
    { schemaVersion: 1, kind: 'activity_days', source: 'github', days: [{ date: '2026-10-01', value: 1 }] },
  ]) {
    recorder(() => reply);
    await assert.rejects(activity.days('github', '2026-09-01', '2026-09-30'), e => e.error.code === 'contract_invalid');
  }
  const valid={schemaVersion:1,kind:'activity_days',source:'github',days:[{date:'2026-09-01',value:0},{date:'2026-09-30',value:1}]};
  recorder(() => valid);
  assert.deepEqual((await activity.days('github','2026-09-01','2026-09-30')).days,valid.days);
});

test('accepted runs and pause acknowledgements use exact fields and the requested state', async () => {
  for(const reply of [
    {schemaVersion:1,kind:'activity_run_accepted',runId:'run-1',privatePath:'SYNTHETIC_PRIVATE'},
    {schemaVersion:1,kind:'activity_pause_acknowledged',paused:false},
    {schemaVersion:1,kind:'activity_pause_acknowledged',paused:true,runId:'wrong-branch'},
  ]) {
    recorder(() => reply);
    const call=reply.kind==='activity_run_accepted'?activity.runNow:()=>activity.setPaused(true);
    await assert.rejects(call(),e=>e.error.code==='contract_invalid');
  }
  for(const paused of [true,false]) {
    recorder(()=>({schemaVersion:1,kind:'activity_pause_acknowledged',paused}));
    assert.equal((await activity.setPaused(paused)).paused,paused);
  }
});
