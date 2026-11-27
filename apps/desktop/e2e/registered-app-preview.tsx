// Independent browser fixture for same-method screenshots of the native
// registered-library path (registered_owner_readonly). Every host and catalog
// read is mocked with the fictional demo dataset, shifted so its latest record
// is a few minutes old. No native connection, no personal library, no writes:
// any planning or confirming request is refused.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { mockIPC } from '@tauri-apps/api/mocks';
import App from '../src/App.tsx';
import { setTransport } from '../src/memory/client';
import { setCatalogTransport } from '../src/memory/catalog';
import { originalDemoData as D } from '../src/demo-data.ts';
import { ready, useLang } from '../src/i18n/index.ts';
import { startTheme } from '../src/theme/scheme';
import '../src/theme/negative-fonts.css';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';
import '../src/theme/negative.css';
import '../src/theme/automemory.css';
import '../src/theme/palettes.css';
import '../src/theme/motion.css';
import '../src/theme/cjk-fonts.css';
import type { Page } from '../src/demo-types';

const params = new URLSearchParams(location.search);
const page = (params.get('page') ?? 'home') as Page;
startTheme();

const shift = Date.now() - Date.parse('2026-10-01T06:50:00.000Z');
const at = (iso: string) => new Date(Date.parse(iso) + shift).toISOString();
const envelope = { schema_version: 2, capability: 'memory-native-read-2', effect: 'native_read' };
const selection = { algorithm: 'owner-qualified-catalog-4', version: 4, profile_hash: 'a'.repeat(64), withdrawal_watermark: 1,
  snapshot: { vault_id: 'fictional-vault', base_commit_id: 'fictional-commit', primary_epoch: 1, policy_watermark: 1, deletion_watermark: 1 },
  scope_hash: 'b'.repeat(64), query_hash: 'c'.repeat(64), evaluated_at: at('2026-10-01T06:49:00.000Z') };
const header = { selection, algorithm: 'fictional', version: 2, parameters_hash: 'e'.repeat(64), permission_hash: 'f'.repeat(64), authorized_at: selection.evaluated_at,
  scope: 'authorized_current_dependencies', matched_inputs: 0, included_inputs: 0, complete_in_scope: true, limits: [] };
const instant = (iso: string) => ({ from: at(iso), until: null, precision: 'instant', bound: 'within', tz: 'Asia/Shanghai', basis: 'stated' });
const words = (s: string) => s.split(/\s+/).slice(0, 6).join(' ').replace(/[.,:]$/, '');

const current = D.MEM.filter(m => m.status === 'active' || m.status === 'candidate');
const sourceOf = (m: typeof D.MEM[number]) => m.src.s && m.src.t ? { source_id: `src_${m.src.s}_${m.src.t}`, source_revision: 1 } : { source_id: `src_${m.key}`, source_revision: 1 };
const turnText = (sourceId: string) => {
  const [, s, n] = sourceId.split('_');
  const session = D.SESS.find(x => x.key === s);
  const turn = session?.turns[Number(n) - 1];
  if (turn) return { speaker: turn[0], text: turn[1], at: turn[2] };
  const m = D.MEM.find(x => `src_${x.key}` === sourceId);
  return { speaker: 'user', text: m?.content ?? '', at: m?.created ?? '2026-10-01T00:00:00Z' };
};
const item = (m: typeof D.MEM[number]) => ({
  title: words(m.content), content_lang: 'en',
  base: { memory: { memory_id: `mem_${m.key}`, revision: 1 }, content: m.content, system_actor: { actor_type: 'system' },
    dimensions: { kind: m.kind === 'project_state' ? 'fact' : m.kind === 'session_checkpoint' ? 'episode' : m.kind }, knowledge: m.src.kind === 'conversation' ? 'attributed_statement' : 'self_report',
    adoption: m.status === 'candidate' ? 'staged' : 'adopted', validity: 'unspecified', attention: 'active',
    project_id: m.project ?? null, learned_at: at(m.created), source_captured_at: at(m.created) },
  event_time: m.kind === 'episode' ? instant(m.created) : { from: null, until: null, precision: 'unknown', bound: 'within', tz: null, basis: 'unknown' }, entities: [], effective_sensitivity: 'private',
  formation_reason: { interpretation: 'clear_self_report', rule_version: 'admission-rules-3', prompt_version: 'fictional', model_version: null, mode: m.status === 'candidate' ? 'live' : 'backfill', note: null, note_is_machine_annotation: false },
});
const target = (m: typeof D.MEM[number]) => ({ memory: { memory: { memory_id: `mem_${m.key}`, revision: 1 }, hash: 'e'.repeat(64) } });
const summary = (m: typeof D.MEM[number]) => ({ ...target(m), title: words(m.content), knowledge: 'attributed_statement', adoption: m.status === 'candidate' ? 'staged' : 'adopted',
  interpretation: 'clear_self_report', change: 'new', learned_at: at(m.created), effective_sensitivity: 'private' });
