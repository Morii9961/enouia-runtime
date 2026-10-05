// Render the actual React views through Vite's TSX loader. This checks demo
// rendering only: no DOM interactions, native IPC or personal Vault is used.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
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
