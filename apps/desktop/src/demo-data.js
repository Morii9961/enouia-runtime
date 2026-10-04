// Fictional Claude Design fixture. Never a Runtime snapshot.
export const demoData = (function () {
    const hx = (seed) => { let out = ''; for (let k = 0; k < 4; k++) { let h = (0x811c9dc5 ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0; const s = seed + '#' + k; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; out += (h >>> 0).toString(16).padStart(8, '0'); } return out; };
    const ID = (p, s) => p + '_' + hx(p + s);
    const short = (id) => { const i = id.indexOf('_'); return id.slice(0, i + 1) + id.slice(i + 1, i + 7) + '…' + id.slice(-4); };
    const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const MOL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const DY = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const sh = (iso) => new Date(Date.parse(iso) + 8 * 36e5);
    const pad = (n) => String(n).padStart(2, '0');
    const tTime = (iso) => { const d = sh(iso); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); };
    const tDate = (iso) => { const d = sh(iso); return d.getUTCDate() + ' ' + MO[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
    const tFull = (iso) => tDate(iso) + ', ' + tTime(iso);
    const tDay = (iso) => { const d = sh(iso); return DY[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + MOL[d.getUTCMonth()]; };
    const dayKey = (iso) => { const d = sh(iso); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
    const PRJ = { enouia: { id: ID('prj', 'enouia'), name: 'Enouia Runtime' }, moriium: { id: ID('prj', 'moriium'), name: 'Moriium' } };
    const SESS = [
      { key: 's1', title: 'Vault adapter planning', created: '2026-10-01T05:58:12.004Z', checkpoints: [{ after: 8, mem: 'm7', at: '2026-10-01T06:20:11.604Z' }], turns: [
        ['user', 'Let’s pick up the Vault work. Where did we leave the storage shape?', '2026-10-01T05:58:40.112Z'],
        ['assistant', 'Complete immutable generations, with one hash-bound pointer. The recovery matrix still needs its evidence.', '2026-10-01T05:58:52.630Z'],
        ['user', 'And the index?', '2026-10-01T06:03:10.004Z'],
        ['assistant', 'Disposable. It can always be rebuilt from canonical files, and it never becomes the authority.', '2026-10-01T06:03:21.871Z'],
        ['user', 'Good. What’s blocking the Windows port adapter?', '2026-10-01T06:11:30.390Z'],
        ['assistant', 'Fourteen operation boundaries are specified, none accepted yet. Same-volume rename comes first.', '2026-10-01T06:12:08.412Z'],
        ['user', 'Let’s start there tomorrow.', '2026-10-01T06:18:44.020Z'],
        ['assistant', 'I’ll keep the rebuild trigger as an open loop until then.', '2026-10-01T06:19:02.557Z'],
        ['user', 'One more thing — the interface. No anime artwork, please.', '2026-10-01T06:37:51.003Z'],
        ['assistant', 'Understood. I’ve put that in the Candidate Inbox for you to review.', '2026-10-01T06:38:04.441Z'],
        ['user', 'And note that we’re doing tokens before screens.', '2026-10-01T06:43:12.090Z'],
        ['assistant', 'Proposed as a project state update. It’s waiting for your review too.', '2026-10-01T06:43:40.218Z'] ] },
      { key: 's2', title: 'Evening, reading notes', created: '2026-09-29T14:31:40.220Z', checkpoints: [], turns: [
        ['user', 'Remember that I prefer short answers.', '2026-09-29T14:32:01.540Z'],
        ['assistant', 'I’ll remember that.', '2026-09-29T14:32:05.112Z'],
        ['user', 'I’m usually up past eleven. Keep things quiet then.', '2026-09-29T14:40:18.330Z'],
        ['assistant', 'Noted. I’ve proposed it for your review.', '2026-09-29T14:40:26.009Z'],
        ['user', 'Started Klara and the Sun again.', '2026-09-29T14:52:47.771Z'],
        ['assistant', 'The second reading is often quieter. Tell me what stays with you.', '2026-09-29T14:53:02.405Z'],
        ['user', 'Might go to Hangzhou at the end of October.', '2026-09-29T15:06:15.902Z'],
        ['assistant', 'I’ve kept that as a candidate. It’s only a plan for now.', '2026-09-29T15:06:29.640Z'] ] },
      { key: 's3', title: 'B4 rehearsal review', created: '2026-09-25T09:05:03.118Z', checkpoints: [], turns: [
        ['user', 'How did the store hard-kill rehearsal go?', '2026-09-25T09:05:30.204Z'],
        ['assistant', 'Twenty-three writer terminations. Readers kept a complete old or new generation every time.', '2026-09-25T09:05:48.770Z'],
        ['user', 'So the storage shape is still open?', '2026-09-25T09:12:02.311Z'],
        ['assistant', 'Between an append-only log and complete generations, yes.', '2026-09-25T09:12:19.084Z'] ] },
    ];
    SESS.forEach((s) => { s.id = ID('ses', s.key); });
    const IMP = { kind: 'import', importer: 'notes-import 0.1.0', sha: hx('raw-notes-a') + hx('raw-notes-b'), at: '2026-09-12T03:20:00.000Z' };
    const MEM = [
      { key: 'm1', kind: 'project_state', status: 'active', project: 'enouia', content: 'Vault generations design is settled. Next is the Windows Vault port adapter, starting with same-volume rename.', decisions: ['Complete immutable generations with one hash-bound pointer', 'The index stays disposable and rebuildable'], openLoops: ['Choose the index rebuild trigger', 'Accept the first Windows port boundary'], src: { kind: 'conversation', s: 's1', t: 6 }, created: '2026-10-01T06:12:09.020Z', updated: '2026-10-01T06:12:09.020Z', reviewed: '2026-10-01T06:12:40.551Z', conf: 0.92, tags: ['vault', 'backend'], supersedes: 'm0' },
      { key: 'm0', kind: 'project_state', status: 'superseded', project: 'enouia', content: 'Vault storage shape is still open: append-only log or complete generations.', decisions: [], openLoops: ['Decide the Vault storage shape'], src: { kind: 'conversation', s: 's3', t: 4 }, created: '2026-09-25T09:12:20.400Z', updated: '2026-10-01T06:12:09.020Z', reviewed: '2026-09-25T09:13:02.118Z', conf: 0.8, tags: ['vault'], supersededBy: 'm1' },
      { key: 'm2', kind: 'preference', status: 'active', content: 'Prefers short, direct answers without extra explanation.', src: { kind: 'explicit_remember', s: 's2', t: 1 }, created: '2026-09-29T14:32:02.004Z', updated: '2026-09-29T14:32:02.004Z', conf: 1, tags: ['communication'], supersedes: 'm2x' },
      { key: 'm2x', kind: 'preference', status: 'superseded', content: 'Prefers thorough explanations with background context.', src: IMP, created: '2026-09-12T03:20:04.210Z', updated: '2026-09-29T14:32:02.004Z', conf: 0.6, tags: ['communication'], supersededBy: 'm2' },
      { key: 'm3', kind: 'preference', status: 'active', content: 'Usually works past 23:00. Keep notifications quiet late at night.', src: { kind: 'conversation', s: 's2', t: 3 }, created: '2026-09-29T14:40:27.300Z', reviewed: '2026-09-29T14:44:10.002Z', conf: 0.71, tags: ['routine'] },
      { key: 'm4', kind: 'fact', status: 'active', content: 'Lives in Shanghai. Calendar days follow Asia/Shanghai.', src: { kind: 'manual_save', at: '2026-09-20T11:02:44.000Z' }, created: '2026-09-20T11:02:44.318Z', conf: 1, tags: ['place'] },
      { key: 'm5', kind: 'episode', status: 'active', project: 'enouia', content: 'Finished the B4 store hard-kill rehearsal: 23 writer terminations, and readers always kept a complete generation.', src: { kind: 'conversation', s: 's3', t: 2 }, created: '2026-09-25T09:05:50.020Z', reviewed: '2026-09-25T09:06:31.770Z', conf: 0.95, tags: ['vault', 'rehearsal'], validFrom: '2026-09-25' },
      { key: 'm6', kind: 'fact', status: 'active', project: 'moriium', content: 'Moriium keeps the About page, public validation, the VPS receiver and static JSON.', src: IMP, created: '2026-09-12T03:20:04.918Z', conf: 0.9, tags: ['boundary'] },
      { key: 'm7', kind: 'session_checkpoint', status: 'active', project: 'enouia', content: 'Checkpoint for “Vault adapter planning”, turns 1–8.', covered: [1, 8], lastState: 'Agreed the index is disposable. The Windows port adapter starts with same-volume rename tomorrow.', openLoops: ['Choose the index rebuild trigger'], src: { kind: 'conversation', s: 's1', t: 8 }, created: '2026-10-01T06:20:11.604Z', conf: null, tags: [] },
      { key: 'm8', kind: 'episode', status: 'active', content: 'Started rereading Klara and the Sun. Finds its quiet attentiveness comforting.', src: { kind: 'conversation', s: 's2', t: 5 }, created: '2026-09-29T14:53:03.300Z', reviewed: '2026-09-29T15:10:42.019Z', conf: 0.64, tags: ['reading'] },
      { key: 'm9', kind: 'preference', status: 'active', content: 'Calls me Enouia, never “the assistant”.', src: { kind: 'explicit_remember', at: '2026-09-18T13:41:09.000Z' }, created: '2026-09-18T13:41:09.552Z', conf: 1, tags: ['relationship'] },
      { key: 'c1', kind: 'preference', status: 'candidate', content: 'Doesn’t want anime-style artwork anywhere in my interface.', src: { kind: 'conversation', s: 's1', t: 9 }, created: '2026-10-01T06:38:04.900Z', conf: 0.78, tags: ['interface'] },
      { key: 'c2', kind: 'fact', status: 'candidate', content: 'Plans to visit Hangzhou in the last week of October.', src: { kind: 'conversation', s: 's2', t: 7 }, created: '2026-09-29T15:06:30.110Z', conf: 0.55, tags: ['travel'], validFrom: '2026-10-24', validTo: '2026-10-31' },
      { key: 'c3', kind: 'project_state', status: 'candidate', project: 'enouia', content: 'Frontend adopts the Quiet Runtime design language: tokens and primitives before screens.', decisions: ['Dark-first, low-saturation palette', 'Segoe UI Variable for UI, Cascadia Code for technical values'], openLoops: ['Verify surfaces at 1280, 1440 and 1920 widths'], src: { kind: 'conversation', s: 's1', t: 11 }, created: '2026-10-01T06:43:40.900Z', conf: 0.83, tags: ['interface', 'frontend'] },
    ];
    const CAP = ID('cap', 'last');
    const CAPHASH = hx('capbytes1') + hx('capbytes2');
    const CTX = [
      { key: 'identity', label: 'Identity', field: 'identity', c: '#EEE7DC', note: 'Who I am. Read only from the identity allowlist.', items: [{ key: 'core', file: 'core.md', text: 'Enouia is a persistent local companion. It speaks plainly, keeps what it is told, and shows where everything came from.', reason: 'allowlisted identity file', bytes: 214 }] },
      { key: 'projects', label: 'Current Projects', field: 'active_projects', c: '#9FC2D2', note: 'Active project state, with its decisions and open loops.', items: [{ key: 'm1', mem: 'm1', reason: 'active project · ranked first', rank: 1, bytes: 396 }] },
      { key: 'events', label: 'Recent Events', field: 'recent_checkpoints · relevant_memories', c: '#7FA6B8', note: 'The latest checkpoint for this session and episodes that matched the query.', items: [{ key: 'm7', mem: 'm7', reason: 'latest checkpoint for this session', rank: null, bytes: 341 }, { key: 'm5', mem: 'm5', reason: 'relevant memory · literal match “vault”', rank: 3, bytes: 188 }] },
      { key: 'prefs', label: 'Preferences', field: 'user_context', c: '#B9CCB7', note: 'How you like things done.', items: [{ key: 'm2', mem: 'm2', reason: 'user context', rank: 2, bytes: 132 }, { key: 'm3', mem: 'm3', reason: 'user context', rank: 4, bytes: 128 }] },
      { key: 'rel', label: 'Relationship Context', field: 'relationship_context', c: '#D8C7A8', note: 'How we speak to each other.', items: [{ key: 'm9', mem: 'm9', reason: 'relationship context', rank: 5, bytes: 118 }] },
      { key: 'temp', label: 'Temporary Context', field: 'recent_turns · open_loops', c: '#5F8091', note: 'Recent turns and open loops. Loops derive from included records only; nothing can be added here by hand.', items: [{ key: 't7', turn: ['s1', 7], reason: 'recent turn', bytes: 96 }, { key: 't8', turn: ['s1', 8], reason: 'recent turn', bytes: 88 }, { key: 'l1', loop: 'Choose the index rebuild trigger', from: ['m1', 'm7'], reason: 'derived open loop · deduplicated', bytes: 0 }, { key: 'l2', loop: 'Accept the first Windows port boundary', from: ['m1'], reason: 'derived open loop', bytes: 0 }] },
      { key: 'sys', label: 'System Constraints', field: 'identity · budget', c: '#9BA9B6', note: 'Rules I run under, and the budget this capsule had to fit.', items: [{ key: 'rules', file: 'runtime_rules.md', text: 'Context contains only the listed records. Candidates and Activity data never enter a capsule.', reason: 'allowlisted identity file', bytes: 188 }, { key: 'budget', policy: true, text: 'Budget 4,096 units · utf8_bytes_v1 · 256 framing reserve. Records are admitted whole or not at all.', reason: 'budget field', bytes: 0 }] },
    ];
    const EXCL = [
      { mem: 'm0', reason: 'inactive · superseded' },
      { mem: 'c1', reason: 'candidate · no capsule path' },
      { mem: 'c3', reason: 'candidate · no capsule path' },
      { mem: 'm8', reason: 'not returned by retrieval' },
    ];
    const RUN = 'run_20261001T040000Z';
    const PUB = hx('pub1') + hx('pub2');
    const ACT = [
      { k: 'a1', at: '2026-10-01T06:44:02.318Z', cat: 'context', title: 'Context compiled', text: 'For “vault adapter rebuild trigger” · 7 memories, 2 turns', details: [['capsule', CAP], ['estimate', '2,427 / 4,096 units'], ['policy', 'utf8_bytes_v1 + 256 reserve'], ['excluded', '4 records'], ['consumed by', 'mock provider v1'], ['consumed sha256', CAPHASH]], link: ['context', null, 'Open on Context Surface'] },
      { k: 'a2', at: '2026-10-01T06:43:40.900Z', cat: 'memory', title: 'Candidate proposed', text: 'A project state update for Enouia Runtime is waiting for your review', details: [['candidate', ID('cand', 'c3')], ['reserves', ID('mem', 'c3')], ['kind', 'project_state'], ['source', 'conversation · turn 11'], ['confidence', '0.83']], link: ['memory', 'c3', 'Review in Candidate Inbox'] },
      { k: 'a3', at: '2026-10-01T06:38:04.900Z', cat: 'memory', title: 'Candidate proposed', text: 'A preference about my interface is waiting for your review', details: [['candidate', ID('cand', 'c1')], ['reserves', ID('mem', 'c1')], ['kind', 'preference'], ['source', 'conversation · turn 9'], ['confidence', '0.78']], link: ['memory', 'c1', 'Review in Candidate Inbox'] },
      { k: 'a4', at: '2026-10-01T06:20:11.604Z', cat: 'session', title: 'Checkpoint created', text: '“Vault adapter planning”, turns 1–8', details: [['command', 'core_create_checkpoint'], ['memory', ID('mem', 'm7')], ['session', ID('ses', 's1')], ['covered', 'turn 1 → turn 8'], ['event seq', '9'], ['result', 'model_only']], link: ['memory', 'm7', 'Open checkpoint'] },
      { k: 'a5', at: '2026-10-01T06:12:40.551Z', cat: 'memory', title: 'Memory updated', text: 'Project state for Enouia Runtime revised; the earlier one is kept as superseded', details: [['command', 'core_review_candidate'], ['decision', 'approve'], ['memory', ID('mem', 'm1')], ['supersedes', ID('mem', 'm0')], ['result', 'model_only']], link: ['memory', 'm1', 'Open memory'] },
      { k: 'a6', at: '2026-10-01T05:58:12.004Z', cat: 'session', title: 'Session started', text: '“Vault adapter planning”', details: [['command', 'core_create_session'], ['session', ID('ses', 's1')]], link: ['sessions', 's1', 'Open session'] },
      { k: 'a7', at: '2026-10-01T04:00:41.207Z', cat: 'producer', title: 'Activity published', text: 'Public activity data observed at the expected origin', details: [['run', RUN], ['stage', 'completed'], ['delivery', 'observed'], ['pending sequence', 'cleared'], ['public sha256', PUB]] },
      { k: 'a8', at: '2026-10-01T04:00:00.312Z', cat: 'producer', title: 'Activity collected', text: 'GitHub, Codex and Claude sources refreshed', details: [['run', RUN], ['github', 'success · fresh'], ['codex', 'success · fresh'], ['claude', 'success · fresh'], ['timezone', 'Asia/Shanghai']] },
      { k: 'a9', at: '2026-09-30T04:00:09.880Z', cat: 'producer', title: 'Collection incomplete', text: 'Claude usage couldn’t be collected; I kept the previous snapshot', details: [['run', 'run_20260930T040000Z'], ['stage', 'failed'], ['component', 'claude'], ['retryable', 'true'], ['kept', 'previous combined snapshot']] },
      { k: 'a10', at: '2026-09-29T15:10:42.019Z', cat: 'memory', title: 'Candidate approved', text: 'You approved: rereading Klara and the Sun', details: [['command', 'core_review_candidate'], ['decision', 'approve'], ['memory', ID('mem', 'm8')], ['result', 'model_only']], link: ['memory', 'm8', 'Open memory'] },
      { k: 'a11', at: '2026-09-29T14:44:10.002Z', cat: 'memory', title: 'Candidate approved', text: 'You approved: quiet notifications after 23:00', details: [['command', 'core_review_candidate'], ['decision', 'approve'], ['memory', ID('mem', 'm3')], ['result', 'model_only']], link: ['memory', 'm3', 'Open memory'] },
      { k: 'a12', at: '2026-09-29T14:32:02.004Z', cat: 'memory', title: 'Memory saved', text: 'You asked me to remember: short, direct answers', details: [['command', 'core_save_memory'], ['saveMode', 'explicit_remember'], ['memory', ID('mem', 'm2')], ['supersedes', ID('mem', 'm2x')], ['result', 'model_only']], link: ['memory', 'm2', 'Open memory'] },
      { k: 'a13', at: '2026-09-29T14:31:40.220Z', cat: 'session', title: 'Session started', text: '“Evening, reading notes”', details: [['command', 'core_create_session'], ['session', ID('ses', 's2')]], link: ['sessions', 's2', 'Open session'] },
    ];
    const RT = [
      { k: 'core', code: 'core', name: 'Core', state: 'Models validated', tone: 'ok', desc: 'Pure Memory, Session and IPC models. The ledger runs in memory and validates every transition; nothing is persisted yet.', rows: [['crates', 'enouia-memory · enouia-session · enouia-core-contract'], ['memory model', 'v1 · 5 kinds'], ['session model', 'v1 · append-only events'], ['ledger', 'in-memory MemoryLedger'], ['id format', 'prefix_ + 32 lowercase hex'], ['timestamps', 'UTC ms · Z'], ['id allocator', 'entropy port · production allocator pending']], checks: [['A1.1 memory models', '17 checks'], ['A1.1 session models', '11 checks'], ['A1.1 core IPC', '7 checks']], limits: ['No durable audit events', 'No filesystem restart persistence'] },
      { k: 'vault', code: 'vault', name: 'Vault', state: 'Design only', tone: 'pending', desc: 'Complete immutable generations selected by one hash-bound pointer. The adapter and recovery tests are not implemented.', rows: [['storage contract', 'vault/storage-v1'], ['decision', 'ADR-020'], ['recovery matrix', 'V01–V22 · evidence pending'], ['ports', '14 operation boundaries · 0 accepted'], ['location', 'not configured'], ['mutation result', 'model_only']], checks: [['backend readiness', '32 artifact hashes · historical design check']], limits: ['No Vault adapter', 'No executable storage fixtures', 'Power-loss durability unverified'] },
      { k: 'index', code: 'index', name: 'Index', state: 'Design probe', tone: 'pending', desc: 'Disposable, generation-bound SQL index with literal query behaviour and deterministic ranks. Verified only in an isolated in-memory probe.', rows: [['index', 'memory-index v1'], ['retrieval', 'retrieval v1 · literal, scoped'], ['decision', 'ADR-021'], ['probe engine', 'SQLite 3.53.1 (development)'], ['persisted', 'no'], ['authority', 'never · rebuildable']], checks: [['index/retrieval design', '18 cases · 48 assertions']], limits: ['Not a persisted runtime index', 'No packaged SQLite dependency'] },
      { k: 'compiler', code: 'context_compiler', name: 'Context Compiler', state: 'Implemented · pure', tone: 'ok', desc: 'Assembles a capsule from ranked canonical memory IDs. Whole-record admission; nothing is truncated.', rows: [['capsule', 'context/capsule v1'], ['budget policy', 'utf8_bytes_v1'], ['framing reserve', '256 units'], ['identity allowlist', 'core.md · runtime_rules.md'], ['last capsule', CAP], ['estimate', '2,427 / 4,096 units'], ['inspection IPC', 'not yet exposed']], checks: [['A1 context capsule', '10 checks']], limits: ['FTS scoring belongs to the retrieval adapter', 'Capsule persistence pending'] },
      { k: 'provider', code: 'provider', name: 'Provider', state: 'Mock v1', tone: 'model', desc: 'Offline mock that consumes only prepared exact capsule bytes. No real model provider is connected.', rows: [['provider', 'mock v1 · offline'], ['input', 'exact capsule bytes'], ['output', 'included project state · consumed hash'], ['tools', 'candidate-only proposals'], ['network', 'none']], checks: [['A2 mock provider', '8 checks']], limits: ['No real provider', 'No orchestration', 'Invocation ledger is design only'] },
      { k: 'gateway', code: 'gateway', name: 'Gateway', state: 'Contract only', tone: 'model', desc: 'Typed local IPC between this interface and Core. DTOs validate; handlers are not implemented.', rows: [['contract', 'ipc/core v1'], ['requests', '8'], ['responses', 'core_snapshot · core_session · core_mutation_completed · core_error'], ['handlers', 'pending'], ['commands v2', 'proposed · not negotiated'], ['jobs/events', 'v1 design']], checks: [['A1.1 core IPC', '7 checks']], limits: ['A client marker is not authorization', 'No context compile command'] },
      { k: 'activity', code: 'activity_producer', name: 'Activity producer', state: 'Implemented', tone: 'ok', desc: 'Collects GitHub, Codex and Claude usage and delivers public ActivityData. Kept separate from Memory and Context.', rows: [['contract', 'ActivityData v1 · batch v1'], ['schedule', 'idle · next 2 Oct, 12:00'], ['delivery', 'observed'], ['pending sequence', 'null'], ['github', 'fresh · contributions'], ['codex', 'fresh · tokens'], ['claude', 'fresh · tokens · Asia/Shanghai'], ['public sha256', PUB]], checks: [['B4 store hard-kill', '23 terminations'], ['B4 frozen comparison', '30 cases']], limits: ['Production cutover pending', 'Never feeds Memory or Context'] },
    ];
    return { hx, ID, short, tTime, tDate, tFull, tDay, dayKey, PRJ, SESS, MEM, CAP, CAPHASH, CTX, EXCL, ACT, RT };
  })();

// A recorded demo capsule must never follow later in-window edits.
function freezeDemo(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDemo);
    Object.freeze(value);
  }
}
freezeDemo(demoData);
