// Browser demo selection is fixed for this module load. No Vault, IPC or persistence.
import { AUTO_MEMORIES as ORIGINAL, RELATIONS as ORIGINAL_RELATIONS, RECALL_CASES as ORIGINAL_CASES } from './fixture';
import { COVERAGE_MEMORIES, COVERAGE_MATERIALS } from './coverage-fixtures';
import { STATE_MEMORIES } from './state-fixtures';
import { msg } from '../../i18n/index.ts';

const asked = new URLSearchParams(globalThis.location?.search).get('auto-dataset');
export const DATASET = asked === 'empty' || asked === 'held' || asked === 'open-ended' || asked === 'source-missing' || asked === 'unknown-result' || asked === 'read-only' || asked === 'coverage' ? asked : 'original';
export const DATASETS = [
  { id: 'coverage', label: msg('Coverage sample') },
  { id: 'original', label: msg('Original sample') },
  { id: 'empty', label: msg('Empty sample') },
  { id: 'held', label: msg('Material and hypotheses only') },
  { id: 'open-ended', label: msg('Open-ended time') },
  { id: 'source-missing', label: msg('Source missing') },
  { id: 'unknown-result', label: msg('Result unknown') },
  { id: 'read-only', label: msg('Read-only sample') },
] as const;
export const AUTO_MEMORIES = DATASET === 'original' ? ORIGINAL : DATASET === 'coverage' ? COVERAGE_MEMORIES : STATE_MEMORIES[DATASET];
export const COVERAGE = DATASET === 'coverage' ? {materials:COVERAGE_MATERIALS,memories:COVERAGE_MEMORIES} : null;
const ids = new Set(AUTO_MEMORIES.map(m => m.id));
export const RELATIONS = ORIGINAL_RELATIONS.filter(r => ids.has(r.from) && ids.has(r.to));
// Keep complete recall cases, including their original costs and budget; never prune a
// case into a different result while retaining its old explanation or totals.
export const RECALL_CASES = ORIGINAL_CASES.filter(c => [...c.included, ...c.excluded].every(m => ids.has(m.id)));
export const STREAM = AUTO_MEMORIES.flatMap(m => m.trail.map(t => ({ ...t, id: m.id, title: m.title })))
  .sort((a, b) => a.at < b.at ? 1 : a.at > b.at ? -1 : 0);
export const EMPTY_NOTE = msg('No readable memories in this synthetic sample. Choose another demo state to inspect invented records. Nothing is read or created.');
export const HELD_NOTE = msg('Only received material and held hypotheses are shown. Nothing has been adopted for recall. Inspect the material or choose another demo state.');
