// View helpers must not invent history: explicit zeros stay zero, gaps stay
// gaps and exact totals keep every digit.
import assert from 'node:assert/strict';
import test from 'node:test';
import { age, calendar, currentDay, dateInShanghai, exact, level, requiresRunConfirmation, shiftDate, thresholds } from '../src/activity/model.ts';

test('production send confirmation survives missing or conflicting optional producer metadata', () => {
  const producer = { mode: 'production', deliveryEnabled: true, paused: false, highestReserved: 1 };
  assert.equal(requiresRunConfirmation('production', producer), true);
  assert.equal(requiresRunConfirmation('production', undefined), true);
  assert.equal(requiresRunConfirmation('production', { ...producer, mode: 'sandbox' }), true);
  assert.equal(requiresRunConfirmation('sandbox', producer), true);
  assert.equal(requiresRunConfirmation('production', { ...producer, deliveryEnabled: false }), false);
  assert.equal(requiresRunConfirmation('sandbox', { ...producer, mode: 'sandbox' }), false);
  assert.equal(requiresRunConfirmation('sandbox', undefined), false);
});

const summary = { firstDate: '2026-09-20', lastDate: '2026-09-26', lastSuccessAt: '2026-09-26T08:00:00.000Z' };
const days = [
  { date: '2026-09-20', value: 3 }, { date: '2026-09-22', value: 0 },
  { date: '2026-09-25', value: 9 }, { date: '2026-09-26', value: 1 },
];

test('calendar keeps known, explicit zero, missing, outside and future days distinct', () => {
  const columns = calendar(days, summary, '2026-09-26', 2);
  assert.equal(columns.length, 2);
  assert(columns.every((c) => c.length === 7 && new Date(`${c[0].date}T00:00:00Z`).getUTCDay() === 0));
  const cells = new Map(columns.flat().map((c) => [c.date, c]));
  assert.equal(cells.get('2026-09-22').state, 'known');
  assert.equal(cells.get('2026-09-22').value, 0);
  assert.equal(cells.get('2026-09-22').level, 0);
  assert.equal(cells.get('2026-09-21').state, 'missing');
  assert.equal(cells.get('2026-09-21').value, null);
  assert.equal(cells.get('2026-09-19').state, 'outside');
  assert.equal(cells.get('2026-09-25').level, 4);
  assert(cells.get('2026-09-26').incomplete);
  assert(!cells.get('2026-09-25').incomplete);
  const after = calendar(days, summary, '2026-09-24', 1).flat();
  assert(after.filter((c) => c.date > '2026-09-24').every((c) => c.state === 'future'));
});

test('levels use only positive values and zero stays level 0', () => {
  assert.deepEqual(thresholds([0, 0]), []);
  assert.equal(level(0, thresholds([1, 2, 3, 4])), 0);
  assert.equal(level(100, thresholds([1, 2, 3, 4])), 4);
});

test('exact totals keep every digit beyond float precision', () => {
  assert.equal(exact('9007199254740991'), '9,007,199,254,740,991');
  assert.equal(exact('12345678901234567890'), '12,345,678,901,234,567,890');
  assert.equal(exact(0), '0');
});

test('dates and ages', () => {
  assert.equal(shiftDate('2024-03-01', -1), '2024-02-29');
  assert.equal(dateInShanghai(new Date('2026-09-30T16:30:00Z')), '2026-10-01');
  const now = Date.parse('2026-10-07T12:00:00Z');
  assert.equal(age('2026-10-07T09:00:00Z', now), '3 h ago');
  assert.equal(age(null, now), null);
});

test('the current day follows each source boundary', () => {
  // 2026-09-26T17:00Z is already 2026-09-27 in Asia/Shanghai.
  assert.equal(currentDay('2026-09-26', '2026-09-26T17:00:00.000Z', true), false);
  assert.equal(currentDay('2026-09-27', '2026-09-26T17:00:00.000Z', true), true);
  assert.equal(currentDay('2026-09-25', '2026-09-26T17:00:00.000Z', false), true);
  assert.equal(currentDay('2026-09-24', '2026-09-26T17:00:00.000Z', false), false);
  assert.equal(currentDay('2026-09-26', null, false), false);
});

test('date-only observations do not invent an elapsed age', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  assert.equal(age('2026-10-09', now), null);
  assert.equal(age('2026-10-10', now), null);
  assert.equal(age('2026-10-09T12:00:00+03:00', Date.parse('2026-10-09T10:00:00Z')), '60 min ago');
});

test('future observations have unknown age after a clock rollback', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  assert.equal(age('2026-10-10T12:00:00.001Z', now), null);
  assert.equal(age('2026-10-10T20:30:00+08:00', now), null);
  assert.equal(age('2026-10-10T12:00:00Z', now), '0 s ago');
  assert.equal(age('2026-10-10T11:59:59.999Z', now), '0 s ago');
  assert.equal(age('2026-10-10T10:00:00Z', now), '2 h ago');
});
