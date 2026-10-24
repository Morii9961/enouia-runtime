// Synthetic design fixture for the "Automatic memory · synthetic preview" (browser demo only).
// Invented data for a design proposal. It is NOT a Memory contract, wire schema, state enum or
// snapshot of any Vault, and nothing here is running. Do not import it from src/memory/*.
// Copy this file verbatim to apps/desktop/src/screens/automemory/fixture.ts; do not edit the data.

export const AUTO_LABEL = 'Synthetic preview · not running';
export const AUTO_NOTE =
  'Design proposal with invented data. Automatic memory does not run in this build: the real Vault still uses owner review, and nothing here is saved, sent or read from a Vault.';
export const AUTO_ENTRY = 'Automatic memory · synthetic preview';

/** Product narrative states for the preview. Not frozen enums. */
export type AutoState =
  | 'received' | 'held' | 'adopted' | 'reevaluating' | 'consolidated'
  | 'conflict' | 'superseded' | 'fading' | 'archived' | 'corrected';

/** Wording is fixed: machine adoption is never called "approved" or "confirmed". */
export const STATE_LABEL: Record<AutoState, string> = {
  received: 'Received · source only',
  held: 'Held as hypothesis',
  adopted: 'Adopted by system',
  reevaluating: 'Re-evaluating',
  consolidated: 'Consolidated',
  conflict: 'In conflict · held',
  superseded: 'Superseded',
  fading: 'Surfacing less',
  archived: 'Archived',
  corrected: 'Corrected by you',
};
export const STATE_HINT: Record<AutoState, string> = {
  received: 'Material arrived. Nothing has been formed from it yet.',
  held: 'Kept aside until new evidence or a related moment. Not used for recall.',
  adopted: 'The system admitted this on its own. You did not review it, and that is not an outside confirmation.',
  reevaluating: 'New material touched this statement. The current revision stays in use until the check ends.',
  consolidated: 'Several episodes were folded into one stable statement. The originals are kept.',
  conflict: 'Two statements disagree. Both are kept and neither is used as current until it resolves.',
  superseded: 'A newer statement replaced this one. It stays readable in history.',
  fading: 'Still true, still kept. It is offered less often because it has not been relevant lately.',
  archived: 'Kept for history and management. Literal search with history still leaves it out.',
  corrected: 'You changed this. Your correction is recorded as yours, not as a system decision.',
};

export type Kind = 'preference' | 'fact' | 'episode' | 'project_state' | 'session_checkpoint';
export const KIND_LABEL: Record<Kind, string> = {
  preference: 'Preference', fact: 'Fact', episode: 'Episode', project_state: 'Project state', session_checkpoint: 'Checkpoint',
};

/** Occurred time keeps its precision. Unknown is never drawn as a date. */
export type Occurred =
  | { precision: 'instant'; at: string }
  | { precision: 'day'; day: string }
  | { precision: 'month'; month: string }
  | { precision: 'range'; start: string; end: string | null } // end null = open end, still going or not recorded
  | { precision: 'unknown' };

export interface Evidence { source: string; role: 'user said' | 'session excerpt' | 'imported note' | 'manual save'; rev: string; excerpt: string; received: string }
export interface ContextDep { capsule: string; note: string }
export interface Trail { at: string; step: AutoState | 'extracted'; note: string }

export interface AutoMemory {
  id: string;
  kind: Kind;
  title: string;
  statement: string;
  state: AutoState;
  rev: string;
  themes: string[];            // theme ids; every theme is a model suggestion
  occurred: Occurred;
  valid: { from: string | null; to: string | null; note: string };
  received: string;            // when the system got the material
  known: string | null;        // when the system adopted / knew it; null = not adopted
  revised: string;             // current revision time
  why: string;                 // model-proposed explanation, label it as such
  support: Evidence[];         // evidence that supports the statement
  contextDeps: ContextDep[];   // generation dependencies; NOT support, never added to support
  supersedes?: string;
  supersededBy?: string;
  conflictsWith?: string;
  surfacing: 'often' | 'sometimes' | 'rarely' | 'not offered'; // words only, no score
  trail: Trail[];
}

