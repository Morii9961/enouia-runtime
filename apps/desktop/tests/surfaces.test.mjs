// Render the actual React views through Vite's TSX loader. This checks demo
// rendering only: no DOM interactions, native IPC or personal Vault is used.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createServer } from 'vite';
import { approveDemoCandidate, reviseDemoMemory } from '../src/demo-state.ts';

const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  configFile: false,
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  appType: 'custom',
});
after(() => server.close());
const { default: App } = await server.ssrLoadModule('/src/App.tsx');
const { OperationFeedback } = await server.ssrLoadModule('/src/memory/ui.tsx');
const { Explorer, Inbox } = await server.ssrLoadModule('/src/memory/MemorySurface.tsx');
const { Sessions } = await server.ssrLoadModule('/src/memory/SessionsSurface.tsx');
const { MemoryStatusProvider } = await server.ssrLoadModule('/src/memory/status.tsx');
const { Context: ConnectedContext } = await server.ssrLoadModule('/src/memory/ContextSurface.tsx');
const at = '2026-10-05T02:00:00.000Z';
const appAt = (page, state = {}) => {
  const app = new App({ startPage: page, memoryConnected: false, breathing: false });
  app.state = { ...app.state, ...state };
  return app;
};

test('all seven demo surfaces render exactly one screen and disclose demo mode', () => {
  const screens = { home: 'Home', memory: 'Memory Vault', context: 'Context Surface',
    sessions: 'Sessions', activity: 'Activity', runtime: 'Runtime Inspector', settings: 'Settings' };
  for (const [page, label] of Object.entries(screens)) {
    const html = renderToStaticMarkup(appAt(page).render());
    assert.equal((html.match(/data-screen-label=/g) ?? []).length, 1, page);
    assert.ok(html.includes(`data-screen-label="${label}"`), page);
    assert.match(html, /Demo · local only/);
    assert.doesNotMatch(html, /enouiaBreath/);
  }
});

test('empty literal search renders the empty inspector without dereferencing a selection', () => {
  const app = appAt('memory', { q: 'no-fixture-contains-this-text' });
  const view = app.renderVals();
  assert.equal(view.sel, null);
  assert.equal(view.groups.length, 0);
  const html = renderToStaticMarkup(app.render());
  assert.match(html, /Nothing here matches/);
  assert.match(html, /Select a memory/);
});

test('edited approval and revision render retained provenance and the frozen capsule', () => {
  let mems = approveDemoCandidate(App.D.MEM, 'c1', 'Reviewed demo preference', at);
  mems = reviseDemoMemory(mems, 'm1', 'Revised demo project state', at, 'revision-test');
  const app = appAt('memory', { mems, sel: 'revision-test' });
  const html = renderToStaticMarkup(app.render());
  assert.match(html, /Revised demo project state/);
  assert.match(html, /Supersedes/);
  assert.match(html, /Manual save/);
  app.state.sel = 'c1';
  assert.match(renderToStaticMarkup(app.render()), /Original proposal/);
  app.state.page = 'context';
  const capsule = renderToStaticMarkup(app.render());
  assert.match(capsule, /promoted after compile/);
  assert.ok(capsule.includes(App.D.MEM.find(m => m.key === 'm1').content));
  assert.doesNotMatch(capsule, /Revised demo project state/);
});

test('every session renders its own ordered turns, writes and checkpoints', () => {
  for (const session of App.D.SESS) {
    const app = appAt('sessions', { sessionKey: session.key });
    const view = app.renderVals();
    assert.equal(view.ses.title, session.title);
    assert.equal(view.ses.events.filter(e => e.isTurn).length, session.turns.length);
    assert.equal(view.ses.events.filter(e => e.isCheckpoint).length, session.checkpoints.length);
    assert.deepEqual(view.ses.events.map(e => Number(e.seq)),
      Array.from({ length: view.ses.events.length }, (_, i) => i + 1));
    assert.ok(renderToStaticMarkup(app.render()).includes(session.title));
  }
});

test('operation feedback offers cancellation only for active cooperative workers', () => {
  const view = (kind, state, cancelRequested = false) => renderToStaticMarkup(
    OperationFeedback({ status: { kind, state, cancelRequested, progress: { done: 4, total: 4 } }, onCancel() {} }),
  );
  for (const kind of ['import', 'import_resume', 'index_rebuild']) {
    for (const state of ['queued', 'running']) {
      assert.match(view(kind, state), />Cancel<\/button>/);
      assert.doesNotMatch(view(kind, state), /Finishes before/);
      const requested = view(kind, state, true);
      assert.match(requested, /disabled=""/);
      assert.match(requested, /Cancellation requested/);
      assert.match(requested, /Waiting for the next safe point/);
      assert.doesNotMatch(requested, /mem-state-cancelled/);
    }
  }
  for (const kind of ['vault_verify', 'backup_export']) {
    assert.doesNotMatch(view(kind, 'running'), /<button/);
    assert.match(view(kind, 'running'), /Finishes before locking or exiting/);
  }
  for (const state of ['succeeded', 'failed', 'cancelled']) {
    assert.doesNotMatch(view('import', state), /<button/);
    assert.match(view('import', state), new RegExp(`mem-state-${state}`));
  }
  assert.match(view('import', 'running'), /mem-state-running/);
});

test('an unobserved explorer reports waiting and never invents an empty result', () => {
  for (const text of ['', 'synthetic query']) {
    const html = renderToStaticMarkup(createElement(Explorer, {
      history: false, submitted: { text, seq: 1 }, onRefresh() {},
    }));
    assert.match(html, /Waiting for memories/);
    assert.match(html, /Refresh results/);
    assert.doesNotMatch(html, /Nothing matches this search|No approved memories here yet|0 records/);
  }
});

test('unobserved candidates and sessions stay unknown rather than reporting empty lists', () => {
  const inbox = renderToStaticMarkup(createElement(MemoryStatusProvider, null, createElement(Inbox)));
  assert.match(inbox, /Waiting for candidates/);
  assert.match(inbox, /Reading candidates/);
  assert.doesNotMatch(inbox, /0 waiting|Nothing waiting for review/);
  const sessions = renderToStaticMarkup(createElement(Sessions, { inspect() {} }));
  assert.match(sessions, /Reading sessions/);
  assert.doesNotMatch(sessions, /No sessions yet/);
});

test('a selected unobserved capsule is reading rather than unselected or inspected', () => {
  const selected = renderToStaticMarkup(createElement(ConnectedContext, { capsuleId: 'cap_00000000-0000-4000-8000-000000000001' }));
  assert.match(selected, /Reading the saved capsule/);
  assert.match(selected, /Reading capsule/);
  assert.doesNotMatch(selected, /No capsule selected|Nothing was included|hash-checked|the actual request is below/);
  const empty = renderToStaticMarkup(createElement(ConnectedContext, { capsuleId: null }));
  assert.match(empty, /No capsule selected/);
  assert.doesNotMatch(empty, /Reading the saved capsule/);
});
