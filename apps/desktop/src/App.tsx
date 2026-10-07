import React from "react";
import { demoData } from "./demo-data.ts";
import Home from "./screens/Home.tsx";
import Memory from "./screens/Memory.tsx";
import Context from "./screens/Context.tsx";
import Sessions from "./screens/Sessions.tsx";
import Activity from "./screens/Activity.tsx";
import Runtime from "./screens/Runtime.tsx";
import Settings from "./screens/Settings.tsx";
import { controlWindow, isWindowMaximized, nativeWindow } from './window-controls.ts';
import { approveDemoCandidate, reviseDemoMemory } from './demo-state.ts';
import { ConnectedHome, MemoryBadge, MemorySettings, MemoryStatusProvider } from './memory/status.tsx';
import MemorySurface from './memory/MemorySurface.tsx';
import SessionsSurface from './memory/SessionsSurface.tsx';
import ContextSurface from './memory/ContextSurface.tsx';
import ShellSettings from './shell/ShellSettings';
import type { DemoMemory } from './demo-state';
import type { Page, WindowAction, DetailRow, SessionEvent, CollectionDefinition, MemoryActions, DemoActivity } from './demo-types';

type AppProps = { startPage?: Page; memoryConnected?: boolean; breathing?: boolean; showIds?: boolean };
type AppState = {
  page: Page | null; memCapsule: string | null; collection: string; sel: string; q: string;
  editing: boolean; draft: string; notice: string; mems: DemoMemory[] | null;
  ctxOpen: string | null; sessionKey: string; actFilter: string; actOpen: string | null;
  rtKey: string; paused: boolean; motionPref: string; copied: boolean; windowError?: string; windowMaximized: boolean | null;
};
export type DemoView = ReturnType<App['renderVals']> & {
  rtSubtitle?: string; memorySettings?: React.ReactNode; keyboardHint?: string; shellSettings?: React.ReactNode;
};

// Inside the native shell the Memory, Context and Sessions surfaces use the
// pinned Enouia Memory Core (ADR-025). A browser preview has no shell, so it
// keeps the fictional demo.
const memoryConnected = nativeWindow;

export default class App extends React.Component<AppProps, AppState> {
  static D = demoData;

  state: AppState = { page: null, memCapsule: null, collection: 'all', sel: 'm1', q: '', editing: false, draft: '', notice: '', mems: null, ctxOpen: 'm1', sessionKey: 's1', actFilter: 'all', actOpen: 'a1', rtKey: 'core', paused: false, motionPref: 'system', copied: false, windowMaximized: nativeWindow ? null : false };
  ctxScroll = React.createRef<HTMLDivElement>();
  PAGES: Page[] = ['home', 'memory', 'context', 'sessions', 'activity', 'runtime', 'settings'];

  _key?: (event: KeyboardEvent) => void;
  _mq?: MediaQueryList;
  _mqf?: () => void;
  _visible: string[] = [];
  _selectedKey: string | undefined;
  _windowRead?: () => void;
  _windowGeneration = 0;