export const THEMES: { id: string; name: string }[] = [
  { id: 'vault', name: 'Vault port work' },
  { id: 'style', name: 'How I like answers' },
  { id: 'night', name: 'Late evenings' },
  { id: 'reading', name: 'Reading' },
  { id: 'trip', name: 'Hangzhou trip' },
  { id: 'interface', name: 'Interface taste' },
];
export const THEME_NOTE = 'Themes are model suggestions. A memory can sit in more than one, and sharing a theme is not a relationship or a cause.';

export const AUTO_MEMORIES: AutoMemory[] = [
  {
    id: 'am_01', kind: 'preference', title: 'Short answers', statement: 'Prefers short, direct answers without extra explanation.',
    state: 'adopted', rev: 'r3', themes: ['style'],
    occurred: { precision: 'instant', at: '2026-09-29T14:32:01Z' }, valid: { from: '2026-09-29', to: null, note: 'Open-ended' },
    received: '2026-09-29T14:32:05Z', known: '2026-09-29T14:40:00Z', revised: '2026-10-12T09:10:00Z',
    why: 'Stated directly and repeated in two later sessions.',
    support: [
      { source: 'Session “Evening, reading notes”', role: 'user said', rev: 'src r1', excerpt: 'Remember that I prefer short answers.', received: '2026-09-29T14:32:05Z' },
      { source: 'Session “Vault adapter planning”', role: 'session excerpt', rev: 'src r2', excerpt: 'Just the conclusion, please.', received: '2026-10-01T06:12:30Z' },
    ],
    contextDeps: [{ capsule: 'cap_7f21…a0c4', note: 'The extractor read an earlier capsule that already held this preference.' }],
    supersedes: 'am_02', surfacing: 'often',
    trail: [
      { at: '2026-09-29T14:32:05Z', step: 'received', note: 'Session turn arrived.' },
      { at: '2026-09-29T14:33:10Z', step: 'extracted', note: 'One preference statement proposed by the model.' },
      { at: '2026-09-29T14:40:00Z', step: 'adopted', note: 'Explicit first-person statement. Replaces an older imported preference.' },
      { at: '2026-10-12T09:10:00Z', step: 'consolidated', note: 'Two later mentions folded in. Wording unchanged.' },
    ],
  },
  {
    id: 'am_02', kind: 'preference', title: 'Thorough explanations', statement: 'Prefers thorough explanations with background context.',
    state: 'superseded', rev: 'r1', themes: ['style'],
    occurred: { precision: 'unknown' }, valid: { from: null, to: '2026-09-29', note: 'Start not recorded' },
    received: '2026-09-12T03:20:04Z', known: '2026-09-12T03:25:00Z', revised: '2026-09-29T14:40:00Z',
    why: 'Imported from an older note without a date.',
    support: [{ source: 'Imported note “assistant-prefs.txt”', role: 'imported note', rev: 'src r1', excerpt: 'Likes full background before the answer.', received: '2026-09-12T03:20:04Z' }],
    contextDeps: [], supersededBy: 'am_01', surfacing: 'not offered',
    trail: [
      { at: '2026-09-12T03:20:04Z', step: 'received', note: 'Note imported.' },
      { at: '2026-09-12T03:25:00Z', step: 'adopted', note: 'No competing statement at the time.' },
      { at: '2026-09-29T14:40:00Z', step: 'superseded', note: 'A direct, newer statement replaced it.' },
    ],
  },
  {
    id: 'am_03', kind: 'preference', title: 'Quiet after eleven', statement: 'Usually up past 23:00. Keep notifications quiet late at night.',
    state: 'adopted', rev: 'r1', themes: ['night', 'style'],
    occurred: { precision: 'instant', at: '2026-09-29T14:40:18Z' }, valid: { from: '2026-09-29', to: null, note: 'Open-ended' },
    received: '2026-09-29T14:40:26Z', known: '2026-09-29T14:41:30Z', revised: '2026-09-29T14:41:30Z',
    why: 'Stated directly. Applies to evenings only.',
    support: [{ source: 'Session “Evening, reading notes”', role: 'user said', rev: 'src r1', excerpt: 'I’m usually up past eleven. Keep things quiet then.', received: '2026-09-29T14:40:26Z' }],
    contextDeps: [], surfacing: 'sometimes',
    trail: [
      { at: '2026-09-29T14:40:26Z', step: 'received', note: 'Session turn arrived.' },
      { at: '2026-09-29T14:41:30Z', step: 'adopted', note: 'Explicit statement with a clear scope.' },
    ],
  },
  {
    id: 'am_04', kind: 'fact', title: 'Hangzhou, end of October', statement: 'Might visit Hangzhou in the last week of October.',
    state: 'held', rev: 'r1', themes: ['trip'],
    occurred: { precision: 'range', start: '2026-10-26', end: '2026-10-31' }, valid: { from: null, to: null, note: 'Plan, not an event' },
    received: '2026-09-29T15:06:30Z', known: null, revised: '2026-09-29T15:07:00Z',
    why: 'Said once, as “might”. Held until it is mentioned again or the week passes.',
    support: [{ source: 'Session “Evening, reading notes”', role: 'user said', rev: 'src r1', excerpt: 'Might go to Hangzhou at the end of October.', received: '2026-09-29T15:06:30Z' }],
    contextDeps: [], surfacing: 'not offered',
    trail: [
      { at: '2026-09-29T15:06:30Z', step: 'received', note: 'Session turn arrived.' },
      { at: '2026-09-29T15:07:00Z', step: 'held', note: 'Tentative wording. Not used for recall while held.' },
    ],
  },
  {
    id: 'am_05', kind: 'project_state', title: 'Vault port adapter next', statement: 'Vault generations design is settled. Next is the Windows Vault port adapter, starting with same-volume rename.',
    state: 'consolidated', rev: 'r4', themes: ['vault'],
    occurred: { precision: 'range', start: '2026-09-14', end: '2026-10-01' }, valid: { from: '2026-10-01', to: null, note: 'Current project state' },
    received: '2026-10-01T06:12:08Z', known: '2026-10-01T06:20:00Z', revised: '2026-10-08T02:00:00Z',
    why: 'Four planning episodes describe the same next step.',
    support: [
      { source: 'Session “Vault adapter planning”', role: 'session excerpt', rev: 'src r2', excerpt: 'Fourteen operation boundaries are specified, none accepted yet. Same-volume rename comes first.', received: '2026-10-01T06:12:08Z' },
      { source: 'Session “Vault adapter planning”', role: 'user said', rev: 'src r2', excerpt: 'Let’s start there tomorrow.', received: '2026-10-01T06:18:44Z' },
    ],
    contextDeps: [{ capsule: 'cap_19be…3d70', note: 'Checkpoint capsule for turns 1–8 was in the extractor’s context.' }],
    supersedes: 'am_06', surfacing: 'often',
    trail: [
      { at: '2026-10-01T06:12:08Z', step: 'received', note: 'Planning session arrived.' },
      { at: '2026-10-01T06:20:00Z', step: 'adopted', note: 'Project state updated.' },
      { at: '2026-10-08T02:00:00Z', step: 'consolidated', note: 'Folded am_07 and two earlier episodes into one state. Originals kept.' },
    ],
  },
  {
    id: 'am_06', kind: 'project_state', title: 'Storage shape open', statement: 'Vault storage shape is still open: append-only log or complete generations.',
    state: 'superseded', rev: 'r2', themes: ['vault'],
    occurred: { precision: 'month', month: '2026-09' }, valid: { from: '2026-09', to: '2026-10-01', note: 'Ended when the shape was decided' },
    received: '2026-09-14T08:02:00Z', known: '2026-09-14T08:05:00Z', revised: '2026-10-01T06:20:00Z',
    why: 'Recorded while the decision was still open.',
    support: [{ source: 'Imported note “vault-shape.md”', role: 'imported note', rev: 'src r1', excerpt: 'Log vs generations — undecided.', received: '2026-09-14T08:02:00Z' }],
    contextDeps: [], supersededBy: 'am_05', surfacing: 'not offered',
    trail: [
      { at: '2026-09-14T08:02:00Z', step: 'received', note: 'Note imported. Month known, day not recorded.' },
      { at: '2026-09-14T08:05:00Z', step: 'adopted', note: 'Project state recorded.' },
      { at: '2026-10-01T06:20:00Z', step: 'superseded', note: 'Replaced by the settled design.' },
    ],
  },
  {
    id: 'am_07', kind: 'episode', title: 'Hard-kill rehearsal', statement: 'Finished the B4 store hard-kill rehearsal: 23 writer terminations, and readers always kept a complete generation.',
    state: 'consolidated', rev: 'r1', themes: ['vault'],
    occurred: { precision: 'day', day: '2026-09-27' }, valid: { from: null, to: null, note: 'Past event' },
    received: '2026-09-27T13:30:00Z', known: '2026-09-27T13:31:00Z', revised: '2026-10-08T02:00:00Z',
    why: 'A finished event with a count. Kept as an episode inside the project state.',
    support: [{ source: 'Session “Store rehearsal”', role: 'session excerpt', rev: 'src r1', excerpt: '23 terminations, no torn generation.', received: '2026-09-27T13:30:00Z' }],
    contextDeps: [], surfacing: 'sometimes',
    trail: [
      { at: '2026-09-27T13:30:00Z', step: 'received', note: 'Session arrived.' },
      { at: '2026-09-27T13:31:00Z', step: 'adopted', note: 'Episode recorded.' },
      { at: '2026-10-08T02:00:00Z', step: 'consolidated', note: 'Linked into the Vault project state.' },
    ],
  },
  {
    id: 'am_08', kind: 'episode', title: 'Rereading Klara', statement: 'Started rereading Klara and the Sun. Finds its quiet attentiveness comforting.',
    state: 'fading', rev: 'r1', themes: ['reading', 'night'],
    occurred: { precision: 'day', day: '2026-09-29' }, valid: { from: null, to: null, note: 'Past event' },
    received: '2026-09-29T14:53:02Z', known: '2026-09-29T14:54:00Z', revised: '2026-10-20T00:00:00Z',
    why: 'Not mentioned since. Still kept; offered less often.',
    support: [{ source: 'Session “Evening, reading notes”', role: 'user said', rev: 'src r1', excerpt: 'Started Klara and the Sun again.', received: '2026-09-29T14:53:02Z' }],
    contextDeps: [], surfacing: 'rarely',
    trail: [
      { at: '2026-09-29T14:53:02Z', step: 'received', note: 'Session turn arrived.' },
      { at: '2026-09-29T14:54:00Z', step: 'adopted', note: 'Episode recorded. “Comforting” is the model’s reading of the tone.' },
      { at: '2026-10-20T00:00:00Z', step: 'fading', note: 'Three weeks without a related moment. Nothing deleted.' },
    ],
  },
  {
    id: 'am_09', kind: 'preference', title: 'No anime artwork', statement: 'Doesn’t want anime-style artwork anywhere in the interface.',
    state: 'adopted', rev: 'r1', themes: ['interface'],
    occurred: { precision: 'instant', at: '2026-10-01T06:37:51Z' }, valid: { from: '2026-10-01', to: null, note: 'Open-ended' },
    received: '2026-10-01T06:38:04Z', known: '2026-10-01T06:39:00Z', revised: '2026-10-01T06:39:00Z',
    why: 'Direct request about the interface.',
    support: [{ source: 'Session “Vault adapter planning”', role: 'user said', rev: 'src r2', excerpt: 'No anime artwork, please.', received: '2026-10-01T06:38:04Z' }],
    contextDeps: [], surfacing: 'sometimes',
    trail: [
      { at: '2026-10-01T06:38:04Z', step: 'received', note: 'Session turn arrived.' },
      { at: '2026-10-01T06:39:00Z', step: 'adopted', note: 'Explicit request with a clear scope.' },
    ],
  },
  {
    id: 'am_10', kind: 'project_state', title: 'Weekly or daily reviews?', statement: 'Planning reviews happen every Sunday.',
    state: 'conflict', rev: 'r1', themes: ['vault'],
    occurred: { precision: 'unknown' }, valid: { from: null, to: null, note: 'Not recorded' },
    received: '2026-10-15T12:00:00Z', known: null, revised: '2026-10-15T12:02:00Z',
    why: 'Two sessions say different things. Both are kept; neither is used as current.',
    support: [{ source: 'Session “Planning rhythm”', role: 'user said', rev: 'src r1', excerpt: 'Let’s keep reviews to Sundays.', received: '2026-10-15T12:00:00Z' }],
    contextDeps: [], conflictsWith: 'am_11', surfacing: 'not offered',
    trail: [
      { at: '2026-10-15T12:00:00Z', step: 'received', note: 'Session arrived.' },
      { at: '2026-10-15T12:02:00Z', step: 'conflict', note: 'Disagrees with am_11. Held until a later session settles it.' },
    ],
  },
  {
    id: 'am_11', kind: 'project_state', title: 'Daily short check-in', statement: 'Wants a short planning check-in every morning.',
    state: 'conflict', rev: 'r1', themes: ['vault', 'style'],
    occurred: { precision: 'unknown' }, valid: { from: null, to: null, note: 'Not recorded' },
    received: '2026-10-18T01:10:00Z', known: null, revised: '2026-10-18T01:12:00Z',
    why: 'Newer, but it may be a different kind of review. Not merged by similarity.',
    support: [{ source: 'Session “Morning notes”', role: 'user said', rev: 'src r1', excerpt: 'A quick check every morning would help.', received: '2026-10-18T01:10:00Z' }],
    contextDeps: [], conflictsWith: 'am_10', surfacing: 'not offered',
    trail: [
      { at: '2026-10-18T01:10:00Z', step: 'received', note: 'Session arrived.' },
      { at: '2026-10-18T01:12:00Z', step: 'conflict', note: 'Disagrees with am_10, or adds to it. Re-checked on the next related session.' },
    ],
  },
  {
    id: 'am_12', kind: 'fact', title: '住在上海', statement: '住在上海，日历按 Asia/Shanghai 计。',
    state: 'corrected', rev: 'r2', themes: [],
    occurred: { precision: 'unknown' }, valid: { from: '2026-09-20', to: null, note: 'Open-ended' },
    received: '2026-09-20T11:02:44Z', known: '2026-09-20T11:03:00Z', revised: '2026-10-05T10:00:00Z',
    why: 'You corrected the time zone wording. Your change is recorded as yours.',
    support: [{ source: 'Manual save', role: 'manual save', rev: 'src r1', excerpt: '住在上海。', received: '2026-09-20T11:02:44Z' }],
    contextDeps: [], surfacing: 'sometimes',
    trail: [
      { at: '2026-09-20T11:02:44Z', step: 'received', note: 'Manual save.' },
      { at: '2026-09-20T11:03:00Z', step: 'adopted', note: 'Saved as written.' },
      { at: '2026-10-05T10:00:00Z', step: 'corrected', note: 'You added the calendar time zone.' },
    ],
  },
  {
    id: 'am_13', kind: 'episode', title: 'Reading list, summer', statement: 'Kept a short reading list over the summer.',
    state: 'archived', rev: 'r1', themes: ['reading'],
    occurred: { precision: 'range', start: '2026-07', end: '2026-08' }, valid: { from: null, to: null, note: 'Past' },
    received: '2026-09-12T03:20:05Z', known: '2026-09-12T03:26:00Z', revised: '2026-10-22T00:00:00Z',
    why: 'Old, never recalled. Archived, not deleted.',
    support: [{ source: 'Imported note “summer.md”', role: 'imported note', rev: 'src r1', excerpt: 'July–August: three novels.', received: '2026-09-12T03:20:05Z' }],
    contextDeps: [], surfacing: 'not offered',
    trail: [
      { at: '2026-09-12T03:20:05Z', step: 'received', note: 'Note imported. Months known, days not recorded.' },
      { at: '2026-09-12T03:26:00Z', step: 'adopted', note: 'Episode recorded.' },
      { at: '2026-10-08T00:00:00Z', step: 'fading', note: 'Not relevant to any recent moment.' },
      { at: '2026-10-22T00:00:00Z', step: 'archived', note: 'Archived. Still readable here; leaves automatic recall.' },
    ],
  },
  {
    id: 'am_14', kind: 'episode', title: 'Tokens before screens', statement: 'Frontend work goes tokens and primitives first, screens after.',
    state: 'reevaluating', rev: 'r1', themes: ['interface', 'vault'],
    occurred: { precision: 'instant', at: '2026-10-01T06:43:12Z' }, valid: { from: '2026-10-01', to: null, note: 'Open-ended' },
    received: '2026-10-01T06:43:40Z', known: '2026-10-01T06:45:00Z', revised: '2026-10-23T08:00:00Z',
    why: 'A newer session talks about prototyping whole screens. Checking whether the order still holds.',
    support: [{ source: 'Session “Vault adapter planning”', role: 'user said', rev: 'src r2', excerpt: 'Note that we’re doing tokens before screens.', received: '2026-10-01T06:43:40Z' }],
    contextDeps: [{ capsule: 'cap_5c02…91ee', note: 'A design-review capsule was in context when this was re-opened.' }],
    surfacing: 'sometimes',
    trail: [
      { at: '2026-10-01T06:43:40Z', step: 'received', note: 'Session turn arrived.' },
      { at: '2026-10-01T06:45:00Z', step: 'adopted', note: 'Recorded as stated.' },
      { at: '2026-10-23T08:00:00Z', step: 'reevaluating', note: 'New material may change it. Current revision still in use.' },
    ],
  },
  {
    id: 'am_15', kind: 'session_checkpoint', title: 'Checkpoint · Vault planning', statement: 'Checkpoint for “Vault adapter planning”, turns 1–8.',
    state: 'received', rev: 'r1', themes: ['vault'],
    occurred: { precision: 'range', start: '2026-10-01T05:58:12Z', end: '2026-10-01T06:19:02Z' }, valid: { from: null, to: null, note: 'Provisional' },
    received: '2026-10-01T06:20:11Z', known: null, revised: '2026-10-01T06:20:11Z',
    why: 'Provisional checkpoint. Not a memory and not a source of support.',
    support: [], contextDeps: [], surfacing: 'not offered',
    trail: [{ at: '2026-10-01T06:20:11Z', step: 'received', note: 'Provisional checkpoint written by the session.' }],
  },
];

