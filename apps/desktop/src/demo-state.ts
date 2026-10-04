/** View fixtures, deliberately separate from canonical Rust/IPC records. */
export type DemoMemory = {
  key: string;
  kind: 'fact' | 'preference' | 'episode' | 'project_state' | 'session_checkpoint';
  status: 'active' | 'candidate' | 'superseded' | 'archived';
  content: string;
  src: { kind: string; at?: string; s?: string; t?: number; importer?: string; sha?: string };
  created: string;
  updated?: string;
  reviewed?: string | null;
  supersedes?: string;
  supersededBy?: string | null;
  conf?: number | null;
  project?: string;
  tags?: string[];
  originalProposal?: DemoMemory;
  editedInReview?: boolean;
};

export function approveDemoCandidate(memories: DemoMemory[], key: string, draft: string | null, at: string): DemoMemory[] {
  const proposal = memories.find(m => m.key === key);
  if (proposal?.status !== 'candidate') throw new Error('Select a candidate before promoting.');
  if (draft !== null && !draft.trim()) throw new Error('Enter memory content before promoting.');
  return memories.map(m => m.key === key ? {
    ...m, status: 'active', originalProposal: { ...m }, reviewed: at, updated: at,
    content: draft ?? m.content, editedInReview: draft !== null && draft !== m.content,
  } : m);
}

export function reviseDemoMemory(memories: DemoMemory[], key: string, draft: string, at: string, revisionKey: string): DemoMemory[] {
  const old = memories.find(m => m.key === key);
  if (old?.status !== 'active' || old.kind === 'session_checkpoint') throw new Error('Select an editable canonical demo memory.');
  if (!draft.trim()) throw new Error('Enter memory content before saving.');
  if (memories.some(m => m.key === revisionKey)) throw new Error('Revision identity already exists. Try again.');
  const revision: DemoMemory = {
    ...old, key: revisionKey, content: draft, src: { kind: 'manual_save', at },
    created: at, updated: at, reviewed: null, supersedes: key, supersededBy: null,
    status: 'active', conf: 1, originalProposal: undefined, editedInReview: undefined,
  };
  return [...memories.map(m => m.key === key ? { ...m, status: 'superseded' as const, supersededBy: revisionKey, updated: at } : m), revision];
}
