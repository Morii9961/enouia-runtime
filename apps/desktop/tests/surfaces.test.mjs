// Render actual demo and connected React views through Vite's TSX loader.
// Rendering only: no DOM interactions, native IPC or personal Vault is used.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createServer } from 'vite';
import { approveDemoCandidate, reviseDemoMemory } from '../src/demo-state.ts';
import { overview as activityOverview } from './activity-fixtures.mjs';

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
const { SessionEventBody } = await server.ssrLoadModule('/src/memory/SessionEventBody.tsx');
const { MemoryStatusProvider, VaultLifecycleFeedback, vaultLabel } = await server.ssrLoadModule('/src/memory/status.tsx');
const { Context: ConnectedContext } = await server.ssrLoadModule('/src/memory/ContextSurface.tsx');
const { default: ActivitySurface, Gate: ActivityGate, StatusCards, RecordedDays, RunStatusCard } = await server.ssrLoadModule('/src/activity/ActivitySurface.tsx');
const at = '2026-10-05T02:00:00.000Z';
const appAt = (page, state = {}) => {
  const app = new App({ startPage: page, memoryConnected: false, breathing: false });
  app.state = { ...app.state, ...state };
  return app;
};

test('native Activity waiting and connection gate retain a labelled keyboard surface', () => {
  for (const node of [createElement(ActivitySurface), createElement(ActivityGate, { setup: { configured: false }, onSelect() {}, error: null })]) {
    const html = renderToStaticMarkup(node);
    assert.match(html, /data-screen-label="Activity"/);
    assert.match(html, /<h1/);
    assert.doesNotMatch(html, /install-activity\.ps1|install\.json|Fictional/);
  }
});

test('Activity distinguishes a connected but unsaved package choice', () => {
  const html=renderToStaticMarkup(createElement(ActivityGate,{setup:{configured:true,mode:'sandbox',folder:'package',taskName:'Enouia-Activity-Test',saved:false},onSelect(){},error:null}));
  assert.match(html,/Package connected for this window/);
  assert.match(html,/select it again after restarting/);
  assert.doesNotMatch(html,/Retry forgetting package/);
});

test('Activity failed forgetting has a named retry while successful choices stay quiet', () => {
  const props={onSelect(){},onClear(){},error:null};
  const html=renderToStaticMarkup(createElement(ActivityGate,{...props,setup:{configured:false,saved:false},busy:true}));
  assert.match(html,/The saved package choice could not be cleared/);
  assert.match(html,/disabled=""[^>]*>Retry forgetting package/);
  for(const setup of [{configured:false},{configured:false,saved:true}]) {
    assert.doesNotMatch(renderToStaticMarkup(createElement(ActivityGate,{...props,setup})),/Retry forgetting package|could not be cleared|window only/);
  }
});

test('recorded Activity days keep a compact default and an accessible full-history control', () => {
  const days = Array.from({ length: 16 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, value: i === 15 ? 0 : i }));
  const html = renderToStaticMarkup(createElement(RecordedDays, { id: 'github', days, total: 16 }));
  assert.equal((html.match(/scope="row"/g) ?? []).length, 14);
  assert.match(html, /Show all recorded days/);
  assert.match(html, /aria-expanded="false" aria-controls="act-days-github"/);
  assert.match(html, /GitHub daily contributions/);
  assert.match(html, /2026-10-16<\/time><\/th><td>0/);
  assert.doesNotMatch(html, /2026-10-01/);
  const short = renderToStaticMarkup(createElement(RecordedDays, { id: 'claude', days: days.slice(-2), total: 2 }));
  assert.equal((short.match(/scope="row"/g) ?? []).length, 2);
  assert.doesNotMatch(short, /Show all recorded days/);
  assert.match(short, /Claude Code daily tokens/);
});

test('an unobserved scheduler never invents a next trigger or registration', () => {
  const overview = activityOverview();
  const html = renderToStaticMarkup(createElement(StatusCards, { overview, folder: 'synthetic' }));
  assert.match(html, /Not registered/);
  assert.match(html, /Next trigger<\/dt><dd>Not observed/);
  assert.doesNotMatch(html, /Hourly while logged in/);
  overview.schedule.task = { registered: true, enabled: null };
  overview.delivery.publicHash = 'a'.repeat(64);
  const unknown = renderToStaticMarkup(createElement(StatusCards, { overview, folder: 'synthetic' }));
  assert.match(unknown, /enablement unknown/);
  assert.match(unknown, /observation time not recorded/);
});

