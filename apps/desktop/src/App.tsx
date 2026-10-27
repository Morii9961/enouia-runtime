import React from "react";
import { demoData } from "./demo-data.ts";
import Home from "./screens/Home.tsx";
import Memory from "./screens/Memory.tsx";
import Context from "./screens/Context.tsx";
import Sessions from "./screens/Sessions.tsx";
import Runtime from "./screens/Runtime.tsx";
import RuntimeSurface from "./runtime/RuntimeSurface";
import Settings from "./screens/Settings.tsx";
import { controlWindow, isWindowMaximized, nativeWindow } from './window-controls.ts';
import { approveDemoCandidate, reviseDemoMemory } from './demo-state.ts';
import { ConnectedHome, MemoryBadge, MemorySettings, MemoryStatusProvider } from './memory/status.tsx';
import MemorySurface from './memory/MemorySurface.tsx';
import SessionsSurface, { type SessionTarget } from './memory/SessionsSurface.tsx';
import ContextSurface from './memory/ContextSurface.tsx';
import ShellSettings from './shell/ShellSettings';
import type { DemoMemory } from './demo-state';
import type { Page, WindowAction, DetailRow, SessionEvent, CollectionDefinition, MemoryActions } from './demo-types';

type AppProps = { startPage?: Page; memoryConnected?: boolean; breathing?: boolean; showIds?: boolean };
type AppState = {
  page: Page | null; memCapsule: string | null; memInitialCollection?: "current" | "inbox"; collection: string; sel: string; q: string;
  memSessionTarget?: SessionTarget | null;
  editing: boolean; draft: string; notice: string; mems: DemoMemory[] | null;
  ctxOpen: string | null; sessionKey: string;
  rtKey: string; motionPref: string; copied: boolean; windowError?: string; windowMaximized: boolean | null;
};
export type DemoView = ReturnType<App['renderVals']> & {
  rtSubtitle?: string; still?: boolean; memorySettings?: React.ReactNode; keyboardHint?: string; shellSettings?: React.ReactNode;
};
import { NativeStrip, RecordStrip } from './theme/RecordStrip.tsx';
import { moveAlong } from './theme/motion.ts';

import { msg, t, tn } from './i18n/index.ts';
// Inside the native shell the Memory, Context and Sessions surfaces use the
// pinned Enouia Memory Core (ADR-025). A browser preview has no shell, so it
// keeps the fictional demo.
const memoryConnected = nativeWindow;

export default class App extends React.Component<AppProps, AppState> {
  static D = demoData;