export type RelType = 'source' | 'supersedes' | 'shared theme' | 'context dependency' | 'suggestion';
export const REL_NOTE: Record<RelType, string> = {
  source: 'Cites the same source revision. Not independent confirmation.',
  supersedes: 'The newer statement replaced the older one.',
  'shared theme': 'Same suggested theme. Not a relationship or a cause.',
  'context dependency': 'Was in the model’s context when this formed. Not support.',
  suggestion: 'Semantic link suggested by a model. Unconfirmed.',
};
export const RELATIONS: { from: string; to: string; type: RelType }[] = [
  { from: 'am_01', to: 'am_02', type: 'supersedes' },
  { from: 'am_05', to: 'am_06', type: 'supersedes' },
  { from: 'am_05', to: 'am_07', type: 'shared theme' },
  { from: 'am_05', to: 'am_15', type: 'context dependency' },
  { from: 'am_01', to: 'am_03', type: 'source' },
  { from: 'am_03', to: 'am_08', type: 'source' },
  { from: 'am_10', to: 'am_11', type: 'suggestion' },
  { from: 'am_09', to: 'am_14', type: 'source' },
  { from: 'am_14', to: 'am_05', type: 'suggestion' },
  { from: 'am_08', to: 'am_13', type: 'shared theme' },
];

