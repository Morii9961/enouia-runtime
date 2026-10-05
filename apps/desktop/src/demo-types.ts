import type { DemoMemory } from './demo-state';

export type Page = 'home' | 'memory' | 'context' | 'sessions' | 'activity' | 'runtime' | 'settings';
export type WindowAction = 'minimize' | 'maximize' | 'close';
export type DemoSession = {
  key: string; title: string; created: string; id: string;
  turns: [role: 'user' | 'assistant', text: string, at: string][];
  checkpoints: { after: number; mem: string; at: string }[];
};
export type ContextSection = {
  key: string; label: string; field: string; c: string; note: string;
  items: { key: string; bytes: number; reason: string; text?: string; file?: string;
    mem?: string; rank?: number | null; turn?: [string, number];
    loop?: string; from?: string[]; policy?: boolean }[];
};
export type DemoActivity = {
  k: string; at: string; cat: 'context' | 'memory' | 'session' | 'producer';
  title: string; text: string; details: [string, string][];
  link?: [Page, string | null, string];
};
export type DemoRuntime = {
  k: string; code: string; name: string; state: string; tone: 'ok' | 'model' | 'pending' | 'err';
  desc: string; rows: [string, string][]; checks: [string, string][]; limits: string[];
};
export type DetailRow = {
  k: string; v: string; sub?: string; n?: string;
  isPlain: boolean; isMono: boolean; isLink: boolean; onClick?: () => void;
};
export type SessionWrite = { key: string; label: string; ref: string; color: string; onClick: () => void };
export type SessionEvent = {
  isTurn: true; isCheckpoint: false; seq: string; time: string; n: number;
  role: string; roleColor: string; textColor: string; text: string;
  turnShort: string; dot: string; dotColor: string; writes: SessionWrite[];
} | {
  isTurn: false; isCheckpoint: true; seq: string; time: string;
  covered: string; lastState: string; loops: string[]; ref: string;
  dot: string; dotColor: string; onClick: () => void;
};
export type CollectionDefinition = { label: string; items: [key: string, label: string, filter: (m: DemoMemory) => boolean][] };
export type MemoryActions = {
  promote: boolean; promoteLabel: string; onPromote: () => void;
  edit: boolean; editLabel: string; onEdit: () => void;
  save: boolean; saveLabel: string; onSave: () => void; onCancel: () => void; none: boolean;
};
