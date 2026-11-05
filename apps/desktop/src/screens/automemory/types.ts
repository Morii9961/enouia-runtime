export interface ViewProps { sel: string; select: (id: string) => void }
export type ViewId = 'formation' | 'grid' | 'timeline' | 'stars' | 'starmap' | 'replacement' | 'evidence' | 'recall';

export type WorkspaceId = 'memories' | 'time' | 'relations' | 'formation' | 'recall';
