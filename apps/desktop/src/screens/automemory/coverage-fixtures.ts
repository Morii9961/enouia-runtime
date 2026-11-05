// Independent invented material identities and current adoption states.
// Browser design data only: not a Memory wire schema, Vault or publication history.
import type { AutoMemory, Occurred } from './fixture';
export const COVERAGE_MATERIALS = [
  { id: 'demo_material_01', revision: 'r1', title: 'Invented shared note', received: '2026-09-29T16:02:00Z' },
  { id: 'demo_material_02', revision: 'r1', title: 'Invented October note', received: '2026-10-01T03:00:00Z' },
  { id: 'demo_material_03', revision: 'r1', title: 'Invented unread material', received: '2026-10-05T08:00:00Z' },
];
export interface CoverageMemory extends AutoMemory { adoption: 'staged' | 'adopted'; sourceIds: string[] }
function memory(id: string, title: string, statement: string, occurred: Occurred, adoption: CoverageMemory['adoption'], sourceId: string, known: string | null): CoverageMemory {
  const source = COVERAGE_MATERIALS.find(s => s.id === sourceId)!;
  return {
    id, title, statement, occurred, adoption, sourceIds: [sourceId], kind: 'episode',
    state: adoption === 'staged' ? 'held' : 'adopted', rev: 'r1', themes: [],
    valid: { from: null, to: null, note: 'No validity window recorded' },
    received: source.received, known, revised: known ?? source.received,
    why: 'Invented current state for the coverage sample. Not a human confirmation.',
    support: [{source:source.title,rev:source.revision,role:'imported note',excerpt:statement,received:source.received}],
    contextDeps: [], surfacing: adoption === 'adopted' ? 'sometimes' : 'not offered',
    trail: [ {at:source.received,step:'received',note:'Invented material received.'},
      {at:known??source.received,step:adoption==='adopted'?'adopted':'held',note:'Invented system decision, not owner approval.'} ],
  };
}
export const COVERAGE_MEMORIES: CoverageMemory[] = [
  memory('demo_coverage_01', 'Invented desk moved', 'A fictional desk was moved on 30 September.',
    {precision:'day',day:'2026-09-30'}, 'adopted', 'demo_material_01', '2026-10-01T00:10:00Z'),
  memory('demo_coverage_02', 'Invented date still unknown', 'A second statement from the same material has no occurred date.',
    {precision:'unknown'}, 'staged', 'demo_material_01', null),
  memory('demo_coverage_03', 'Invented October reading', 'An invented note places some reading in October, without a day.',
    {precision:'month',month:'2026-10'}, 'adopted', 'demo_material_02', '2026-10-02T01:00:00Z'),
  memory('demo_coverage_04', 'Invented three-day range', 'An invented event may overlap 3 to 5 October; it is held.',
    {precision:'range',start:'2026-10-03',end:'2026-10-05'}, 'staged', 'demo_material_02', null),
];
