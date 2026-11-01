// Saved event order is authoritative. A clock cannot reorder or fill gaps in it.
export function savedEventTime(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

export function sessionRuler(events: { occurredAt?: unknown }[]) {
  const times = events.map(e => savedEventTime(e.occurredAt));
  const ordered = times.length > 0 && times.every((at, i) => at != null && (i === 0 || (times[i - 1] != null && at >= times[i - 1]!)));
  return {
    times, ordered,
    gaps: times.map((at, i) => {
      const previous = times[i - 1];
      const minutes = at != null && previous != null ? Math.max(0, (at - previous) / 60_000) : 0;
      return { pixels: Math.min(48, Math.round(minutes * 2)), minutes: Math.round(minutes) };
    }),
  };
}

export type CoverageSegment = 'start' | 'mid' | 'end' | 'only' | null;

/** Coverage is membership in saved IDs, independent of timestamps or summaries. */
export function checkpointCoverage(eventIds: string[], value: unknown) {
  const valid = Array.isArray(value) && value.every(id => typeof id === 'string' && id.length > 0);
  const covered = new Set<string>(valid ? value : []);
  const visible = new Set(eventIds);
  const flags = eventIds.map(id => covered.has(id));
  const segments: CoverageSegment[] = flags.map((on, i) => !on ? null : !flags[i - 1]
    ? flags[i + 1] ? 'start' : 'only' : flags[i + 1] ? 'mid' : 'end');
  return { known: valid, segments, outside: [...covered].filter(id => !visible.has(id)).length };
}
