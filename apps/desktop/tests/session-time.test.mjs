import test from 'node:test';
import assert from 'node:assert/strict';
import { savedEventTime, sessionRuler } from '../src/memory/sessionTime.ts';

test('session ruler scales known adjacent intervals and caps long gaps', () => {
  const ruler = sessionRuler(['00:00:00', '00:02:30', '01:02:30'].map(time => ({ occurredAt: `2026-11-01T${time}Z` })));
  assert.equal(ruler.ordered, true);
  assert.deepEqual(ruler.gaps, [{ pixels: 0, minutes: 0 }, { pixels: 5, minutes: 3 }, { pixels: 48, minutes: 60 }]);
});

test('unknown times do not bridge two known records or invent a clock', () => {
  const ruler = sessionRuler([{ occurredAt: '2026-11-01T00:00:00Z' }, {}, { occurredAt: '2026-11-01T01:00:00Z' }]);
  assert.equal(ruler.ordered, false);
  assert.equal(ruler.times[1], null);
  assert.deepEqual(ruler.gaps.map(g => g.pixels), [0, 0, 0]);
  for (const value of [null, undefined, {}, 1, '', 'private text', '2026-11-01', '2026-11-01T00:00:00']) assert.equal(savedEventTime(value), null);
});

test('out of order saved records stay in place and cannot supply a time map', () => {
  const events = Object.freeze([Object.freeze({ occurredAt: '2026-11-01T01:00:00Z' }), Object.freeze({ occurredAt: '2026-11-01T00:00:00Z' })]);
  const ruler = sessionRuler([...events]);
  assert.equal(ruler.ordered, false);
  assert.ok(ruler.times[0] > ruler.times[1]);
  assert.equal(ruler.gaps[1].pixels, 0);
  assert.equal(events[0].occurredAt, '2026-11-01T01:00:00Z');
});

test('equal instants with different ISO offsets are ordered without a gap', () => {
  const ruler = sessionRuler([{ occurredAt: '2026-11-01T08:00:00+08:00' }, { occurredAt: '2026-11-01T00:00:00Z' }]);
  assert.equal(ruler.ordered, true);
  assert.equal(ruler.times[0], ruler.times[1]);
  assert.equal(ruler.gaps[1].pixels, 0);
  assert.equal(sessionRuler([]).ordered, false);
});
