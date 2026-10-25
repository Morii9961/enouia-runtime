// Render actual demo and connected React views through Vite's TSX loader.
// Rendering only: no DOM interactions, native IPC or personal Vault is used.
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
const { ExternalPanel } = await server.ssrLoadModule('/src/memory/ExternalPanel.tsx');
const { WorkspaceProviderCalls } = await server.ssrLoadModule('/src/memory/WorkspaceProviderCalls.tsx');
const { ExtractionPanel } = await server.ssrLoadModule('/src/memory/ExtractionPanel.tsx');
const { SessionEventBody, SessionEventMetadata } = await server.ssrLoadModule('/src/memory/SessionEventBody.tsx');
const { MemoryStatusProvider, VaultLifecycleFeedback, vaultLabel } = await server.ssrLoadModule('/src/memory/status.tsx');
const { Context: ConnectedContext } = await server.ssrLoadModule('/src/memory/ContextSurface.tsx');
const at = '2026-10-05T02:00:00.000Z';
const appAt = (page, state = {}) => {
  const app = new App({ startPage: page, memoryConnected: false, breathing: false });
  app.state = { ...app.state, ...state };
  return app;
};

test('native Settings exposes a non-secret configuration draft even before opening a Vault', () => {
  const html = renderToStaticMarkup(createElement(App, { startPage: 'settings', memoryConnected: true, breathing: false }));
  assert.match(html, /Model configuration draft/);
  assert.match(html, /Generate settings draft/);
  assert.match(html, /Loaded model settings/);
  assert.match(html, /Reload model settings/);
  assert.match(html, /Generating and copying do not save the file, reload settings or activate/);
  assert.doesNotMatch(html, /type="password"|Draft memory-providers\.json|Copy settings draft/);
});

test('browser Settings keeps its fictional mode without a connected configuration form', () => {
  const html = renderToStaticMarkup(createElement(App, { startPage: 'settings', memoryConnected: false, breathing: false }));
  assert.match(html, /Demo · local only/);
  assert.doesNotMatch(html, /Model configuration draft|Generate settings draft|Loaded model settings|Reload model settings/);
});