  componentDidMount() {
    this._key = (e) => {
      // A modal review dialog owns the keyboard until it closes.
      if (document.querySelector('dialog[open]')) return;
      const target = e.target instanceof Element ? e.target : null;
      const tag = target?.tagName || '';
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '7') { e.preventDefault(); this.go(this.PAGES[+e.key - 1]); return; }
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (target?.closest('nav')) return;
      const d = e.key === 'ArrowDown' ? 1 : -1;
      const page = this.page();
      if (this.connected() && (page === 'memory' || page === 'sessions')) return;
      if (page === 'memory') { const list = this._visible || []; const i = this._selectedKey ? list.indexOf(this._selectedKey) : -1; const n = list[Math.max(0, Math.min(list.length - 1, i + d))]; if (n) { e.preventDefault(); this.select(n); } }
      if (page === 'sessions') { const keys = App.D.SESS.map((s) => s.key); const i = keys.indexOf(this.state.sessionKey); const n = keys[Math.max(0, Math.min(keys.length - 1, i + d))]; e.preventDefault(); this.setState({ sessionKey: n }); }
    };
    window.addEventListener('keydown', this._key);
    this._mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    this._mqf = () => this.forceUpdate();
    if (this._mq.addEventListener) this._mq.addEventListener('change', this._mqf);
    if (nativeWindow) {
      this._windowRead = () => {
        const generation = ++this._windowGeneration;
        void isWindowMaximized().then((maximized) => {
          if (generation === this._windowGeneration) this.setState({ windowMaximized: maximized });
        }).catch(() => {
          if (generation === this._windowGeneration) this.setState({ windowMaximized: null });
        });
      };
      window.addEventListener('resize', this._windowRead);
      this._windowRead();
    }
  }
  componentWillUnmount() {
    if (this._key) window.removeEventListener('keydown', this._key);
    if (this._mq && this._mqf && this._mq.removeEventListener) this._mq.removeEventListener('change', this._mqf);
    if (this._windowRead) window.removeEventListener('resize', this._windowRead);
    this._windowGeneration += 1;
  }

  page() { return this.state.page || this.props.startPage || 'home'; }
  connected() { return this.props.memoryConnected ?? memoryConnected; }
  inspectCapsule(id: string) {
    this.setState({ memCapsule: id, page: 'context', editing: false, copied: false, notice: '' },
      () => requestAnimationFrame(() => document.getElementById('mem-context-title')?.focus()));
  }
  mems() { return this.state.mems || App.D.MEM; }
  byKey(k: string | undefined) { return this.mems().find((m) => m.key === k); }
  requireMemory(k: string, memories = this.mems()) {
    const memory = memories.find(m => m.key === k);
    if (!memory) throw new Error('Unknown demo memory.');
    return memory;
  }
  checkpoint(k: string) {
    const memory = this.requireMemory(k);
    if (memory.kind !== 'session_checkpoint' || !memory.covered || !memory.lastState || !memory.openLoops) throw new Error('Invalid demo checkpoint.');
    return { ...memory, covered: memory.covered, lastState: memory.lastState, openLoops: memory.openLoops };
  }
  go(p: Page) { if (this.PAGES.includes(p)) this.setState({ page: p, editing: false, copied: false, notice: '' }); }
  select(k: string) { this.setState({ sel: k, editing: false, notice: '', copied: false }); }
  openMemory(k: string) {
    const m = this.byKey(k); if (!m) return;
    const col = m.status === 'candidate' ? 'candidates' : m.status === 'superseded' ? 'superseded' : 'all';
    this.setState({ page: 'memory', collection: col, sel: k, editing: false, notice: '', q: '' });
  }
  now() { return new Date().toISOString(); }

  async copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      this.setState({ copied: true, notice: 'ID copied.' });
    } catch {
      this.setState({ copied: false, notice: 'Could not copy. Select the ID and copy it manually.' });
    }
  }

  async windowAction(action: WindowAction) {
    try {
      await controlWindow(action);
      this.setState({ windowError: undefined });
      if (action === 'maximize') this._windowRead?.();
    }
    catch { this.setState({ windowError: 'Window control failed. Try again.' }); }
  }

  promote() {
    const k = this._selectedKey; if (!k) return; const editing = this.state.editing; const draft = this.state.draft;
    const at = this.now();
    try {
      const mems = approveDemoCandidate(this.mems(), k, editing ? draft : null, at);
      this.setState({ mems, sel: k, editing: false, collection: 'all', notice: 'Demo approval complete · kept in this window only. Reload clears demo changes.' });
    } catch (e) { this.setState({ notice: e instanceof Error ? e.message : 'Demo action failed.' }); }
  }
  saveRevision() {
    const at = this.now();
    const nk = 'r' + crypto.randomUUID();
    try {
      const mems = reviseDemoMemory(this.mems(), this.state.sel, this.state.draft, at, nk);
      this.setState({ mems, sel: nk, editing: false, collection: 'all', notice: 'Demo revision created · previous version retained in this window. Reload clears demo changes.' });
    } catch (e) { this.setState({ notice: e instanceof Error ? e.message : 'Demo action failed.' }); }
  }

  renderVals() {
    const D = App.D; const S = this.state; const page = this.page();
    const mems = this.mems();
    const reduced = S.motionPref === 'reduced' || (this._mq ? this._mq.matches : false) || this.props.breathing === false;
    const showIds = this.props.showIds ?? false;
    const TONE = { ok: '#9DBFA0', model: '#9FC2D2', pending: '#D8BC8A', err: '#DDA0A0' };
    const STATUS = { active: ['Canonical', '#9FC2D2'], candidate: ['Candidate', '#EEE7DC'], superseded: ['Superseded', '#7F8D9A'], archived: ['Archived', '#7F8D9A'] };
    const KIND = { fact: 'Fact', preference: 'Preference', episode: 'Episode', project_state: 'Project state', session_checkpoint: 'Checkpoint' };
    const SRC = { conversation: 'Conversation', import: 'Imported', manual_save: 'Manual save', explicit_remember: 'Asked to remember' };
    const sess = (k: string) => { const session = D.SESS.find((s) => s.key === k); if (!session) throw new Error('Unknown demo session.'); return session; };
    const memId = (m: DemoMemory) => D.ID('mem', m.key);
    const srcRef = (m: DemoMemory) => m.src.kind === 'import' ? m.src.importer : m.src.s ? D.short(sess(m.src.s).id) + ' · turn ' + m.src.t : D.short(D.ID('src', m.key));

    const titles = { home: 'Presence', memory: 'Memory Vault', context: 'Context Surface', sessions: 'Sessions', activity: 'Activity', runtime: 'Runtime Inspector', settings: 'Settings' };
    const nav = {} as Record<Page, { go: () => void; bg: string; fg: string; ind: number; cur: 'page' | undefined }>;
    this.PAGES.forEach((p) => { const a = p === page; nav[p] = { go: () => this.go(p), bg: a ? '#17212B' : 'transparent', fg: a ? '#E7EDF2' : '#9BA9B6', ind: a ? 1 : 0, cur: a ? 'page' : undefined }; });
    const railKey = (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const btns = Array.from(e.currentTarget.querySelectorAll('button')); const i = btns.findIndex(button => button === document.activeElement);
      const n = btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]; if (n) { e.preventDefault(); n.focus(); }
    };

    const anim = (delay: number) => reduced ? {} : { animation: 'enouiaBreath 6s ease-in-out ' + delay + 's infinite' };
    const h = React.createElement;
    const ring = h('div', { 'aria-hidden': true, style: { position: 'relative', width: 72, height: 72 } },
      h('div', { style: { position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(159,194,210,0.22)', ...anim(-1.5) } }),
      h('div', { style: { position: 'absolute', inset: 13, borderRadius: '50%', border: '1px solid rgba(159,194,210,0.5)', ...anim(0) } }),
      h('div', { style: { position: 'absolute', left: 33, top: 33, width: 6, height: 6, borderRadius: 3, background: '#EEE7DC' } }));

    // Memory
    const active = mems.filter((m) => m.status === 'active');
    const cands = mems.filter((m) => m.status === 'candidate');
    const q = S.q.trim().toLowerCase();
    const colDefs: CollectionDefinition[] = [
      { label: 'Review', items: [['candidates', 'Candidate inbox', (m) => m.status === 'candidate']] },
      { label: 'Canonical', items: [['all', 'All canonical', (m) => m.status === 'active'], ...Object.entries(KIND).map(([k, label]): CollectionDefinition['items'][number] => ['kind:' + k, label, (m) => m.status === 'active' && m.kind === k])] },
      { label: 'Projects', items: Object.keys(D.PRJ).map((p) => ['prj:' + p, D.PRJ[p].name, (m) => m.status === 'active' && m.project === p]) },
      { label: 'Sources', items: Object.entries(SRC).map(([s, label]): CollectionDefinition['items'][number] => ['src:' + s, label, (m) => m.status === 'active' && m.src.kind === s]) },
      { label: 'History', items: [['superseded', 'Superseded', (m) => m.status === 'superseded'], ['archived', 'Archived', (m) => m.status === 'archived']] },
    ];
    let curFilter = colDefs[1].items[0][2]; let colTitle = 'All canonical';
    const collections = colDefs.map((g) => ({ label: g.label, items: g.items.map(([k, label, f]) => {
      const a = S.collection === k; if (a) { curFilter = f; colTitle = label; }
      const n = mems.filter(f).length;
      return { key: k, label, count: n, active: a, bg: a ? '#17212B' : 'transparent', fg: a ? '#E7EDF2' : '#9BA9B6', countColor: k === 'candidates' && n > 0 ? '#EEE7DC' : '#61707D', onClick: () => this.setState({ collection: k, editing: false, notice: '' }) };
    }) }));
    const visible = mems.filter(curFilter).filter((m) => !q || m.content.toLowerCase().includes(q)).sort((a, b) => b.created.localeCompare(a.created));
    this._visible = visible.map((m) => m.key);
    const selectedKey = this._visible.includes(S.sel) ? S.sel : visible[0]?.key;
    this._selectedKey = selectedKey;
    const memoryRow = (m: DemoMemory) => {
      const sel = m.key === selectedKey; const st = STATUS[m.status];
      return { key: m.key, time: D.tTime(m.created), kindLabel: KIND[m.kind], hasProject: !!m.project, projectName: m.project ? D.PRJ[m.project].name : '', showStatus: m.status !== 'active', statusLabel: st[0], statusColor: st[1], content: m.content, textColor: m.status === 'superseded' ? '#9BA9B6' : '#E7EDF2', sourceLabel: SRC[m.src.kind], sourceRef: srcRef(m), hasConf: m.conf != null, conf: m.conf != null ? m.conf.toFixed(2) : '', showId: showIds, idShort: D.short(m.status === 'candidate' ? D.ID('cand', m.key) : memId(m)), selected: sel, bg: sel ? '#17212B' : 'transparent', onClick: () => this.select(m.key) };
    };
    type MemoryGroup = { key: string; label: string; items: ReturnType<typeof memoryRow>[] };
    const gmap: Record<string, MemoryGroup> = {}; const groups: MemoryGroup[] = [];
    visible.forEach((m) => {
      const dk = D.dayKey(m.created);
      if (!gmap[dk]) { gmap[dk] = { key: dk, label: D.tDay(m.created), items: [] }; groups.push(gmap[dk]); }
      gmap[dk].items.push(memoryRow(m));
    });

    const m = this.byKey(selectedKey); let sel = null; let act: Partial<MemoryActions> = {};
    if (m) {
      const st = STATUS[m.status]; const isC = m.status === 'candidate'; const s = m.src.s ? sess(m.src.s) : null;
      const srcAt = m.src.at || (s && m.src.t ? s.turns[m.src.t - 1][2] : m.created);
      let why = '';
      if (m.kind === 'session_checkpoint' && m.covered && s) why = 'I wrote this checkpoint to cover turns ' + m.covered[0] + '–' + m.covered[1] + ' of “' + s.title + '”, so the conversation can continue without replaying it.';
      else if (isC && s) why = 'I noticed this in “' + s.title + '”, turn ' + m.src.t + '. It stays out of my context until you review it.';
      else if (m.src.kind === 'conversation' && s) why = 'I remembered this from “' + s.title + '”, turn ' + m.src.t + ', on ' + D.tDate(srcAt) + '. You approved it' + (m.editedInReview ? ' after editing.' : '.');
      else if (m.src.kind === 'explicit_remember') why = 'You asked me to remember this' + (s ? ' in “' + s.title + '”' : '') + ' on ' + D.tDate(srcAt) + '.';
      else if (m.src.kind === 'manual_save') why = 'You saved this from the Inspector on ' + D.tDate(srcAt) + '.';
      else why = 'This came from an import on ' + D.tDate(srcAt) + '. The raw file is identified by its hash, not its path.';
      const R = (k: string, v: string, kind: 'p' | 'm' | 'l', onClick?: () => void, sub?: string): DetailRow => ({ k, v, sub, isPlain: kind === 'p', isMono: kind === 'm', isLink: kind === 'l', onClick });
      const prov = [R('Source', SRC[m.src.kind], 'p'), R('Source ID', D.ID('src', m.key), 'm')];
      if (s) { prov.push(R('Session', s.id, 'l', () => this.setState({ page: 'sessions', sessionKey: s.key }))); prov.push(R('Turn', m.src.t + ' · ' + D.ID('turn', s.key + m.src.t), 'm')); }
      if (m.src.kind === 'import') { prov.push(R('Importer', m.src.importer ?? 'unknown', 'm')); prov.push(R('Raw SHA-256', m.src.sha ?? 'unknown', 'm')); }
      prov.push(R('Source created', D.tFull(srcAt), 'p'));
      if (isC) prov.push(R('Candidate', D.ID('cand', m.key), 'm'));
      else if (m.reviewed && m.src.kind === 'conversation') prov.push(R('Reviewed from', D.ID('cand', m.key), 'm'));
      const rec = [R('Status', st[0] + (isC ? ' · pending review' : ''), 'p'), R('Kind', m.kind, 'm'), R(isC ? 'Proposed' : 'Created', D.tFull(m.created), 'p')];
      if (m.updated && m.updated !== m.created) rec.push(R('Revised', D.tFull(m.updated), 'p'));
      if (m.reviewed) rec.push(R('Reviewed', D.tFull(m.reviewed), 'p'));
      if (m.project) rec.push(R('Project', D.PRJ[m.project].name + ' · ' + D.short(D.PRJ[m.project].id), 'p'));
      if (m.validFrom || m.validTo) rec.push(R('Valid', (m.validFrom || '—') + ' → ' + (m.validTo || 'open'), 'm'));
      if (m.tags && m.tags.length) rec.push(R('Tags', m.tags.join(' · '), 'm'));
      if (m.originalProposal) rec.push(R('Original proposal', m.originalProposal.content, 'p'));
      if (isC) rec.push(R('Reserves', memId(m), 'm'));
      const line = [];
      if (m.supersedes) { const p = this.requireMemory(m.supersedes); line.push(R('Supersedes', D.short(memId(p)), 'l', () => this.openMemory(p.key), p.content)); }
      if (m.supersededBy) { const p = this.requireMemory(m.supersededBy); line.push(R('Superseded by', D.short(memId(p)), 'l', () => this.openMemory(p.key), p.content)); }
      if (!line.length) line.push(R('Supersedes', 'Nothing — this is the first version.', 'p'));
      const related = mems.filter((o) => o.key !== m.key && o.key !== m.supersedes && o.key !== m.supersededBy && o.status !== 'superseded')
        .map((o) => { const shared = (o.tags || []).filter((t) => (m.tags || []).includes(t)); const sameP = m.project && o.project === m.project; return { o, why: sameP ? 'same project' : shared.length ? 'tag · ' + shared[0] : null }; })
        .filter((x) => x.why).slice(0, 4).map((x) => ({ key: x.o.key, text: x.o.content, why: x.why, onClick: () => this.openMemory(x.o.key) }));
      sel = { id: isC ? D.ID('cand', m.key) : memId(m), statusLabel: st[0], statusColor: st[1], kindLabel: KIND[m.kind], content: m.content, hasDecisions: !!(m.decisions && m.decisions.length), decisions: m.decisions || [], hasLoops: !!(m.openLoops && m.openLoops.length), openLoops: m.openLoops || [], isCheckpoint: m.kind === 'session_checkpoint', coveredText: m.covered ? 'turns ' + m.covered[0] + '–' + m.covered[1] : '', lastState: m.lastState || '', why, provRows: prov, recRows: rec, hasConf: m.conf != null, conf: m.conf != null ? m.conf.toFixed(2) : '', confPct: Math.round((m.conf || 0) * 100) + '%', lineRows: line, related, noRelated: !related.length,
        editHint: isC ? 'Approval keeps this candidate’s memory ID, kind, source and creation time.' : 'Saving creates a new canonical record that supersedes this one.',
        copy: () => this.copyId(isC ? D.ID('cand', m.key) : memId(m)) };
      const ed = S.editing;
      act = { promote: isC && !ed, promoteLabel: 'Promote to canonical', onPromote: () => this.promote(),
        edit: (isC || m.status === 'active') && !ed && m.kind !== 'session_checkpoint', editLabel: isC ? 'Edit before promoting' : 'Edit · creates a revision', onEdit: () => this.setState({ sel: m.key, editing: true, draft: m.content, notice: '' }),
        save: ed, saveLabel: isC ? 'Promote with edits' : 'Save revision', onSave: () => (isC ? this.promote() : this.saveRevision()), onCancel: () => this.setState({ editing: false }),
        none: m.status === 'superseded' && !ed };
    }

    // Context
    const segs = []; const totalUnits = 4096;
    const ctxSections = D.CTX.map((sec) => {
      const items = sec.items.map((it) => {
        const open = S.ctxOpen === sec.key + it.key;
        let text = it.text, srcLabel = '', ref = '', trace = [];
        const T = (k: string, v: string, kind: 'p' | 'm' | 'l', onClick?: () => void): DetailRow => ({ k, v, isPlain: kind === 'p', isMono: kind === 'm', isLink: kind === 'l', onClick });
        if (it.mem) { const mm = this.requireMemory(it.mem, D.MEM); text = mm.content; srcLabel = KIND[mm.kind] + ' · ' + SRC[mm.src.kind]; ref = D.short(memId(mm));
          trace = [T('Source memory', memId(mm), 'l', () => this.openMemory(mm.key)), T('Source record', D.ID('src', mm.key) + ' · ' + mm.src.kind, 'm'), T('Capsule field', sec.field.split(' · ')[sec.key === 'events' && mm.kind !== 'session_checkpoint' ? 1 : 0], 'm'), T('Inclusion reason', it.reason, 'p'), T('Retrieval rank', it.rank != null ? String(it.rank) : 'not ranked · section rule', 'm'), T('Admitted', 'whole record · ' + it.bytes + ' B', 'm')]; }
        else if (it.turn) { const ss = sess(it.turn[0]); const tt = ss.turns[it.turn[1] - 1]; text = (tt[0] === 'user' ? 'You: ' : 'Enouia: ') + tt[1]; srcLabel = 'Turn ' + it.turn[1]; ref = D.short(D.ID('turn', ss.key + it.turn[1]));
          trace = [T('Session', ss.id, 'l', () => this.setState({ page: 'sessions', sessionKey: ss.key })), T('Turn', D.ID('turn', ss.key + it.turn[1]), 'm'), T('Role · time', tt[0] + ' · ' + D.tFull(tt[2]), 'p'), T('Inclusion reason', it.reason, 'p'), T('Admitted', 'exact content · ' + it.bytes + ' B', 'm')]; }
        else if (it.loop) { text = it.loop; srcLabel = 'Open loop'; ref = 'from ' + (it.from ?? []).map((k) => D.short(D.ID('mem', k))).join(', ');
          trace = (it.from ?? []).map((k) => T('Derived from', D.ID('mem', k), 'l', () => this.openMemory(k))).concat([T('Inclusion reason', it.reason, 'p'), T('Size', 'counted in capsule metadata', 'p')]); }
        else if (it.file) { srcLabel = 'Identity file'; ref = it.file; trace = [T('File', it.file, 'm'), T('Allowlist', 'core.md · runtime_rules.md', 'm'), T('Inclusion reason', it.reason, 'p'), T('Admitted', 'whole file · ' + it.bytes + ' B', 'm')]; }
        else { srcLabel = 'Capsule budget'; ref = 'budget.max_tokens'; trace = [T('Field', 'budget.max_tokens = 4096', 'm'), T('Policy', 'utf8_bytes_v1 · one unit per compact UTF-8 byte', 'm'), T('Reserve', '256 framing units', 'm'), T('Note', 'A local sizing rule, not a provider tokenizer bound', 'p')]; }
        trace = trace.map((t, i) => ({ ...t, n: String(i + 1).padStart(2, '0') }));
        return { key: sec.key + it.key, text, srcLabel, ref, reason: it.reason, rank: it.rank != null ? '#' + it.rank : '—', bytes: it.bytes ? it.bytes + ' B' : 'meta', open, bg: open ? '#111820' : 'transparent', chev: open ? 'rotate(90deg)' : 'none', trace, toggle: () => this.setState({ ctxOpen: open ? null : sec.key + it.key }) };
      });
      const bytes = sec.items.reduce((a, b) => a + b.bytes, 0);
      segs.push({ w: (bytes / totalUnits * 100).toFixed(2) + '%', c: sec.c, label: sec.label });
      const domId = 'ctx-' + sec.key;
      return { label: sec.label, field: sec.field, note: sec.note, c: sec.c, count: sec.items.length, bytes: bytes ? bytes + ' B' : 'meta', domId, items, bg: 'transparent',
        jump: () => { const c = this.ctxScroll.current; const el = c && c.querySelector<HTMLElement>('#' + domId); if (c && el) c.scrollTo({ top: el.offsetTop - 8, behavior: reduced ? 'auto' : 'smooth' }); } };
    });
    segs.push({ w: (282 / totalUnits * 100).toFixed(2) + '%', c: '#3A4958', label: 'Metadata + provenance' });
    segs.push({ w: (256 / totalUnits * 100).toFixed(2) + '%', c: '#283542', label: 'Framing reserve' });
    const ctx = { capId: D.CAP, capShort: D.short(D.CAP), at: D.tFull('2026-10-01T06:44:02.318Z'), hash: D.CAPHASH, segs, sections: ctxSections,
      excluded: D.EXCL.map((x) => { const mm = this.requireMemory(x.mem); const live = mm.status; const reason = x.mem.startsWith('c') && live === 'active' ? 'promoted after compile · next capsule' : x.reason; return { text: mm.content, ref: D.short(x.mem.startsWith('c') ? D.ID('cand', x.mem) : memId(mm)), reason, onClick: () => this.openMemory(mm.key) }; }),
      jumpExcl: () => { const c = this.ctxScroll.current; const el = c && c.querySelector<HTMLElement>('#ctx-excluded'); if (c && el) c.scrollTo({ top: el.offsetTop - 8, behavior: reduced ? 'auto' : 'smooth' }); } };

    // Sessions
    const sessList = D.SESS.map((s) => ({ key: s.key, selected: s.key === S.sessionKey, title: s.title, meta: D.tDate(s.created) + ' · ' + s.turns.length + ' turns' + (s.checkpoints.length ? ' · ' + s.checkpoints.length + ' checkpoint' : ''), bg: s.key === S.sessionKey ? '#17212B' : 'transparent', onClick: () => this.setState({ sessionKey: s.key }) }));
    const cs = sess(S.sessionKey);
    const writesFor = (t: number) => mems.filter((x) => x.src.s === cs.key && x.src.t === t && x.kind !== 'session_checkpoint');
    const events: SessionEvent[] = []; let seq = 0;
    cs.turns.forEach((t, i) => {
      const n = i + 1; seq++;
      const isU = t[0] === 'user';
      events.push({ isTurn: true, isCheckpoint: false, seq: String(seq), time: D.tTime(t[2]), n, role: isU ? 'You' : 'Enouia', roleColor: isU ? '#9BA9B6' : '#9FC2D2', textColor: isU ? '#E7EDF2' : '#EEE7DC', text: t[1], turnShort: D.short(D.ID('turn', cs.key + n)), dot: '7px', dotColor: isU ? '#4A5866' : '#9FC2D2',
        writes: writesFor(n).map((w) => ({ key: w.key, label: w.status === 'candidate' ? 'Candidate proposed' : w.src.kind === 'explicit_remember' ? 'Memory saved' : w.status === 'superseded' ? 'Memory written · since superseded' : 'Memory written', ref: D.short(w.status === 'candidate' ? D.ID('cand', w.key) : memId(w)), color: STATUS[w.status][1], onClick: () => this.openMemory(w.key) })) });
      cs.checkpoints.filter((c) => c.after === n).forEach((c) => { seq++; const cm = this.checkpoint(c.mem);
        events.push({ isTurn: false, isCheckpoint: true, seq: String(seq), time: D.tTime(c.at), covered: cm.covered[0] + '–' + cm.covered[1], lastState: cm.lastState, loops: cm.openLoops, ref: D.short(memId(cm)), dot: '9px', dotColor: '#EEE7DC', onClick: () => this.openMemory(cm.key) }); });
    });
    const allWrites = mems.filter((x) => x.src.s === cs.key && x.kind !== 'session_checkpoint').sort((a, b) => (a.src.t ?? 0) - (b.src.t ?? 0));
    const lastAt = cs.checkpoints.length && cs.checkpoints[cs.checkpoints.length - 1].at > cs.turns[cs.turns.length - 1][2] ? cs.checkpoints[cs.checkpoints.length - 1].at : cs.turns[cs.turns.length - 1][2];
    const ses = { title: cs.title, day: D.tDay(cs.created), events,
      meta: [{ k: 'session', v: cs.id }, { k: 'created', v: D.tFull(cs.created) }, { k: 'updated', v: D.tFull(lastAt) }, { k: 'events', v: String(seq) }, { k: 'turns', v: String(cs.turns.length) }, { k: 'checkpoints', v: String(cs.checkpoints.length) }],
      checkpoints: cs.checkpoints.map((c) => { const cm = this.checkpoint(c.mem); return { covered: cm.covered[0] + '–' + cm.covered[1], ref: D.short(memId(cm)), onClick: () => this.openMemory(cm.key) }; }),
      noCheckpoints: !cs.checkpoints.length,
      writes: allWrites.map((w) => ({ key: w.key, text: w.content, turn: w.src.t, label: STATUS[w.status][0], onClick: () => this.openMemory(w.key) })), noWrites: !allWrites.length, hasCapsule: cs.key === 's1' };

    // Activity
    const CAT = { memory: ['Memory', '#9FC2D2'], session: ['Sessions', '#EEE7DC'], context: ['Context', '#B9CCB7'], producer: ['Activity producer', '#7F8D9A'] };
    const actFilters = [['all', 'All'], ['memory', 'Memory'], ['session', 'Sessions'], ['context', 'Context'], ['producer', 'Producer']].map(([k, label]) => { const a = S.actFilter === k; return { label, active: a, bg: a ? '#17212B' : 'transparent', fg: a ? '#E7EDF2' : '#9BA9B6', onClick: () => this.setState({ actFilter: k }) }; });
    const activityRow = (a: DemoActivity) => {
      const open = S.actOpen === a.k; const fail = a.title === 'Collection incomplete';
      return { key: a.k, time: D.tTime(a.at), title: a.title, text: a.text, origin: CAT[a.cat][0], color: fail ? '#D8BC8A' : CAT[a.cat][1], open, bg: open ? '#111820' : 'transparent', chev: open ? 'rotate(90deg)' : 'none', toggle: () => this.setState({ actOpen: open ? null : a.k }),
        details: [{ k: 'at', v: a.at }].concat(a.details.map(([k, v]) => ({ k, v }))), hasLink: !!a.link, linkLabel: a.link ? a.link[2] : '',
        onLink: () => { if (!a.link) return; const [p, key] = a.link; if (p === 'memory' && key) this.openMemory(key); else if (p === 'sessions' && key) this.setState({ page: 'sessions', sessionKey: key }); else this.go(p); } };
    };
    type ActivityDay = { key: string; label: string; items: ReturnType<typeof activityRow>[] };
    const dmap: Record<string, ActivityDay> = {}; const actDays: ActivityDay[] = [];
    D.ACT.filter((a) => S.actFilter === 'all' || a.cat === S.actFilter).forEach((a) => {
      const dk = D.dayKey(a.at);
      if (!dmap[dk]) { dmap[dk] = { key: dk, label: D.tDay(a.at), items: [] }; actDays.push(dmap[dk]); }
      dmap[dk].items.push(activityRow(a));
    });

    // Runtime
    const rtList = D.RT.map((c) => ({ name: c.name, code: c.code, state: c.k === 'activity' && S.paused ? 'Paused' : c.state, tone: c.k === 'activity' && S.paused ? 'paused' : c.tone, color: TONE[c.k === 'activity' && S.paused ? 'pending' : c.tone], bg: c.k === S.rtKey ? '#17212B' : 'transparent', onClick: () => this.setState({ rtKey: c.k }) }));
    const rc = D.RT.find((c) => c.k === S.rtKey) ?? D.RT[0];
    const rt = { name: rc.name, state: rc.k === 'activity' && S.paused ? 'Paused' : rc.state, color: TONE[rc.k === 'activity' && S.paused ? 'pending' : rc.tone], desc: rc.desc,
      rows: rc.rows.map(([k, v]) => ({ k, v: rc.k === 'activity' && k === 'schedule' && S.paused ? 'paused' : v })), checks: rc.checks.map(([k, v]) => ({ k, v })), limits: rc.limits };
    const rtStrip = [['memory', 'v1'], ['session', 'v1'], ['capsule', 'v1'], ['core ipc', 'v1'], ['activity ipc', 'v1'], ['schemaVersion', '1'], ['mutation result', 'model_only'], ['toolchain', 'rust 1.98.1 · gnu']].map(([k, v]) => ({ k, v }));

    const cp = this.checkpoint('m7');
    return {
      pageTitle: titles[page], nav, railKey, ring,
      isHome: page === 'home', isMemory: page === 'memory', isContext: page === 'context', isSessions: page === 'sessions', isActivity: page === 'activity', isRuntime: page === 'runtime', isSettings: page === 'settings',
      home: { memoryLine: active.length + ' canonical memories' + (cands.length ? ', ' + cands.length + ' waiting for your review' : ', nothing waiting for review'), capTime: D.tTime('2026-10-01T06:44:02.318Z'), capShort: D.short(D.CAP), sesTime: D.tTime(D.SESS[0].turns[11][2]), sesShort: D.short(sess('s1').id), cpTime: D.tTime(cp.created), cpShort: D.short(D.ID('mem', 'm7')), openCheckpoint: () => this.openMemory('m7') },
      q: S.q, onQuery: (e: React.ChangeEvent<HTMLInputElement>) => this.setState({ q: e.target.value }), collections, colTitle, colCount: visible.length + (visible.length === 1 ? ' record' : ' records'), groups, timelineEmpty: !visible.length,
      sel, hasSel: !!sel, noSel: !sel, act, editing: S.editing, notEditing: !S.editing, draft: S.draft, onDraft: (e: React.ChangeEvent<HTMLTextAreaElement>) => this.setState({ draft: e.target.value }), notice: S.notice, hasNotice: !!S.notice, copyLabel: S.copied ? 'Copied' : 'Copy ID',
      ctx, ctxScroll: this.ctxScroll, sessList, ses, actFilters, actDays, rtList, rt, rtStrip,
      paused: S.paused, togglePaused: () => this.setState((s) => ({ paused: !s.paused })),
      sw: { bg: S.paused ? '#9FC2D2' : 'transparent', border: S.paused ? '#9FC2D2' : '#3A4958', knob: S.paused ? '#0C1117' : '#9BA9B6', left: S.paused ? '23px' : '3px' },
      motionOpts: [['system', 'Follow system'], ['reduced', 'Reduced']].map(([k, label]) => { const a = S.motionPref === k; return { label, active: a, bg: a ? '#17212B' : 'transparent', fg: a ? '#E7EDF2' : '#9BA9B6', onClick: () => this.setState({ motionPref: k }) }; }),
    };
  }

  render() {
    const view = this.renderVals();
    const { pageTitle, nav, railKey, isHome, isMemory, isContext, isSessions, isActivity, isRuntime, isSettings } = view;
    const connected = this.connected();
    const surface = (
<div className="qr234" data-motion={this.state.motionPref}>
<header className="qr227" data-tauri-drag-region>
<div className="qr220">
<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
<circle cx="7" cy="7" r="5.5" fill="none" stroke="#9FC2D2" strokeOpacity="0.6" strokeWidth="1">

</circle>
<circle cx="7" cy="7" r="1.6" fill="#EEE7DC">

</circle>
</svg>
</div>
<div className="qr221">
Enouia Runtime
</div>
<div className="qr222">
{pageTitle}
</div>
<div className="qr30">

</div>
{this.connected() ? <MemoryBadge /> : <div className="qr224" role="status" title="Fictional demo data. No backend connection. Reload clears changes.">
<span className="qr223">

</span>
Demo · local only
</div>}
{this.state.windowError ? <span role="alert">{this.state.windowError}</span> : null}
<div className="qr226">
<button aria-label="Minimize" className="window-control" disabled={!nativeWindow} onClick={() => this.windowAction('minimize')} type="button">
<svg width="10" height="10" viewBox="0 0 10 10">
<path d="M0 5h10" stroke="currentColor" strokeWidth="1">

</path>
</svg>
</button>
<button aria-label={this.state.windowMaximized === null ? 'Maximize or restore' : this.state.windowMaximized ? 'Restore' : 'Maximize'} className="window-control" disabled={!nativeWindow} onClick={() => this.windowAction('maximize')} type="button">
<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
{this.state.windowMaximized ? <path d="M2.5 2.5v-2h7v7h-2M0.5 2.5h7v7h-7z" fill="none" stroke="currentColor" strokeWidth="1" /> :
<rect x="0.5" y="0.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1">

</rect>
}
</svg>
</button>
<button aria-label="Close" className="window-control window-close" disabled={!nativeWindow} onClick={() => this.windowAction('close')} type="button">
<svg width="10" height="10" viewBox="0 0 10 10">
<path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1">

</path>
</svg>
</button>
</div>
</header>
<div className="qr233">
<nav aria-label="Primary" onKeyDown={railKey} className="qr231">
<button aria-label="Home" aria-current={nav.home.cur} onClick={nav.home.go} className="qr230" style={{"background": nav.home.bg, "color": nav.home.fg}} type="button">
<span className="qr228" style={{"opacity": nav.home.ind}}>

</span>
<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3">
<circle cx="10" cy="10" r="6.5">

</circle>
<circle cx="10" cy="10" r="1.8" fill="currentColor" stroke="none">

</circle>
</svg>
<span className="qr229">
Home
</span>
</button>
<button aria-label="Memory" aria-current={nav.memory.cur} onClick={nav.memory.go} className="qr230" style={{"background": nav.memory.bg, "color": nav.memory.fg}} type="button">
<span className="qr228" style={{"opacity": nav.memory.ind}}>

</span>
<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3">
<rect x="3" y="4" width="14" height="4" rx="1">

</rect>
<path d="M4.5 8v7.5h11V8M8 11h4">

</path>
</svg>
<span className="qr229">
Memory
</span>
</button>
<button aria-label="Context" aria-current={nav.context.cur} onClick={nav.context.go} className="qr230" style={{"background": nav.context.bg, "color": nav.context.fg}} type="button">
<span className="qr228" style={{"opacity": nav.context.ind}}>

</span>
<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
<path d="M10 3l7 3.8-7 3.8-7-3.8z">

</path>
<path d="M3 10.4l7 3.8 7-3.8M3 13.8l7 3.8 7-3.8">

</path>
</svg>
<span className="qr229">
Context
</span>
</button>
<button aria-label="Sessions" aria-current={nav.sessions.cur} onClick={nav.sessions.go} className="qr230" style={{"background": nav.sessions.bg, "color": nav.sessions.fg}} type="button">
<span className="qr228" style={{"opacity": nav.sessions.ind}}>

</span>
<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3">
<path d="M6 3v14">

</path>
<circle cx="6" cy="6.5" r="1.7" fill="#0C1117">

</circle>
<circle cx="6" cy="13.5" r="1.7" fill="#0C1117">

</circle>
<path d="M10 6.5h7M10 13.5h5">

</path>
</svg>
<span className="qr229">
Sessions
</span>
</button>
<button aria-label="Activity" aria-current={nav.activity.cur} onClick={nav.activity.go} className="qr230" style={{"background": nav.activity.bg, "color": nav.activity.fg}} type="button">
<span className="qr228" style={{"opacity": nav.activity.ind}}>

</span>
<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3">
<path d="M7 5h10M7 10h8M7 15h9">

</path>
<circle cx="3.8" cy="5" r="0.9" fill="currentColor">

</circle>
<circle cx="3.8" cy="10" r="0.9" fill="currentColor">

</circle>
<circle cx="3.8" cy="15" r="0.9" fill="currentColor">

</circle>
</svg>
<span className="qr229">
Activity
</span>
</button>
<button aria-label="Runtime" aria-current={nav.runtime.cur} onClick={nav.runtime.go} className="qr230" style={{"background": nav.runtime.bg, "color": nav.runtime.fg}} type="button">
<span className="qr228" style={{"opacity": nav.runtime.ind}}>

</span>
<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3">
<rect x="5" y="5" width="10" height="10" rx="1.5">

</rect>
<path d="M8 2.5V5M12 2.5V5M8 15v2.5M12 15v2.5M2.5 8H5M2.5 12H5M15 8h2.5M15 12h2.5">

</path>
</svg>
<span className="qr229">
Runtime
</span>
</button>
<div className="qr30">

</div>
<button aria-label="Settings" aria-current={nav.settings.cur} onClick={nav.settings.go} className="qr230" style={{"background": nav.settings.bg, "color": nav.settings.fg}} type="button">
<span className="qr228" style={{"opacity": nav.settings.ind}}>

</span>
<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3">
<path d="M3 6.5h14M3 13.5h14">

</path>
<circle cx="8" cy="6.5" r="2" fill="#0C1117">

</circle>
<circle cx="13" cy="13.5" r="2" fill="#0C1117">

</circle>
</svg>
<span className="qr229">
Settings
</span>
</button>
</nav>
<main className="qr232">
{isHome ? <>
{connected ? <ConnectedHome nav={view.nav} ring={view.ring} /> : <Home view={view} />}
</> : null}
{isMemory ? <>
{connected ? <MemorySurface /> : <Memory view={view} />}
</> : null}
{isContext ? <>
{connected ? <ContextSurface capsuleId={this.state.memCapsule} /> : <Context view={view} />}
</> : null}
{isSessions ? <>
{connected ? <SessionsSurface inspect={(id) => this.inspectCapsule(id)} /> : <Sessions view={view} />}
</> : null}
{isActivity ? <>
{<Activity view={view} />}
</> : null}
{isRuntime ? <>
{<Runtime view={connected ? { ...view, rtSubtitle: 'Fictional · frozen Runtime-local design (ADR-025) · live Memory status is in Settings' } : view} />}
</> : null}
{isSettings ? <>
{<Settings view={connected ? { ...view, memorySettings: <MemorySettings openMemory={() => this.go('memory')} />, shellSettings: <ShellSettings />, keyboardHint: 'Keyboard: Ctrl+1–7 switches surfaces · ↑ ↓ moves within the memory list.' } : view} />}
</> : null}
</main>
</div>
</div>
    );
    return connected ? <MemoryStatusProvider>{surface}</MemoryStatusProvider> : surface;
  }
}
