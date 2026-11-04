// Explicit browser-only whole-Vault samples. No IPC, storage or real provider.
import { isTauri } from '@tauri-apps/api/core';
import type { DemoMemory } from './demo-state';
const params = new URLSearchParams(globalThis.location?.search);
const asked = isTauri() ? null : params.get('vault-dataset');
export const VAULT_DEMO_STATE = asked === 'empty' || asked === 'candidates' ? asked : 'original';
params.set('vault-dataset', 'original');
export const ORIGINAL_VAULT_HREF = '?' + params.toString();
export const CANDIDATE_ONLY: DemoMemory[] = [
  { key: 'demo_import_01', kind: 'preference', status: 'candidate', content: 'The invented editor should use a compact toolbar.',
    src: { kind: 'import', at: '2026-10-01T06:38:00Z', importer: 'synthetic-note-v1', sha: '0'.repeat(64) },
    created: '2026-10-01T06:38:00Z', conf: 0.4, tags: ['interface'] },
  { key: 'demo_import_02', kind: 'fact', status: 'candidate', content: 'A fictional reading session is planned for next week.',
    src: { kind: 'import', at: '2026-10-01T06:40:00Z', importer: 'synthetic-note-v1', sha: '1'.repeat(64) },
    created: '2026-10-01T06:40:00Z', conf: 0.5, tags: ['reading'] },
];