test('all six demo surfaces render exactly one screen and disclose demo mode', () => {
  const screens = { home: 'Home', memory: 'Memory Vault', context: 'Context Surface',
    sessions: 'Sessions', runtime: 'Runtime Inspector', settings: 'Settings' };
  for (const [page, label] of Object.entries(screens)) {
    const html = renderToStaticMarkup(appAt(page).render());
    assert.equal((html.match(/data-screen-label=/g) ?? []).length, 1, page);
    assert.ok(html.includes(`data-screen-label="${label}"`), page);
    assert.match(html, /href="#runtime-content"/);
    assert.ok(html.includes(`aria-label="${label} content"`), page);
    assert.match(html, /id="runtime-content"[^>]*tabindex="-1"/);
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

test('terminal operation errors remain visible after obsolete cancellation feedback retires', () => {
  const html = renderToStaticMarkup(OperationFeedback({
    status: { kind: 'import', state: 'failed', cancelRequested: false, progress: { done: 1, total: 2 },
      error: { code: 'storage_failed', retryable: false, rules: [] } },
    error: { text: 'Obsolete stop failure', retry() {} }, onCancel() {},
  }));
  assert.match(html, /Storage failed/);
  assert.match(html, /mem-state-failed/);
  assert.doesNotMatch(html, /Obsolete stop failure|>Retry<\/button>/);
});

test('external sending exposes local cancellation without promising remote cancellation', () => {
  const view = (state, cancelRequested = false, result = null) => renderToStaticMarkup(
    OperationFeedback({ status: { kind: 'external_send', state, cancelRequested, progress: { done: 0, total: null }, result }, onCancel() {} }),
  );
  for (const state of ['queued', 'running']) {
    assert.match(view(state), />Stop locally<\/button>/);
    assert.doesNotMatch(view(state), /Finishes before locking/);
    assert.match(view(state), /may have received/);
    const requested = view(state, true);
    assert.match(requested, /disabled=""/);
    assert.match(requested, /Local stop requested/);
    assert.doesNotMatch(requested, /mem-state-cancelled/);
  }
  assert.match(view('succeeded', false, {finish:'completed'}), /Reply saved/);
  assert.match(view('succeeded', false, {finish:'length'}), /output limit/);
  for (const state of ['failed', 'cancelled']) {
    assert.doesNotMatch(view(state), /<button|Reply saved/);
    assert.match(view(state), /recorded outcome/);
  }
  for (const finish of ['failed','cancelled','future', undefined]) {
    assert.doesNotMatch(view('succeeded', false, {finish}), /Reply saved/);
  }
});

test('pending Vault release explains host waiting and retains real uncancellable progress', () => {
  const detached = { vault: { state: 'locked' }, companion: { exiting: false } };
  assert.equal(vaultLabel(detached, true), 'Finishing Vault change');
  assert.equal(vaultLabel(detached, false), 'Vault locked');
  assert.equal(vaultLabel({ ...detached, companion: { exiting: true } }, true), 'Exiting, finishing operations');
  assert.equal(detached.vault.state, 'locked');
  const progress = createElement(OperationFeedback, {
    status: { kind: 'backup_export', state: 'running', progress: { done: 4, total: 9 } }, onCancel() {},
  });
  const html = renderToStaticMarkup(createElement(VaultLifecycleFeedback, null, progress));
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Runtime is finishing Memory operations before releasing the Vault/);
  assert.match(html, /progress 4 \/ 9/);
  assert.match(html, /mem-state-running/);
  assert.doesNotMatch(html, /<button/);
  assert.doesNotMatch(html, /Vault locked/);
});

test('verification completion reports integrity separately from operation success', () => {
  const result = {clean:true,recordsChecked:17,objectsChecked:3,missingRecords:0,corruptRecords:0,missingObjects:0,corruptObjects:0,damagedSegments:0};
  const view=(value,state='succeeded')=>renderToStaticMarkup(OperationFeedback({status:{kind:'vault_verify',state,progress:{done:1,total:1},result:value},onCancel(){}}));
  assert.match(view(result),/Verification passed: 17 records · 3 objects/);
  const damaged=view({...result,clean:false,missingObjects:2,corruptRecords:1,damagedSegments:4});
  assert.match(damaged,/mem-state-succeeded/);
  assert.match(damaged,/Verification found integrity problems/);
  assert.match(damaged,/corrupt records: 1/);
  assert.match(damaged,/missing objects: 2/);
  assert.match(damaged,/damaged segments: 4/);
  assert.doesNotMatch(damaged,/Verification passed/);
  for(const value of [null,{}, {...result,clean:undefined}]) assert.doesNotMatch(view(value),/Verification passed|Verification found/);
  for(const state of ['queued','running','failed']) assert.doesNotMatch(view(result,state),/Verification passed/);
});

test('only a completed backup displays its saved snapshot and literal destination', () => {
  const view=(state)=>renderToStaticMarkup(OperationFeedback({status:{kind:'backup_export',state,progress:{done:1,total:1},result:{sequence:23,files:41,destinationName:'<img src=x>'}},onCancel(){}}));
  const done=view('succeeded');
  assert.match(done,/Backup saved: commit #23 · 41 files/);
  assert.match(done,/&lt;img src=x&gt;/);
  assert.doesNotMatch(done,/<img/);
  for(const state of ['queued','running','failed','cancelled']) assert.doesNotMatch(view(state),/Backup saved/);
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

test('saved Mock statements stay literal and retain the exact response for inspection', () => {
  const sourceId = 'src_00000000-0000-4000-8000-000000000001';
  const value = {dispatch_id:'dsp_00000000-0000-4000-8000-000000000002',status:'supported_evidence',
    statements:['<img src=x onerror="alert(1)"> literal statement'],memories:[],
    sources:[{source_id:sourceId,source_revision:2}],request_hash:'a'.repeat(64)};
  const text = JSON.stringify(value, null, 2);
  const html = renderToStaticMarkup(createElement(SessionEventBody,{kind:'assistant_completed',text}));
  assert.match(html,/Supported by approved memories/);
  assert.match(html,/&lt;img/);
  assert.doesNotMatch(html,/<img|dangerouslySetInnerHTML/);
  assert.ok(html.includes(`title="${sourceId}"`));
  assert.match(html,/r2/);
  assert.match(html,/<details class="mem-recorded-response">/);
  assert.match(html,/Recorded response/);
  assert.ok(html.includes('&quot;request_hash&quot;'));
});

test('unknown, malformed and user-authored response formats are never reduced to statements', () => {
  const base = {dispatch_id:'dsp_00000000-0000-4000-8000-000000000002',status:'supported_evidence',statements:['fixture'],memories:[],sources:[],request_hash:'a'.repeat(64)};
  const context = { sessionId: 'ses_synthetic', branchId: 'br_synthetic', disabled: false, inspect() {}, request: async () => { throw new Error('Unexpected render read'); } };
  const inputs = ['ordinary assistant text','{broken','null','[]',JSON.stringify({...base,status:'constructor'}),
    JSON.stringify({...base,status:'future_provider_status'}),JSON.stringify({...base,statements:[{}]}),
    JSON.stringify({...base,sources:[{source_id:'source',source_revision:null}]}),JSON.stringify({...base,request_hash:'bad'})];
  for (const text of inputs) {
    const html = renderToStaticMarkup(createElement(SessionEventBody,{kind:'assistant_completed',text,context}));
    assert.match(html,/<pre class="mem-source">/);
    assert.doesNotMatch(html,/mem-response-status|<details|Read saved answer context/);
  }
  const user = renderToStaticMarkup(createElement(SessionEventBody,{kind:'user_message',text:JSON.stringify(base),context}));
  assert.match(user,/<p class="mem-content">/);
  assert.doesNotMatch(user,/mem-response-status|<details|Read saved answer context/);
});

test('recognized saved Mock context lookup waits for an explicit gesture and parent ownership', () => {
  const text = JSON.stringify({ dispatch_id: 'dsp_synthetic', status: 'no_supported_evidence', statements: ['Saved answer'], memories: [], sources: [], request_hash: 'a'.repeat(64) });
  const context = { sessionId: 'ses_synthetic', branchId: 'br_synthetic', disabled: true, inspect() { throw new Error('Unexpected render navigation'); }, request: async () => { throw new Error('Unexpected render read'); } };
  const html = renderToStaticMarkup(createElement(SessionEventBody, { kind: 'assistant_completed', text, context }));
  assert.match(html, /disabled=""[^>]*>Read saved answer context/);
  assert.doesNotMatch(html, /Inspect saved answer context|Reading this answer/);
  assert.match(html, /Saved answer/);
});

test('the external provider panel reads its setup before offering any action', () => {
  const html = renderToStaticMarkup(createElement(ExternalPanel, {
    branch: { sessionId: 'ses_00000000-0000-4000-8000-000000000001', branchId: 'br_00000000-0000-4000-8000-000000000002' },
    text: 'Synthetic question', invocations: [], onChanged: async () => {}, consumeText() {},
  }));
  assert.match(html, /Reading provider setup/);
  assert.doesNotMatch(html, /<button/);
});

test('workspace calls stay unknown until a Core list has been read', () => {
  const html = renderToStaticMarkup(createElement(WorkspaceProviderCalls));
  assert.match(html, /Workspace model calls/);
  assert.match(html, /have not been read yet/);
  assert.doesNotMatch(html, /No model calls|Stop locally|Reply saved/);
});

test('saved Provider failure reasons render from structured codes while unknown data stays private', () => {
  const html = renderToStaticMarkup(createElement(ExternalPanel, {
    branch: { sessionId: 'synthetic-session', branchId: 'synthetic-branch' }, text: '',
    invocations: [{ dispatch_id: 'synthetic-failed', state: 'failed', error_code: 'storage_failed', reserved_tokens: 128 },
      { dispatch_id: 'synthetic-unknown', state: 'constructor', error_code: 'private unstructured failure', reserved_tokens: 128 }],
    onChanged: async () => {}, consumeText() {},
  }));
  assert.match(html, /Recorded error: .*Storage failed/);
  assert.match(html, /Saved outcome unavailable/);
  assert.match(html, /Saved error unavailable/);
  assert.match(html, /title="synthetic-failed"/);
  assert.doesNotMatch(html, /private unstructured failure|function Object|Retry|Send once/);
});

test('source suggestions read the provider setup before offering any request', () => {
  const html = renderToStaticMarkup(createElement(ExtractionPanel, {
    range: { sourceId: 'src_00000000-0000-4000-8000-000000000007', revision: 1, start: 0, end: 120 }, onClose() {},
  }));
  assert.match(html, /Reading provider setup/);
  assert.doesNotMatch(html, /<button/);
});

test('saved event metadata labels the record and preserves its exact timestamp independently from its body', () => {
  const html = renderToStaticMarkup(createElement(SessionEventMetadata, { kind: 'assistant_completed', deliveryState: 'completed', occurredAt: '2026-10-15T00:00:01+08:00' }));
  assert.match(html, /Assistant response/);
  assert.match(html, /complete/);
  assert.match(html, /<time dateTime="2026-10-15T00:00:01\+08:00" title="2026-10-15T00:00:01\+08:00">/);
  assert.doesNotMatch(html, /assistant_completed|not_applicable|time unavailable/);
});

test('unknown event metadata uses fixed labels without rendering private or inherited values', () => {
  for (const occurredAt of [undefined, null, {}, 'private invalid timestamp', '2026-10-15 (private info)']) {
    const html = renderToStaticMarkup(createElement(SessionEventMetadata, { kind: 'constructor', deliveryState: 'private delivery error', occurredAt }));
    assert.match(html, /Recorded event/);
    assert.match(html, /delivery unavailable/);
    assert.match(html, /time unavailable/);
    assert.doesNotMatch(html, /constructor|private|function Object|<time/);
  }
});