/** Synthetic recall cases. No IPC, nothing saved, no Provider. Mirrors the reasons a real inspection gives; no per-dimension scores. */
export interface RecallCase {
  id: string;
  query: string;
  moment: string;
  steps: { label: 'Input and scope' | 'Eligibility' | 'Retrieval and ranking' | 'Budget and completeness' | 'Capsule'; note: string }[];
  included: { id: string; rank: number; reason: string; cost: number; sourceReachable: boolean }[];
  excluded: { id: string; reason: string }[];
  budget: { limit: number; used: number; truncated: boolean };
}
export const RECALL_CASES: RecallCase[] = [
  {
    id: 'rc_1', query: 'Pick up the Vault work', moment: 'Opening a session titled “Vault adapter, day 2”',
    steps: [
      { label: 'Input and scope', note: 'Query from the session title. Scope: active memories, this Vault.' },
      { label: 'Eligibility', note: 'Held, in-conflict, archived and superseded statements are not eligible. Eligibility is checked before any ranking.' },
      { label: 'Retrieval and ranking', note: 'Literal match on “Vault”, then the existing deterministic order.' },
      { label: 'Budget and completeness', note: '3 of 4 eligible fit the budget. One was cut.' },
      { label: 'Capsule', note: 'A synthetic capsule. Nothing is saved.' },
    ],
    included: [
      { id: 'am_05', rank: 1, reason: 'Literal match in statement; current project state.', cost: 38, sourceReachable: true },
      { id: 'am_07', rank: 2, reason: 'Literal match through its project.', cost: 31, sourceReachable: true },
      { id: 'am_01', rank: 3, reason: 'Preference that applies to every session.', cost: 14, sourceReachable: true },
    ],
    excluded: [
      { id: 'am_06', reason: 'Superseded by am_05.' },
      { id: 'am_10', reason: 'In conflict · held.' },
      { id: 'am_11', reason: 'In conflict · held.' },
      { id: 'am_14', reason: 'Eligible, but over budget.' },
    ],
    budget: { limit: 96, used: 83, truncated: true },
  },
  {
    id: 'rc_2', query: 'Anything for tonight?', moment: '23:40, no project open',
    steps: [
      { label: 'Input and scope', note: 'Short query, late evening.' },
      { label: 'Eligibility', note: 'The Hangzhou plan is held, so it cannot surface yet.' },
      { label: 'Retrieval and ranking', note: 'Literal match on “tonight” finds nothing; time-of-day preferences apply.' },
      { label: 'Budget and completeness', note: 'Everything eligible fits.' },
      { label: 'Capsule', note: 'A synthetic capsule. Nothing is saved.' },
    ],
    included: [
      { id: 'am_03', rank: 1, reason: 'Applies late at night.', cost: 16, sourceReachable: true },
      { id: 'am_01', rank: 2, reason: 'Applies to every session.', cost: 14, sourceReachable: true },
    ],
    excluded: [
      { id: 'am_04', reason: 'Held as hypothesis.' },
      { id: 'am_08', reason: 'Surfacing less · not offered unprompted.' },
      { id: 'am_13', reason: 'Archived.' },
    ],
    budget: { limit: 96, used: 30, truncated: false },
  },
];

/** The observation stream across items, newest first. Derived for convenience; same facts as each trail. */
export const STREAM = AUTO_MEMORIES.flatMap((m) => m.trail.map((t) => ({ ...t, id: m.id, title: m.title })))
  .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

/** Loaded-range wording: every count in the preview is about this fixture only. */
export const RANGE_NOTE = `${AUTO_MEMORIES.length} invented memories loaded · counts cover this sample only`;