const kind = (m: typeof current[number]) => m.kind === 'project_state' ? 'fact' : m.kind === 'session_checkpoint' ? 'episode' : m.kind;
const match = (f: any) => current.filter(m => (!f?.text || m.content.toLowerCase().includes(String(f.text).toLowerCase()))
  && (!f?.form || kind(m) === f.form) && (!f?.adoption || (m.status === 'candidate' ? 'staged' : 'adopted') === f.adoption)
  && (!f?.time_window || (Date.parse(at(m.created)) >= Date.parse(f.time_window.from) && (!f.time_window.until || Date.parse(at(m.created)) < Date.parse(f.time_window.until)))))
  .sort((a, b) => b.created.localeCompare(a.created));
const groups = (list: typeof current) => {
  const count = (key: (m: typeof current[number]) => string) => { const c = new Map<string, number>(); list.forEach(m => c.set(key(m), (c.get(key(m)) ?? 0) + 1)); return [...c].map(([value, count]) => ({ value, label: value, count })); };
  return [
    { axis: 'form', count_scope: 'matched', values: count(kind), total_values: count(kind).length },
    { axis: 'adoption', count_scope: 'matched', values: count(m => m.status === 'candidate' ? 'staged' : 'adopted'), total_values: 2 },
  ];
};
const conversation = (s: typeof D.SESS[number]) => ({ conversation_id: `ses_${s.key}`, platform: 'chatgpt', account_scope: 'fictional', title: s.title,
  started_at: instant(s.created), ended_at: instant(s.turns.at(-1)![2]), original_conversation_id: null });