  state: AppState = { page: null, memCapsule: null, collection: 'all', sel: 'm1', q: '', editing: false, draft: '', notice: '', mems: null, ctxOpen: 'm1', sessionKey: 's1', rtKey: 'core', motionPref: 'system', copied: false, windowMaximized: nativeWindow ? null : false };
  ctxScroll = React.createRef<HTMLDivElement>();
  PAGES: Page[] = ['home', 'memory', 'context', 'sessions', 'runtime', 'settings'];

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
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '6') { e.preventDefault(); this.go(this.PAGES[+e.key - 1]); return; }
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
  reviewCandidates = () => {
    this.setState({ page: 'memory', memInitialCollection: 'inbox', editing: false, copied: false, notice: '' },
      () => requestAnimationFrame(() => document.getElementById('mem-center-title')?.focus()));
  };
  openSavedSession = (vaultId: string, sessionId: string) => {
    this.show({ page: 'sessions', memSessionTarget: { vaultId, sessionId }, editing: false, copied: false, notice: '' });
  };
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
  // Leaving a surface removes the control that held focus. Continue in the
  // new surface rather than the document; focus kept elsewhere stays there.
  show<K extends keyof AppState>(patch: Pick<AppState, K>) {
    const apply = () => this.setState(patch, () => {
      if (!document.activeElement || document.activeElement === document.body) document.getElementById('runtime-content')?.focus();
    });
    // Changing surface advances the page along the nav order (presentation only; DESIGN.md §7).
    const next = (patch as Partial<AppState>).page;
    const from = this.PAGES.indexOf(this.page()), to = next ? this.PAGES.indexOf(next) : from;
    if (to !== from && to >= 0) moveAlong('page', apply, to > from ? 'fwd' : 'back'); else apply();
  }
  go(p: Page) { if (this.PAGES.includes(p)) this.show({ page: p, memInitialCollection: 'current', memSessionTarget: null, editing: false, copied: false, notice: '' }); }
  select(k: string) {
    const apply = () => this.setState({ sel: k, editing: false, notice: '', copied: false });
    if (k !== this._selectedKey) moveAlong('select', apply); else apply();
  }
  openMemory(k: string) {
    const m = this.byKey(k); if (!m) return;
    const col = m.status === 'candidate' ? 'candidates' : m.status === 'superseded' ? 'superseded' : 'all';
    this.show({ page: 'memory', collection: col, sel: k, editing: false, notice: '', q: '' });
  }
  now() { return new Date().toISOString(); }

  async copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      this.setState({ copied: true, notice: t('ID copied.') });
    } catch {
      this.setState({ copied: false, notice: t('Could not copy. Select the ID and copy it manually.') });
    }
  }

  async windowAction(action: WindowAction) {
    try {
      await controlWindow(action);
      this.setState({ windowError: undefined });
      if (action === 'maximize') this._windowRead?.();
    }
    catch { this.setState({ windowError: t('Window control failed. Try again.') }); }
  }

  promote() {
    const k = this._selectedKey; if (!k) return; const editing = this.state.editing; const draft = this.state.draft;
    const at = this.now();
    try {
      const mems = approveDemoCandidate(this.mems(), k, editing ? draft : null, at);
      this.setState({ mems, sel: k, editing: false, collection: 'all', notice: t('Demo approval complete · kept in this window only. Reload clears demo changes.') });
    } catch (e) { this.setState({ notice: e instanceof Error ? e.message : t('Demo action failed.') }); }
  }
  saveRevision() {
    const at = this.now();
    const nk = 'r' + crypto.randomUUID();
    try {
      const mems = reviseDemoMemory(this.mems(), this.state.sel, this.state.draft, at, nk);
      this.setState({ mems, sel: nk, editing: false, collection: 'all', notice: t('Demo revision created · previous version retained in this window. Reload clears demo changes.') });
    } catch (e) { this.setState({ notice: e instanceof Error ? e.message : t('Demo action failed.') }); }
  }

  renderVals() {
    const D = App.D; const S = this.state; const page = this.page();
    const mems = this.mems();
    const reduced = S.motionPref === 'reduced' || (this._mq ? this._mq.matches : false) || this.props.breathing === false;
    const showIds = this.props.showIds ?? false;
    const STATUS = { active: t('Canonical'), candidate: t('Candidate'), superseded: t('Superseded'), archived: t('Archived') };
    const KIND = { fact: t('Fact'), preference: t('Preference'), episode: t('Episode'), project_state: t('Project state'), session_checkpoint: t('Checkpoint') };
    const SRC = { conversation: t('Conversation'), import: t('Imported'), manual_save: t('Manual save'), explicit_remember: t('Asked to remember') };
    const sess = (k: string) => { const session = D.SESS.find((s) => s.key === k); if (!session) throw new Error('Unknown demo session.'); return session; };
    const memId = (m: DemoMemory) => D.ID('mem', m.key);
    const srcRef = (m: DemoMemory) => m.src.kind === 'import' ? m.src.importer : m.src.s ? D.short(sess(m.src.s).id) + ' · ' + t('turn {n}', { n: m.src.t ?? '' }) : D.short(D.ID('src', m.key));

    const titles = { home: t('Presence'), memory: t('Memory Vault'), context: t('Context Surface'), sessions: t('Sessions'), runtime: t('Runtime Inspector'), settings: t('Settings') };
    const nav = {} as Record<Page, { go: () => void; ind: number; cur: 'page' | undefined }>;
    this.PAGES.forEach((p) => { const a = p === page; nav[p] = { go: () => this.go(p), ind: a ? 1 : 0, cur: a ? 'page' : undefined }; });
    const railKey = (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const btns = Array.from(e.currentTarget.querySelectorAll('button')); const i = btns.findIndex(button => button === document.activeElement);
      const n = btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]; if (n) { e.preventDefault(); n.focus(); }
    };

    // Memory
    const active = mems.filter((m) => m.status === 'active');
    const cands = mems.filter((m) => m.status === 'candidate');
    const q = S.q.trim().toLowerCase();
    const colDefs: CollectionDefinition[] = [
      { label: t('Review'), items: [['candidates', t('Candidate inbox'), (m) => m.status === 'candidate']] },
      { label: t('Canonical'), items: [['all', t('All canonical'), (m) => m.status === 'active'], ...Object.entries(KIND).map(([k, label]): CollectionDefinition['items'][number] => ['kind:' + k, label, (m) => m.status === 'active' && m.kind === k])] },
      { label: t('Projects'), items: Object.keys(D.PRJ).map((p) => ['prj:' + p, D.PRJ[p].name, (m) => m.status === 'active' && m.project === p]) },
      { label: t('Sources'), items: Object.entries(SRC).map(([s, label]): CollectionDefinition['items'][number] => ['src:' + s, label, (m) => m.status === 'active' && m.src.kind === s]) },
      { label: t('History'), items: [['superseded', t('Superseded'), (m) => m.status === 'superseded'], ['archived', t('Archived'), (m) => m.status === 'archived']] },
    ];
    let curFilter = colDefs[1].items[0][2]; let colTitle = t('All canonical');
    const collections = colDefs.map((g) => ({ label: g.label, items: g.items.map(([k, label, f]) => {
      const a = S.collection === k; if (a) { curFilter = f; colTitle = label; }
      const n = mems.filter(f).length;
      return { key: k, label, count: n, active: a, onClick: () => this.setState({ collection: k, editing: false, notice: '' }) };
    }) }));
    const visible = mems.filter(curFilter).filter((m) => !q || m.content.toLowerCase().includes(q)).sort((a, b) => b.created.localeCompare(a.created));
    this._visible = visible.map((m) => m.key);
    const selectedKey = this._visible.includes(S.sel) ? S.sel : visible[0]?.key;
    this._selectedKey = selectedKey;
    const memoryRow = (m: DemoMemory) => {
      const sel = m.key === selectedKey; const st = STATUS[m.status];
      return { key: m.key, time: D.tTime(m.created), kindLabel: KIND[m.kind], hasProject: !!m.project, projectName: m.project ? D.PRJ[m.project].name : '', showStatus: m.status !== 'active', status: m.status === 'active' ? 'canonical' : m.status, statusLabel: st, content: m.content, sourceLabel: SRC[m.src.kind], sourceRef: srcRef(m), hasConf: m.conf != null, conf: m.conf != null ? m.conf.toFixed(2) : '', showId: showIds, idShort: D.short(m.status === 'candidate' ? D.ID('cand', m.key) : memId(m)), selected: sel, onClick: () => this.select(m.key) };
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
      if (m.kind === 'session_checkpoint' && m.covered && s) why = t('I wrote this checkpoint to cover turns {a}–{b} of “{title}”, so the conversation can continue without replaying it.', { a: m.covered[0], b: m.covered[1], title: s.title });
      else if (isC && s) why = t('I noticed this in “{title}”, turn {n}. It stays out of my context until you review it.', { title: s.title, n: m.src.t ?? '' });
      else if (m.src.kind === 'conversation' && s) why = t(m.editedInReview ? 'I remembered this from “{title}”, turn {n}, on {date}. You approved it after editing.' : 'I remembered this from “{title}”, turn {n}, on {date}. You approved it.', { title: s.title, n: m.src.t ?? '', date: D.tDate(srcAt) });
      else if (m.src.kind === 'explicit_remember') why = s ? t('You asked me to remember this in “{title}” on {date}.', { title: s.title, date: D.tDate(srcAt) }) : t('You asked me to remember this on {date}.', { date: D.tDate(srcAt) });
      else if (m.src.kind === 'manual_save') why = t('You saved this from the Inspector on {date}.', { date: D.tDate(srcAt) });
      else why = t('This came from an import on {date}. The raw file is identified by its hash, not its path.', { date: D.tDate(srcAt) });
      const R = (k: string, v: string, kind: 'p' | 'm' | 'l', onClick?: () => void, sub?: string): DetailRow => ({ k: t(k), v, sub, isPlain: kind === 'p', isMono: kind === 'm', isLink: kind === 'l', onClick });
      const prov = [R(msg('Source'), SRC[m.src.kind], 'p'), R(msg('Source ID'), D.ID('src', m.key), 'm')];
      if (s) { prov.push(R(msg('Session'), s.id, 'l', () => this.show({ page: 'sessions', sessionKey: s.key }))); prov.push(R(msg('Turn'), m.src.t + ' · ' + D.ID('turn', s.key + m.src.t), 'm')); }
      if (m.src.kind === 'import') { prov.push(R(msg('Importer'), m.src.importer ?? t('unknown'), 'm')); prov.push(R(msg('Raw SHA-256'), m.src.sha ?? t('unknown'), 'm')); }
      prov.push(R(msg('Source created'), D.tFull(srcAt), 'p'));
      if (isC) prov.push(R(msg('Candidate'), D.ID('cand', m.key), 'm'));
      else if (m.reviewed && m.src.kind === 'conversation') prov.push(R(msg('Reviewed from'), D.ID('cand', m.key), 'm'));
      const rec = [R(msg('Status'), st[0] + (isC ? ' · ' + t('pending review') : ''), 'p'), R(msg('Kind'), m.kind, 'm'), R(isC ? msg('Proposed') : msg('Created'), D.tFull(m.created), 'p')];
      if (m.updated && m.updated !== m.created) rec.push(R(msg('Revised'), D.tFull(m.updated), 'p'));
      if (m.reviewed) rec.push(R(msg('Reviewed'), D.tFull(m.reviewed), 'p'));
      if (m.project) rec.push(R(msg('Project'), D.PRJ[m.project].name + ' · ' + D.short(D.PRJ[m.project].id), 'p'));
      if (m.validFrom || m.validTo) rec.push(R(msg('Valid'), (m.validFrom || '—') + ' → ' + (m.validTo || t('open')), 'm'));
      if (m.tags && m.tags.length) rec.push(R(msg('Tags'), m.tags.join(' · '), 'm'));
      if (m.originalProposal) rec.push(R(msg('Original proposal'), m.originalProposal.content, 'p'));
      if (isC) rec.push(R(msg('Reserves'), memId(m), 'm'));
      const line = [];
      if (m.supersedes) { const p = this.requireMemory(m.supersedes); line.push(R(msg('Supersedes'), D.short(memId(p)), 'l', () => this.openMemory(p.key), p.content)); }
      if (m.supersededBy) { const p = this.requireMemory(m.supersededBy); line.push(R(msg('Superseded by'), D.short(memId(p)), 'l', () => this.openMemory(p.key), p.content)); }
      if (!line.length) line.push(R(msg('Supersedes'), t('Nothing — this is the first version.'), 'p'));
      const related = mems.filter((o) => o.key !== m.key && o.key !== m.supersedes && o.key !== m.supersededBy && o.status !== 'superseded')
        .map((o) => { const shared = (o.tags || []).filter((t) => (m.tags || []).includes(t)); const sameP = m.project && o.project === m.project; return { o, why: sameP ? t('same project') : shared.length ? t('tag') + ' · ' + shared[0] : null }; })
        .filter((x) => x.why).slice(0, 4).map((x) => ({ key: x.o.key, text: x.o.content, why: x.why, onClick: () => this.openMemory(x.o.key) }));
      sel = { id: isC ? D.ID('cand', m.key) : memId(m), status: m.status === 'active' ? 'canonical' : m.status, statusLabel: st, kindLabel: KIND[m.kind], content: m.content, hasDecisions: !!(m.decisions && m.decisions.length), decisions: m.decisions || [], hasLoops: !!(m.openLoops && m.openLoops.length), openLoops: m.openLoops || [], isCheckpoint: m.kind === 'session_checkpoint', coveredText: m.covered ? t('turns {a}–{b}', { a: m.covered[0], b: m.covered[1] }) : '', lastState: m.lastState || '', why, provRows: prov, recRows: rec, hasConf: m.conf != null, conf: m.conf != null ? m.conf.toFixed(2) : '', confPct: Math.round((m.conf || 0) * 100) + '%', lineRows: line, related, noRelated: !related.length,
        editHint: isC ? t('Approval keeps this candidate’s memory ID, kind, source and creation time.') : t('Saving creates a new canonical record that supersedes this one.'),
        copy: () => this.copyId(isC ? D.ID('cand', m.key) : memId(m)) };
      const ed = S.editing;
      act = { promote: isC && !ed, promoteLabel: t('Promote to canonical'), onPromote: () => this.promote(),
        edit: (isC || m.status === 'active') && !ed && m.kind !== 'session_checkpoint', editLabel: isC ? t('Edit before promoting') : t('Edit · creates a revision'), onEdit: () => this.setState({ sel: m.key, editing: true, draft: m.content, notice: '' }),
        save: ed, saveLabel: isC ? t('Promote with edits') : t('Save revision'), onSave: () => (isC ? this.promote() : this.saveRevision()), onCancel: () => this.setState({ editing: false }),
        none: m.status === 'superseded' && !ed };
    }

    // Context
    const segs = []; const totalUnits = 4096;
    const ctxSections = D.CTX.map((sec) => {
      const items = sec.items.map((it) => {
        const open = S.ctxOpen === sec.key + it.key;
        let text = it.text, srcLabel = '', ref = '', trace = [];
        const T = (k: string, v: string, kind: 'p' | 'm' | 'l', onClick?: () => void): DetailRow => ({ k: t(k), v, isPlain: kind === 'p', isMono: kind === 'm', isLink: kind === 'l', onClick });
        if (it.mem) { const mm = this.requireMemory(it.mem, D.MEM); text = mm.content; srcLabel = KIND[mm.kind] + ' · ' + SRC[mm.src.kind]; ref = D.short(memId(mm));
          trace = [T(msg('Source memory'), memId(mm), 'l', () => this.openMemory(mm.key)), T(msg('Source record'), D.ID('src', mm.key) + ' · ' + mm.src.kind, 'm'), T(msg('Capsule field'), sec.field.split(' · ')[sec.key === 'events' && mm.kind !== 'session_checkpoint' ? 1 : 0], 'm'), T(msg('Inclusion reason'), t(it.reason), 'p'), T(msg('Retrieval rank'), it.rank != null ? String(it.rank) : t('not ranked · section rule'), 'm'), T(msg('Admitted'), t('whole record') + ' · ' + it.bytes + ' B', 'm')]; }
        else if (it.turn) { const ss = sess(it.turn[0]); const tt = ss.turns[it.turn[1] - 1]; text = (tt[0] === 'user' ? t('You') : 'Enouia') + ': ' + tt[1]; srcLabel = t('Turn {n}', { n: it.turn[1] }); ref = D.short(D.ID('turn', ss.key + it.turn[1]));
          trace = [T(msg('Session'), ss.id, 'l', () => this.show({ page: 'sessions', sessionKey: ss.key })), T(msg('Turn'), D.ID('turn', ss.key + it.turn[1]), 'm'), T(msg('Role · time'), tt[0] + ' · ' + D.tFull(tt[2]), 'p'), T(msg('Inclusion reason'), t(it.reason), 'p'), T(msg('Admitted'), t('exact content') + ' · ' + it.bytes + ' B', 'm')]; }
        else if (it.loop) { text = it.loop; srcLabel = t('Open loop'); ref = t('from') + ' ' + (it.from ?? []).map((k) => D.short(D.ID('mem', k))).join(', ');
          trace = (it.from ?? []).map((k) => T(msg('Derived from'), D.ID('mem', k), 'l', () => this.openMemory(k))).concat([T(msg('Inclusion reason'), t(it.reason), 'p'), T(msg('Size'), t('counted in capsule metadata'), 'p')]); }
        else if (it.file) { srcLabel = t('Identity file'); ref = it.file; trace = [T(msg('File'), it.file, 'm'), T(msg('Allowlist'), 'core.md · runtime_rules.md', 'm'), T(msg('Inclusion reason'), t(it.reason), 'p'), T(msg('Admitted'), t('whole file') + ' · ' + it.bytes + ' B', 'm')]; }
        else { srcLabel = t('Capsule budget'); ref = 'budget.max_tokens'; trace = [T(msg('Field'), 'budget.max_tokens = 4096', 'm'), T(msg('Policy'), 'utf8_bytes_v1 · ' + t('one unit per compact UTF-8 byte'), 'm'), T(msg('Reserve'), t('{n} framing units', { n: 256 }), 'm'), T(msg('Note'), t('A local sizing rule, not a provider tokenizer bound'), 'p')]; }
        trace = trace.map((t, i) => ({ ...t, n: String(i + 1).padStart(2, '0') }));
        return { key: sec.key + it.key, text, srcLabel, ref, reason: t(it.reason), rank: it.rank != null ? '#' + it.rank : '—', bytes: it.bytes ? it.bytes + ' B' : t('meta'), open, chev: open ? 'rotate(90deg)' : 'none', trace, toggle: () => this.setState({ ctxOpen: open ? null : sec.key + it.key }) };
      });
      const bytes = sec.items.reduce((a, b) => a + b.bytes, 0);
      segs.push({ w: (bytes / totalUnits * 100).toFixed(2) + '%', section: sec.key, label: t(sec.label) });
      const domId = 'ctx-' + sec.key;
      return { label: t(sec.label), field: sec.field, note: t(sec.note), section: sec.key, count: sec.items.length, bytes: bytes ? bytes + ' B' : t('meta'), domId, items,
        jump: () => { const c = this.ctxScroll.current; const el = c && c.querySelector<HTMLElement>('#' + domId); if (c && el) c.scrollTo({ top: el.offsetTop - 8, behavior: reduced ? 'auto' : 'smooth' }); } };
    });
    segs.push({ w: (282 / totalUnits * 100).toFixed(2) + '%', section: 'metadata', label: t('Metadata + provenance') });
    segs.push({ w: (256 / totalUnits * 100).toFixed(2) + '%', section: 'reserve', label: t('Framing reserve') });
    const ctx = { capId: D.CAP, capShort: D.short(D.CAP), at: D.tFull('2026-10-01T06:44:02.318Z'), hash: D.CAPHASH, segs, sections: ctxSections,
      excluded: D.EXCL.map((x) => { const mm = this.requireMemory(x.mem); const live = mm.status; const reason = x.mem.startsWith('c') && live === 'active' ? t('promoted after compile · next capsule') : t(x.reason); return { text: mm.content, ref: D.short(x.mem.startsWith('c') ? D.ID('cand', x.mem) : memId(mm)), reason, onClick: () => this.openMemory(mm.key) }; }),
      jumpExcl: () => { const c = this.ctxScroll.current; const el = c && c.querySelector<HTMLElement>('#ctx-excluded'); if (c && el) c.scrollTo({ top: el.offsetTop - 8, behavior: reduced ? 'auto' : 'smooth' }); } };

    // Sessions
    const sessList = D.SESS.map((s) => ({ key: s.key, selected: s.key === S.sessionKey, title: s.title, meta: D.tDate(s.created) + ' · ' + tn(s.turns.length, '{n} turn', '{n} turns') + (s.checkpoints.length ? ' · ' + tn(s.checkpoints.length, '{n} checkpoint', '{n} checkpoints') : ''), onClick: () => this.setState({ sessionKey: s.key }) }));
    const cs = sess(S.sessionKey);
    const writesFor = (t: number) => mems.filter((x) => x.src.s === cs.key && x.src.t === t && x.kind !== 'session_checkpoint');
    const events: SessionEvent[] = []; let seq = 0;
    cs.turns.forEach((turn, i) => {
      const n = i + 1; seq++;
      const isU = turn[0] === 'user';
      events.push({ isTurn: true, isCheckpoint: false, seq: String(seq), time: D.tTime(turn[2]), n, role: isU ? t('You') : 'Enouia', speaker: turn[0], text: turn[1], turnShort: D.short(D.ID('turn', cs.key + n)),
        writes: writesFor(n).map((w) => ({ key: w.key, label: w.status === 'candidate' ? t('Candidate proposed') : w.src.kind === 'explicit_remember' ? t('Memory saved') : w.status === 'superseded' ? t('Memory written · since superseded') : t('Memory written'), ref: D.short(w.status === 'candidate' ? D.ID('cand', w.key) : memId(w)), status: w.status, onClick: () => this.openMemory(w.key) })) });
      cs.checkpoints.filter((c) => c.after === n).forEach((c) => { seq++; const cm = this.checkpoint(c.mem);
        events.push({ isTurn: false, isCheckpoint: true, seq: String(seq), time: D.tTime(c.at), covered: cm.covered[0] + '–' + cm.covered[1], lastState: cm.lastState, loops: cm.openLoops, ref: D.short(memId(cm)), onClick: () => this.openMemory(cm.key) }); });
    });
    const allWrites = mems.filter((x) => x.src.s === cs.key && x.kind !== 'session_checkpoint').sort((a, b) => (a.src.t ?? 0) - (b.src.t ?? 0));
    const lastAt = cs.checkpoints.length && cs.checkpoints[cs.checkpoints.length - 1].at > cs.turns[cs.turns.length - 1][2] ? cs.checkpoints[cs.checkpoints.length - 1].at : cs.turns[cs.turns.length - 1][2];
    const ses = { title: cs.title, day: D.tDay(cs.created), events,
      meta: [{ k: t('session'), v: cs.id }, { k: t('created'), v: D.tFull(cs.created) }, { k: t('updated'), v: D.tFull(lastAt) }, { k: t('events'), v: String(seq) }, { k: t('turns'), v: String(cs.turns.length) }, { k: t('checkpoints'), v: String(cs.checkpoints.length) }],
      checkpoints: cs.checkpoints.map((c) => { const cm = this.checkpoint(c.mem); return { covered: cm.covered[0] + '–' + cm.covered[1], ref: D.short(memId(cm)), onClick: () => this.openMemory(cm.key) }; }),
      noCheckpoints: !cs.checkpoints.length,
      writes: allWrites.map((w) => ({ key: w.key, text: w.content, turn: w.src.t, label: STATUS[w.status], onClick: () => this.openMemory(w.key) })), noWrites: !allWrites.length, hasCapsule: cs.key === 's1' };

    // Runtime
    const rtList = D.RT.map((c) => ({ name: t(c.name), code: c.code, state: t(c.state), tone: c.tone, onClick: () => this.setState({ rtKey: c.k }) }));
    const rc = D.RT.find((c) => c.k === S.rtKey) ?? D.RT[0];
    const rt = { name: t(rc.name), state: t(rc.state), tone: rc.tone, desc: t(rc.desc),
      rows: rc.rows.map(([k, v]) => ({ k: t(k), v: t(v) })), checks: rc.checks.map(([k, v]) => ({ k: t(k), v: t(v) })), limits: rc.limits.map((l) => t(l)) };
    const rtStrip = [['memory', 'v1'], ['session', 'v1'], ['capsule', 'v1'], ['core ipc', 'v1'], ['schemaVersion', '1'], ['mutation result', 'model_only'], ['toolchain', 'rust 1.98.1 · gnu']].map(([k, v]) => ({ k, v }));

    const cp = this.checkpoint('m7');
    return {
      pageTitle: titles[page], nav, railKey,
      isHome: page === 'home', isMemory: page === 'memory', isContext: page === 'context', isSessions: page === 'sessions', isRuntime: page === 'runtime', isSettings: page === 'settings',
      home: { memoryLine: cands.length ? t('{n} canonical memories, {c} waiting for your review', { n: active.length, c: cands.length }) : t('{n} canonical memories, nothing waiting for review', { n: active.length }), capTime: D.tTime('2026-10-01T06:44:02.318Z'), capShort: D.short(D.CAP), sesTime: D.tTime(D.SESS[0].turns[11][2]), sesShort: D.short(sess('s1').id), cpTime: D.tTime(cp.created), cpShort: D.short(D.ID('mem', 'm7')), openCheckpoint: () => this.openMemory('m7') },
      q: S.q, onQuery: (e: React.ChangeEvent<HTMLInputElement>) => this.setState({ q: e.target.value }), collections, colTitle, colCount: tn(visible.length, '{n} record', '{n} records'), groups, timelineEmpty: !visible.length,
      sel, hasSel: !!sel, noSel: !sel, act, editing: S.editing, notEditing: !S.editing, draft: S.draft, onDraft: (e: React.ChangeEvent<HTMLTextAreaElement>) => this.setState({ draft: e.target.value }), notice: S.notice, hasNotice: !!S.notice, copyLabel: S.copied ? t('Copied') : t('Copy ID'),
      ctx, ctxScroll: this.ctxScroll, sessList, ses, rtList, rt, rtStrip,
      motionOpts: [['system', msg('Follow system')], ['reduced', msg('Reduced')]].map(([k, label]) => { const a = S.motionPref === k; return { label: t(label), active: a, onClick: () => this.setState({ motionPref: k }) }; }),
    };
  }

  render() {
    const view = this.renderVals();
    const { pageTitle, nav, railKey, isHome, isMemory, isContext, isSessions, isRuntime, isSettings } = view;
    const connected = this.connected();
    // 08-negative: presentation-only values for the record strip. They read the
    // same state renderVals() used; nothing here changes what a handler does.
    const still = this.state.motionPref === 'reduced' || (this._mq ? this._mq.matches : false) || this.props.breathing === false;
    const page = this.page();
    const selectedAt = this.byKey(this._selectedKey)?.created;
    const strSession = App.D.SESS.find((s) => s.key === this.state.sessionKey);
    const sessionSpan: [string, string] | undefined = strSession ? [strSession.created, strSession.turns[strSession.turns.length - 1][2]] : undefined;
    const NAV_LABEL: Record<string, string> = { home: t('Home'), memory: t('Memory'), context: t('Context'), sessions: t('Sessions'), runtime: t('Runtime'), settings: t('Settings') };
    const navEl = (
<nav aria-label={t("Primary")} onKeyDown={railKey} className="qr231 bg-nav">
{this.PAGES.map((p, i) => <React.Fragment key={p}>
{p === 'settings' ? <span className="bg-nav-gap" aria-hidden="true" /> : null}
<button aria-label={NAV_LABEL[p]} aria-current={nav[p].cur} onClick={nav[p].go} className="qr230 bg-nav-item" type="button">
<span className="bg-nav-n" aria-hidden="true">{i + 1}</span>
<span className="qr229">{NAV_LABEL[p]}</span>
</button>
</React.Fragment>)}
</nav>
    );
    const penMark = <span className="bg-pen-mark" aria-hidden="true"><svg width="18" height="14" viewBox="0 0 18 14"><path d="M0 0L18 7L0 14z" fill="currentColor" /></svg></span>;
    const surface = (
<div className="qr234 bg-app" data-motion={this.state.motionPref} data-page={page}>
<a className="runtime-skip-link" href="#runtime-content" onClick={(event) => {
  event.preventDefault();
  document.getElementById('runtime-content')?.focus();
}}>{t("Skip to current surface")}</a>
<header className="qr227 bg-titlebar" data-tauri-drag-region>
<div className="qr220 bg-logo" aria-hidden="true">
<svg width="22" height="14" viewBox="0 0 22 14"><path d="M1 10.5C4 10.5 5 6 8 6s3.5 4 6.5 4S17 4.5 19 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M18 2l4 2.5-4 2.5z" style={{ fill: 'var(--pen)' }} /></svg>
</div>
<div className="qr221" lang="en">
Enouia Runtime
</div>
{connected ? null : <div className="bg-chartno">{t("Negative No. 40 · week of 28 Sep 2026")}</div>}
<div className="qr222">
{pageTitle}
</div>
<div className="qr30" data-tauri-drag-region>

</div>
{this.connected() ? <MemoryBadge /> : <div className="qr224" role="status" title={t("Fictional demo data. No backend connection. Reload clears changes.")}>
<span className="qr223">

</span>
{t("Demo · local only")}
</div>}
{this.state.windowError ? <span role="alert" className="bg-window-error">{this.state.windowError}</span> : null}
<div className="qr226">
<button aria-label={t("Minimize")} className="window-control" disabled={!nativeWindow} onClick={() => this.windowAction('minimize')} type="button">
<svg width="10" height="10" viewBox="0 0 10 10">
<path d="M0 5h10" stroke="currentColor" strokeWidth="1">

</path>
</svg>
</button>
<button aria-label={this.state.windowMaximized === null ? t('Maximize or restore') : this.state.windowMaximized ? t('Restore') : t('Maximize')} className="window-control" disabled={!nativeWindow} onClick={() => this.windowAction('maximize')} type="button">
<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
{this.state.windowMaximized ? <path d="M2.5 2.5v-2h7v7h-2M0.5 2.5h7v7h-7z" fill="none" stroke="currentColor" strokeWidth="1" /> :
<rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1">

</rect>
}
</svg>
</button>
<button aria-label={t("Close")} className="window-control window-close" disabled={!nativeWindow} onClick={() => this.windowAction('close')} type="button">
<svg width="10" height="10" viewBox="0 0 10 10">
<path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1">

</path>
</svg>
</button>
</div>
</header>
<div className="qr233 bg-body">
{connected ? <NativeStrip page={page} nav={navEl} /> : <RecordStrip page={page} nav={navEl} still={still} selectedAt={selectedAt} sessionSpan={sessionSpan} sessionKey={this.state.sessionKey} />}
<main id="runtime-content" className="qr232" tabIndex={-1} aria-label={t('{page} content', { page: isHome ? t('Home') : pageTitle })}>
{isHome ? <>
{connected ? <ConnectedHome nav={view.nav} ring={penMark} /> : <Home view={{ ...view, still }} />}
</> : null}
{isMemory ? <>
{connected ? <MemorySurface initialCollection={this.state.memInitialCollection} openSession={this.openSavedSession} /> : <Memory view={view} />}
</> : null}
{isContext ? <>
{connected ? <ContextSurface capsuleId={this.state.memCapsule} /> : <Context view={view} />}
</> : null}
{isSessions ? <>
{connected ? <SessionsSurface inspect={(id) => this.inspectCapsule(id)} reviewCandidates={this.reviewCandidates} target={this.state.memSessionTarget} /> : <Sessions view={view} />}
</> : null}
{isRuntime ? <>
{connected ? <RuntimeSurface /> : <Runtime view={view} />}
</> : null}
{isSettings ? <>
{<Settings view={connected ? { ...view, memorySettings: <MemorySettings openMemory={() => this.go('memory')} />, shellSettings: <ShellSettings />, keyboardHint: t('Keyboard: Ctrl+1–6 switches surfaces · ↑ ↓ moves within the memory list.') } : view} />}
</> : null}
</main>
</div>
</div>
    );
    return connected ? <MemoryStatusProvider>{surface}</MemoryStatusProvider> : surface;
  }
}
