import assert from 'node:assert/strict';
import test from 'node:test';
import { captureCall, setCaptureTransport, settled } from '../src/memory/capture.ts';
import { CAPABILITY, status, preflight, write, jobs, page } from '../e2e/fixtures/capture.mjs';

test('capture uses its own native port and names exchanges only', async () => {
  const sent = [];
  setCaptureTransport(async (command, args) => { sent.push({ command, args }); return write(1); });
  const result = await captureCall({ operation: 'write', exchange: 1 });
  assert.equal(result.queue.state, 'queued');
  assert.deepEqual(sent.map(s => s.command), ['memory_capture']);
  assert.deepEqual(sent[0].args.request, { schema_version: 2, capability: CAPABILITY, query: { operation: 'write', exchange: 1 } });
});
test('wrong kinds, effects, exchanges and receipts are refused', async () => {
  const cases = [
    ['status', {}, { ...status(), capability: 'memory-native-read-2' }],
    ['status', {}, { ...status(), effect: 'native_control' }],
    ['status', {}, { ...status('expired'), available: true }],
    ['status', {}, { ...status(), state: 'owner_confirmed' }],
    ['status', {}, { ...status(), conversations: [] }],
    ['lock', {}, status('locked')],
    ['preflight', { exchange: 0 }, preflight(1)],
    ['preflight', { exchange: 0 }, { ...preflight(0), capture: { captured: true, replayed: false, formation_scheduled: false } }],
    ['write', { exchange: 0 }, { ...write(0), effect: 'native_read' }],
    ['write', { exchange: 0 }, { ...write(0), capture: { captured: true, replayed: false, formation_scheduled: true } }],
    ['write', { exchange: 0 }, { ...write(0), queue: null, queue_error: null }],
    ['write', { exchange: 0 }, { ...write(0), queue_error: 'capture_refused' }],
    ['jobs', { exchange: 2 }, jobs(1, ['formed'])],
    ['jobs', { exchange: 2 }, { ...jobs(2, ['formed']), jobs: [{ job_key: 'x', state: 'approved', receipts: 1, refused: 0 }] }],
    ['page', { cursor: null, limit: 1 }, page(['a', 'b'])],
    ['page', { cursor: null, limit: 32 }, { ...page(['a']), items: [{ title: 'a' }] }],
  ];
  for (const [operation, args, bad] of cases) {
    setCaptureTransport(async () => bad);
    await assert.rejects(captureCall({ operation, ...args }), e => e === 'capture_response_unsupported', `${operation} ${JSON.stringify(bad).slice(0, 80)}`);
  }
});
test('every failure is one send without fallback or resend', async () => {
  for (const operation of ['status', 'preflight', 'write', 'jobs', 'page', 'lock'])
    for (const error of ['capture_outcome_unknown', 'capture_busy', 'worker_failed']) {
      let calls = 0;
      setCaptureTransport(async () => { calls++; throw error; });
      await assert.rejects(captureCall({ operation, exchange: 0, cursor: null, limit: 32 }), actual => actual === error);
      assert.equal(calls, 1);
    }
});
test('jobs settle only on terminal Memory states', () => {
  assert.equal(settled([]), false);
  assert.equal(settled(jobs(0, ['formed', 'forming']).jobs), false);
  assert.equal(settled(jobs(0, ['formed', 'no_memory']).jobs), true);
  assert.equal(settled(jobs(0, ['analysis_unknown']).jobs), true);
});