test('Activity date-only observations do not invent local clock times', () => {
  const overview = activityOverview();
  overview.schedule.nextTriggerAt = '2026-10-12';
  overview.delivery.lastTransportAt = '2026-10-07';
  overview.delivery.publicationObservedAt = '2026-10-08';
  overview.delivery.publicHash = 'a'.repeat(64);
  overview.pending = { sequence: 1, createdAt: '2026-10-06', ageSeconds: 0, exactSha256: 'b'.repeat(64), failureCount: 0, nextEligibleAt: '2026-10-09', lastErrorCode: null };
  const html = renderToStaticMarkup(createElement(StatusCards, { overview, folder: 'synthetic' }));
  assert.match(html, /Next trigger<\/dt><dd>2026-10-12<\/dd>/);
  assert.match(html, /Last transport<\/dt><dd>2026-10-07<\/dd>/);
  assert.match(html, /Published<\/dt><dd>2026-10-08 · /);
  assert.match(html, /Next retry<\/dt><dd>2026-10-09<\/dd>/);
  assert.doesNotMatch(html, /2026-10-\d{2} \d{2}:\d{2}/);
  overview.schedule.nextTriggerAt = '2026-10-12T01:23:00Z';
  const instant = renderToStaticMarkup(createElement(StatusCards, { overview, folder: 'synthetic' }));
  assert.match(instant, /Next trigger<\/dt><dd>\d{4}-\d{2}-\d{2} \d{2}:\d{2}<\/dd>/);
});

test('unknown Activity outcome text stays private and prototype names get a stable fallback', () => {
  for(const state of ['C:/SYNTHETIC_PRIVATE/config.json','future_outcome','constructor','toString']) {
    const run={schemaVersion:1,kind:'activity_run_status',runId:'run-1',stage:'completed',error:null,summary:{state}};
    const html=renderToStaticMarkup(createElement(RunStatusCard,{run}));
    assert.match(html,/Run outcome unavailable/);
    assert.doesNotMatch(html,/SYNTHETIC_PRIVATE|future_outcome/);
  }
});

test('Activity outcome counts represent only whole failures among the three sources', () => {
  for(const sourceFailures of [1.5,4,9007199254740992,-1,0]) {
    const run={schemaVersion:1,kind:'activity_run_status',runId:'run-1',stage:'completed',error:null,summary:{state:'delivery_disabled',sourceFailures}};
    const html=renderToStaticMarkup(createElement(RunStatusCard,{run}));
    assert.match(html,/New batch kept locally/);
    assert.doesNotMatch(html,/source\(s\) failed/);
  }
  for(const sourceFailures of [1,2,3]) {
    const run={schemaVersion:1,kind:'activity_run_status',runId:'run-1',stage:'completed',error:null,summary:{state:'delivery_unresolved',sourceFailures}};
    assert.match(renderToStaticMarkup(createElement(RunStatusCard,{run})),new RegExp(`${sourceFailures} source\\(s\\) failed`));
  }
});

test('all seven demo surfaces render exactly one screen and disclose demo mode', () => {
  const screens = { home: 'Home', memory: 'Memory Vault', context: 'Context Surface',
    sessions: 'Sessions', activity: 'Activity', runtime: 'Runtime Inspector', settings: 'Settings' };
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
  const inputs = ['ordinary assistant text','{broken','null','[]',JSON.stringify({...base,status:'constructor'}),
    JSON.stringify({...base,status:'future_provider_status'}),JSON.stringify({...base,statements:[{}]}),
    JSON.stringify({...base,sources:[{source_id:'source',source_revision:null}]}),JSON.stringify({...base,request_hash:'bad'})];
  for (const text of inputs) {
    const html = renderToStaticMarkup(createElement(SessionEventBody,{kind:'assistant_completed',text}));
    assert.match(html,/<pre class="mem-source">/);
    assert.doesNotMatch(html,/mem-response-status|<details/);
  }
  const user = renderToStaticMarkup(createElement(SessionEventBody,{kind:'user_message',text:JSON.stringify(base)}));
  assert.match(user,/<p class="mem-content">/);
  assert.doesNotMatch(user,/mem-response-status|<details/);
});
