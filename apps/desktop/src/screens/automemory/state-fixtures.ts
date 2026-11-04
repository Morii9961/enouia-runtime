// Additional invented browser-only states. The original 15-record fixture stays intact.
import { AUTO_MEMORIES as ORIGINAL, type AutoMemory } from './fixture';

const OPEN_ENDED: AutoMemory = {
    id: 'demo_open_01', kind: 'project_state', title: 'Adapter work, end not recorded',
    statement: 'The adapter work started in September. Its end was not recorded.',
    state: 'adopted', rev: 'r1', themes: ['vault'],
    occurred: { precision: 'range', start: '2026-09-14', end: null },
    valid: { from: null, to: null, note: 'No validity window recorded' },
    received: '2026-10-01T06:12:08Z', known: '2026-10-01T06:20:00Z', revised: '2026-10-01T06:20:00Z',
    why: 'The material gives a start but no end. An open end does not establish that the work is still ongoing.',
    support: [{ source: 'Invented adapter note', role: 'imported note', rev: 'src r1', excerpt: 'Adapter work started on 14 September.', received: '2026-10-01T06:12:08Z' }],
    contextDeps: [], surfacing: 'sometimes',
    trail: [
      { at: '2026-10-01T06:12:08Z', step: 'received', note: 'Invented material arrived.' },
      { at: '2026-10-01T06:20:00Z', step: 'adopted', note: 'Start retained; end remains unrecorded.' },
    ],
};
export const STATE_MEMORIES: Record<'empty' | 'held' | 'open-ended' | 'source-missing' | 'unknown-result' | 'read-only', AutoMemory[]> = {
  empty: [],
  held: ORIGINAL.filter(m => m.state === 'received' || m.state === 'held'),
  'open-ended': [OPEN_ENDED],
  'source-missing': [{ ...OPEN_ENDED, id: 'demo_missing_01', title: 'Statement retained, source unavailable', support: [],
    why: 'The original source is unavailable in this invented state. The retained statement is not new evidence.' }],
  'unknown-result': ORIGINAL,
  'read-only': ORIGINAL,
};
// Plain invented display text, deliberately not a Memory wire schema or request.
export const UNKNOWN_KEY = 'demo-only-unknown-0001';
export const UNKNOWN_PACKET = 'DEMO ONLY — not a Memory request\nAction: invented preview action\nKey: demo-only-unknown-0001\nResult: unknown';