const refusedOps: string[] = [];
Object.assign(window, { refusedOps });
const refused = (operation: string) => { refusedOps.push(operation); throw `fixture_refuses_${operation}`; };
setTransport(async (command, args) => {
  if (command === 'shell_status') return { vaultChanging: false, memoryEntry: 'registered_owner_readonly' };
  if (command === 'shell_lifecycle_status') return { closing: false };
  if (command === 'startup_status') return { supported: false, enabled: false };
  if (command === 'memory_call') return { kind: 'memory_page', result: { vault: { state: 'none' }, pendingCandidates: 0, components: [], companion: { exiting: false } } };
  throw new Error(`Unexpected command ${command} ${JSON.stringify(args)}`);
});
setCatalogTransport(async (_command, args) => {
  const q = (args as any).request.query;
  switch (q.operation) {
    case 'status': return { ...envelope, kind: 'runtime_memory_catalog_status', mode: 'registered_owner_readonly', state: 'open', available: true, selection,
      recall_limits: { max_items: 8, max_bytes: 16384 }, corrections: true, semantic: { model: 'bge-m3', state: 'ready', indexed: current.length, total: current.length } };
    case 'page': { const list = match(q.filter); return { ...envelope, kind: 'catalog_memory_page', selection, authorized_at: selection.evaluated_at, count_exact: true,
      scope: 'authorized_current_machine_revisions', matched_in_scope: list.length, unknown_time_in_scope: list.filter(m => m.kind !== 'episode').length, items: list.slice(0, q.limit).map(item), complete_in_scope: true, next: null, facets: q.facets ? groups(list) : [] }; }
    case 'stats': { const list = match(q.filter); return { ...envelope, kind: 'catalog_memory_stats', selection, authorized_at: selection.evaluated_at, count_exact: true,
      scope: 'authorized_current_machine_revisions', matched_in_scope: list.length, groups: groups(list), theme_membership: 'authorized' }; }
    case 'detail': { const m = current.find(x => `mem_${x.key}` === q.memory_id); const src = m ? sourceOf(m) : null; const quote = src ? turnText(src.source_id).text : '';
      return { ...envelope, kind: 'native_memory_detail', header: { ...header, algorithm: 'authorized-native-detail-2' }, item: m ? item(m) : null, history: m ? [summary(m)] : [], history_count_in_scope: m ? 1 : 0,
        fields: m && src ? { title: words(m.content), evidence: [{ reference: { ...src, object_hash: 'd'.repeat(64) }, quote, speaker: 'user', start: 0, end: Array.from(quote).length }] } : null }; }
    case 'source': { const t = turnText(q.source.source_id); const chars = Array.from(t.text);
      return { ...envelope, kind: 'native_source_excerpt', header: { ...header, algorithm: 'selected-source-excerpt-2' }, source: q.source,
        source_record: { reference: q.source, speaker: t.speaker, source_kind: 'export_message', evidence_class: 'user_statement', anchor_hash: 'd'.repeat(64), original_conversation_id: null, original_message_id: null, occurred_at: at(t.at) },
        excerpt: chars.slice(q.start, Math.min(chars.length, q.start + q.limit)).join(''), start: q.start, end: Math.min(chars.length, q.start + q.limit), total_characters: chars.length, complete_in_scope: q.start + q.limit >= chars.length }; }
    case 'time_buckets': { const day = q.query.granularity === 'day'; const buckets: any[] = [];
      const start = new Date(q.query.from_date + 'T00:00:00+08:00'), end = new Date(q.query.until_date + 'T00:00:00+08:00');
      for (let d = new Date(start); d < end;) { const next = new Date(d); if (day) next.setDate(next.getDate() + 1); else next.setMonth(next.getMonth() + 1);
        const inside = current.filter(m => Date.parse(at(m.created)) >= +d && Date.parse(at(m.created)) < +next);
        const local = new Date(+d + 8 * 36e5).toISOString().slice(0, 10);
        buckets.push({ local_start: local, from: d.toISOString(), until: next.toISOString(), possible_records: inside.length, staged: inside.filter(m => m.status === 'candidate').length, adopted: inside.filter(m => m.status === 'active').length, captured_material: inside.length });
        d = next; if (buckets.length > 400) break; }
      return { ...envelope, kind: 'memory_time_buckets', header, query: q.query, interval_rule: 'possible', material_scope: 'authorized', unknown_time_in_scope: 0, buckets }; }
    case 'graph': { const edges: any[] = [];
      current.forEach(a => current.forEach(b => { if (a.key < b.key && a.src.s && a.src.s === b.src.s) edges.push({ from: `mem_${a.key}`, to: `mem_${b.key}`, relation: 'same_conversation', class: 'recorded_relation', witness: 'w', score_milli: null }); }));
      return { ...envelope, kind: 'memory_graph_page', header, nodes: current.map(m => ({ ...target(m), title: words(m.content), form: m.kind, entities: [], themes: [] })), edges,
        edge_coverage: [{ relation: 'same_conversation', candidates: edges.length, retained: edges.length }], semantic_neighbors_available: true, next: null }; }
    case 'neighbors': { const m = current.find(x => `mem_${x.key}` === q.memory_id); const near = m?.src.s ? current.filter(x => x !== m && x.src.s === m.src.s) : [];
      return { ...envelope, kind: 'native_memory_neighbors', header, selected: null, matched_in_scope: near.length, next: null,
        items: near.map(x => ({ other: summary(x), relations: [{ relation: 'same_conversation', class: 'recorded_relation', direction: 'both', witnesses: [], witness_count_in_scope: 1, witnesses_complete: true }] })) }; }
    case 'activity': { const list = [...current].sort((a, b) => b.created.localeCompare(a.created));
      return { ...envelope, kind: 'memory_activity_page', header, matched_in_scope: list.length, complete_in_scope: true, next: null, time_derived_events_available: false,
        items: list.map(m => ({ event_id: 'a'.repeat(60) + m.key.padStart(4, '0'), event_kind: 'formation', memory: { memory_id: `mem_${m.key}`, revision: 1 }, source: null, title: words(m.content), change: 'new',
          knowledge: 'attributed_statement', adoption: m.status === 'candidate' ? 'staged' : 'adopted', effective_sensitivity: 'private', formation_reason: null,
          proof: { commit_id: 'c', commit_hash: 'd'.repeat(64), actor: { actor_type: 'system' }, written_at: at(m.created) }, receipt: null })) }; }
    case 'conflicts': return { ...envelope, kind: 'memory_conflict_group', header, selected: null, basis: 'qualified', counter_evidence: [], matched_in_scope: 0, items: [], next: null };
    case 'conversations': return { ...envelope, kind: 'native_conversation_page', header, matched_in_scope: D.SESS.length, next: null,
      items: D.SESS.map(s => ({ conversation: conversation(s), visible_captured_turns: s.turns.length, visible_captured_sources: s.turns.length, effective_sensitivity: 'private', platform_complete_not_claimed: true })) };
    case 'conversation_detail': { const s = D.SESS.find(x => `ses_${x.key}` === q.conversation_id)!;
      return { ...envelope, kind: 'native_conversation_detail', header, conversation: conversation(s), visible_captured_turns: s.turns.length, visible_captured_sources: s.turns.length, next: null, platform_complete_not_claimed: true,
        turns: s.turns.map((turn, i) => { const ref = { source_id: `src_${s.key}_${i + 1}`, source_revision: 1 };
          return { turn: { turn_id: `turn_${s.key}_${i + 1}`, sequence: i + 1, source: ref }, source_record: { reference: ref, speaker: turn[0], source_kind: 'export_message', occurred_at: at(turn[2]) }, fields: {} }; }) }; }
    case 'theme_members': return { ...envelope, kind: 'memory_theme_members', header, items: [], matched_in_scope: 0, next: null };
    case 'review_suggestions': return { ...envelope, kind: 'memory_review_suggestions', header, query: q.query, total_in_horizon: 0, items: [] };
    case 'attention_schedule': return { ...envelope, kind: 'memory_attention_schedule', header, query: q.query, fade_after_days: 30, archive_after_days: 180, protected_in_scope: 0, events: [], next: null };
    case 'revision_diff': return { ...envelope, kind: 'memory_revision_diff', header, before: null, after: null, fields: [], structural_only: true };
    case 'recall_preview': { const chosen = match({ text: '' }).slice(0, 4);
      return { ...envelope, kind: 'native_recall_preview', complete_in_scope: true, rendered_context: chosen.map(m => m.content).join('\n'), selected_targets: chosen.map(m => target(m).memory),
        trace: { algorithm: 'attention-rank-1', snapshot: selection.snapshot, profile_hash: 'a'.repeat(64), at: q.query.at, authorized_at: selection.evaluated_at, considered: current.length, rendered_bytes: 420,
          selected: chosen.map((m, i) => ({ memory: { memory_id: `mem_${m.key}`, revision: 1 }, attention: 'active', score: 900 - i * 80, reasons: ['lexical'] })), excluded: [] },
        trace_coverage: { excluded_in_scope: 0, excluded_returned: 0, complete: true, reason_counts: {} },
        items: chosen.map(m => ({ base: { memory: { memory_id: `mem_${m.key}`, revision: 1 }, content: m.content }, record: { fields: { title: words(m.content) } } })) }; }
    case 'capsules': return { ...envelope, kind: 'runtime_capsules', effect: 'native_read', saving_enabled: true, capsules: [] };
    case 'connector_status': return { ...envelope, kind: 'runtime_connector_status', effect: 'native_read', windows: [] };
    case 'agent_status': return { ...envelope, kind: 'runtime_agent_grants', effect: 'native_read', other_grants: [], connector: null, vault_id: 'fictional-vault',
      bridge: { path: 'enouia-memory-mcp.exe', present: true, protocol: 'automation-agent-v1' },
      agents: [{ key: 'claude_code', name: 'Claude Code', registered: false, grant: null, pipe: null, coverage: null }, { key: 'codex', name: 'Codex', registered: false, grant: null, pipe: null, coverage: null }] };
    case 'entity_identities': return { ...envelope, kind: 'runtime_entity_identities', effect: 'native_read', total_groups: 0, complete: true, groups: [] };
    case 'agent_requests': return { ...envelope, kind: 'runtime_agent_requests', effect: 'native_read', requests: [] };
    default: return refused(q.operation);
  }
});
mockIPC(async command => { throw Error('Fixture refuses host command ' + command); }, { shouldMockEvents: true });

function Preview() {
  useLang();
  return <>
    <App memoryConnected startPage={page} />
    <div data-fixture-watermark lang="en" style={{ position: 'fixed', left: 8, bottom: 6, zIndex: 9, padding: '2px 6px', font: '12px/16px var(--f-lab)', background: 'var(--i-paper)', color: 'var(--i-ink)', pointerEvents: 'none' }}>FICTIONAL · NATIVE REGISTERED PATH · NO CONNECTION</div>
  </>;
}
await ready();
createRoot(document.getElementById('root')!).render(<React.StrictMode><Preview /></React.StrictMode>);
// ?click=a|b presses, in order, the first button whose text or aria-label contains each part.
for (const part of (params.get('click') ?? '').split('|').filter(Boolean)) {
  for (let i = 0; i < 100; i++) {
    const button = [...document.querySelectorAll<HTMLButtonElement>('main button')].find(b => (b.textContent ?? '').includes(part) || (b.getAttribute('aria-label') ?? '').includes(part));
    if (button) { button.click(); break; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  await new Promise(resolve => setTimeout(resolve, 400));
}
