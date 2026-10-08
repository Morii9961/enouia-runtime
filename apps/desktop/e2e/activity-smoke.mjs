// Real-app check of Runtime's Activity surface (ADR-028) on a synthetic
// installed package from scripts/prepare-activity-surface-sandbox.mjs.
//
// Starts the built desktop shell with WebView2 remote debugging on a loopback
// port, drives the real page over the Chrome DevTools Protocol (real Tauri
// IPC, real adapter, real installed runner), fills the native folder dialog
// through UI Automation, and writes screenshots plus report.json.
//
//   node apps/desktop/e2e/activity-smoke.mjs <absolute exe> <package-root> <out-dir>
//
// The package must be freshly prepared: the run pauses, resumes, runs and
// retries it, and ends one run by terminating the shell. The shell's saved
// package choice is kept under the test output via --activity-settings.
// This harness registers no task and collects no account. Its task-read modes
// use the independently owned, delivery-disabled package created by
// scripts/test-activity-package.ps1 -LiveScheduler -NativeDesktop <exe>.
// Default/keyboard fixtures publish only over 127.0.0.1. Synthetic data only.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { createServer } from 'node:net';

const [exe, pkg, out, mode] = process.argv.slice(2);
const taskMode = ['--task-disabled', '--task-enabled'].includes(mode);
if (!out || !isAbsolute(out) || !isAbsolute(exe) || !isAbsolute(pkg) || (mode && !['--keyboard', '--task-disabled', '--task-enabled'].includes(mode)) || process.argv.length > 6) {
  throw new Error('usage: activity-smoke.mjs <absolute exe> <package-root> <out-dir> [--keyboard|--task-disabled|--task-enabled]');
}
mkdirSync(out, { recursive: true });
const manifest = JSON.parse(readFileSync(join(pkg, 'install.json'), 'utf8'));
if (taskMode) {
  const parent = dirname(pkg);
  const config = JSON.parse(readFileSync(join(pkg, 'activity-config.json'), 'utf8'));
  if (manifest.mode !== 'sandbox' || !/^Enouia-Activity-Test-[a-f0-9]{32}$/.test(manifest.taskName) ||
      basename(pkg) !== 'installed & independent' || !/^scheduler-test-[a-f0-9]{32}$/.test(basename(parent)) ||
      realpathSync(dirname(parent)).toLowerCase() !== realpathSync(resolve(import.meta.dirname, '../../../target')).toLowerCase() ||
      config.mode !== 'sandbox' || config.deliveryEnabled === true ||
      Object.keys(config).some(key => !['version', 'mode', 'dataRoot', 'deliveryEnabled'].includes(key)) ||
      realpathSync(config.dataRoot).toLowerCase() !== realpathSync(join(parent, 'state')).toLowerCase()) {
    throw new Error('Task reads require the unique delivery-disabled scheduler-test package.');
  }
} else if (manifest.mode !== 'sandbox' || !basename(dirname(pkg)).startsWith('enouia-handback-ui-')) {
  throw new Error('Only a prepared synthetic package is allowed');
}
const listener = createServer();
await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
const PORT = listener.address().port;
await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
const report = { checks: [], screenshots: [] };
const children = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (id, ok, detail = '') => {
  report.checks.push({ id, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${detail}`);
};
const settings = join(out, 'activity-install.json');
let currentApp;

function launch() {
  const child = spawn(exe, ['--activity-settings', settings], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT} --remote-debugging-address=127.0.0.1`,
      WEBVIEW2_USER_DATA_FOLDER: join(out, 'webview2'),
    },
    stdio: 'ignore',
  });
  children.add(child);
  currentApp = child;
  child.exited = new Promise((r) => child.once('exit', (code) => { children.delete(child); r(code); }));
  return child;
}

function session(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  let opened;
  const ready = new Promise((r) => (opened = r));
  ws.onopen = () => opened();
  ws.onclose = () => { opened(); for (const reply of pending.values()) reply({ result: { exceptionDetails: { exception: { description: 'closed' } } } }); pending.clear(); };
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
  const send = async (method, params = {}) => {
    await ready;
    if (ws.readyState !== WebSocket.OPEN) return { result: { exceptionDetails: { exception: { description: 'closed' } } } };
    const n = ++id;
    ws.send(JSON.stringify({ id: n, method, params }));
    return new Promise((r) => pending.set(n, r));
  };
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed');
    return r.result?.result?.value;
  };
  return { send, evaluate, close: () => ws.close() };
}

async function connect() {
  for (let i = 0; i < 160; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      assertDebugOwner();
      for (const page of targets.filter((t) => t.type === 'page' && t.url.startsWith('http://tauri.localhost/') && !t.url.includes('view=overlay'))) {
        const s = session(page.webSocketDebuggerUrl);
        await waitFor(s, "document.readyState === 'complete' && !!document.querySelector('#root > *')", 'page');
        if ((await s.evaluate('window.__TAURI_INTERNALS__.metadata.currentWindow.label')) === 'main') return s;
        s.close();
      }
    } catch (error) {
      if (error.message === 'foreign debug listener' || error.message === 'test host stopped') throw error;
    }
    await sleep(250);
  }
  throw new Error('no main page');
}

async function waitFor(s, expression, label, ms = 30000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try { if (await s.evaluate(expression)) return true; } catch { /* busy */ }
    await sleep(150);
  }
  const text = await s.evaluate('document.body.innerText.slice(-500)').catch(() => '');
  throw new Error(`timeout: ${label} | ${String(text).replace(/\s+/g, ' ')}`);
}

async function shot(s, name) {
  const r = await s.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(join(out, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  report.screenshots.push(`${name}.png`);
}

const has = (text) => `document.body.innerText.includes(${JSON.stringify(text)})`;
const call = (s, request) => s.evaluate(`window.__TAURI_INTERNALS__.invoke('activity_call', { request: ${JSON.stringify(request)} })`);
const memoryCall = (s, command, args = {}, write = false) => s.evaluate(`window.__TAURI_INTERNALS__.invoke('memory_call', {request:{schemaVersion:1,requestId:'req_'+crypto.randomUUID(),command:${JSON.stringify(command)},idempotencyKey:${write ? "'ui-'+crypto.randomUUID()" : 'null'},arguments:${JSON.stringify(args)}}})`);
const press = (s, text) => s.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === ${JSON.stringify(text)}); if (!b || b.disabled) throw new Error('unavailable ${text}'); b.click(); return true; })()`);
const disabled = (s, text) => s.evaluate(`[...document.querySelectorAll('button')].find((e) => e.textContent.trim() === ${JSON.stringify(text)})?.disabled === true`);

function powershell(script) {
  return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function assertDebugOwner() {
  if (!currentApp || currentApp.exitCode !== null) throw new Error('test host stopped');
  try {
    powershell(`$ErrorActionPreference='Stop'
$listeners=@(Get-NetTCPConnection -State Listen -LocalPort ${PORT})
if($listeners.Count -ne 1){throw 'listener count'}
$ancestor=[uint32]$listeners[0].OwningProcess
for($depth=0;$depth -lt 16 -and $ancestor -ne 0;$depth++){
  if($ancestor -eq ${currentApp.pid}){Write-Output 'owned';exit 0}
  $entry=Get-CimInstance Win32_Process -Filter ("ProcessId = " + $ancestor)
  if(-not $entry){break};$ancestor=[uint32]$entry.ParentProcessId
}
throw 'foreign'`);
  } catch { throw new Error('foreign debug listener'); }
}

// Fill this process's native folder dialog: path into the name edit
// (WM_SETTEXT), then its default button (BM_CLICK). Nothing else is touched.
function fillDialog(pid, path) {
  powershell(`Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A = [System.Windows.Automation.AutomationElement]
$C = [System.Windows.Automation.PropertyCondition]
$dialog = $null
for ($i = 0; $i -lt 80 -and -not $dialog; $i++) {
  foreach ($w in $A::RootElement.FindAll([System.Windows.Automation.TreeScope]::Descendants, (New-Object $C($A::ClassNameProperty, '#32770')))) { if ($w.Current.ProcessId -eq ${pid}) { $dialog = $w } }
  if (-not $dialog) { Start-Sleep -Milliseconds 250 }
}
if (-not $dialog) { throw 'no dialog' }
Add-Type -Namespace E2E -Name User32 -MemberDefinition '[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern System.IntPtr SendMessage(System.IntPtr h, uint m, System.IntPtr w, string l);'
$all = $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
$edit = $all | Where-Object { $_.Current.ClassName -eq 'Edit' -and ($_.Current.AutomationId -eq '1148' -or $_.Current.AutomationId -eq '1152') } | Select-Object -First 1
$open = $all | Where-Object { $_.Current.ClassName -eq 'Button' -and $_.Current.AutomationId -eq '1' } | Select-Object -First 1
if (-not $edit -or -not $open) { throw 'dialog controls not found' }
[E2E.User32]::SendMessage([System.IntPtr]$edit.Current.NativeWindowHandle, 0x000C, [System.IntPtr]::Zero, '${path.replace(/'/g, "''")}') | Out-Null
[E2E.User32]::SendMessage([System.IntPtr]$open.Current.NativeWindowHandle, 0x00F5, [System.IntPtr]::Zero, $null) | Out-Null`);
}

// The installed runner itself, outside the shell.
function runner(command) {
  const result = spawnSyncJson(join(pkg, 'enouia-activity.exe'), [command, '--config', join(pkg, 'activity-config.json')]);
  return result;
}
function spawnSyncJson(file, args) {
  try {
    return { code: 0, value: JSON.parse(execFileSync(file, args, { encoding: 'utf8', windowsHide: true })) };
  } catch (err) {
    return { code: err.status, value: err.stdout ? JSON.parse(err.stdout) : null };
  }
}

async function overview(s) {
  return call(s, { operation: 'activity_get_overview' });
}

// WebView-scoped key events exercise native browser Tab/Enter behavior; page
// focus and controls are never set or clicked through DOM calls in this mode.
// The Windows folder dialog is still filled with the PID-bound helper above.
async function key(s, name, modifiers = 0) {
  // connect() verified the listener's process ancestry. This WebSocket stays
  // bound to that WebView; no operating-system input is sent to other apps.
  if (!currentApp || currentApp.exitCode !== null) throw new Error('test host stopped');
  const codes = { Tab: 9, Enter: 13, '5': 53 };
  const event = { key: name, code: name === '5' ? 'Digit5' : name, windowsVirtualKeyCode: codes[name], modifiers };
  // Chromium synthesizes Enter's character/default activation from text.
  // Pattern: https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/chromium/crInput.ts
  const text = name === 'Enter' ? '\r' : '';
  await s.send('Input.dispatchKeyEvent', { ...event, type: text ? 'keyDown' : 'rawKeyDown', text, unmodifiedText: text });
  await s.send('Input.dispatchKeyEvent', { ...event, type: 'keyUp' });
}

async function tabTo(s, selector, label) {
  for (let i = 0; i < 50; i++) {
    if (await s.evaluate(`document.activeElement?.matches(${JSON.stringify(selector)}) && document.activeElement.textContent.trim().startsWith(${JSON.stringify(label)})`)) return;
    await key(s, 'Tab');
  }
  throw new Error(`not keyboard reachable: ${label}`);
}

async function activate(s, label, selector = 'button') {
  await tabTo(s, selector, label);
  await key(s, 'Enter');
}

async function taskReadMain(enabled) {
  rmSync(settings, { force: true });
  const app = launch();
  const s = await connect();
  await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
  await waitFor(s, has('Connect the installed Activity producer'), 'task-read gate');
  await press(s, 'Choose installed package…');
  fillDialog(app.pid, pkg);
  await waitFor(s, "document.querySelectorAll('.act-source').length === 3", 'task-read connection');
  check('S.synthetic_package_connects', true);
  const o = await overview(s);
  const preview = await call(s, { operation: 'activity_preview_public_payload' });
  check('S.actual_task_is_registered', o.schedule.task?.registered === true);
  check('S.actual_task_enablement', o.schedule.task?.enabled === enabled);
  check('S.scheduler_health_matches_task', o.health.some(h => h.id === 'activity_scheduler' && h.state === (enabled ? 'healthy' : 'degraded')));
  check('S.actual_state_reaches_page', await s.evaluate(has(`Registered · ${enabled ? 'enabled' : 'disabled'}`)));
  check('S.producer_pause_is_separate', o.producer.paused === true && await disabled(s, 'Run now'));
  check('S.unobserved_next_trigger_stays_null', o.schedule.nextTriggerAt === null && await s.evaluate(has('Not observed')));
  const refused = await Promise.all(['activity_enable_task', 'activity_disable_task'].map(operation => call(s, { operation })));
  check('S.scheduler_control_requests_are_refused', refused.every(r => r.kind === 'activity_error' && r.error.code === 'contract_invalid'));
  const after = await overview(s);
  const afterPreview = await call(s, { operation: 'activity_preview_public_payload' });
  check('S.reads_keep_archive_and_task_unchanged', after.schedule.task?.registered === true && after.schedule.task?.enabled === enabled && preview.sha256 === afterPreview.sha256);
  check('S.package_paths_stay_private', !(await s.evaluate(`document.body.innerText.includes(${JSON.stringify(pkg)})`)));
  await shot(s, enabled ? '01-task-enabled' : '01-task-disabled');
  s.close();
  app.kill();
  await app.exited;
}

async function keyboardMain() {
  rmSync(settings, { force: true });
  const app = launch();
  const s = await connect();
  await key(s, '5', 2); // Ctrl+5 is the shell's Activity shortcut.
  await waitFor(s, has('Connect the installed Activity producer'), 'keyboard gate');
  check('K.shortcut_opens_activity', true);
  await activate(s, 'Skip to current surface', 'a');
  check('K.skip_link_focuses_surface', await s.evaluate("document.activeElement.id === 'runtime-content'"));
  await activate(s, 'Choose installed package…');
  fillDialog(app.pid, pkg);
  await waitFor(s, has('Publication observed'), 'keyboard package selection');
  check('K.enter_opens_package_picker', runner('overview').value.delivery.state === 'observed');
  await activate(s, 'Recent recorded days', '.act-table > summary');
  check('K.recorded_days_expand', await s.evaluate("[...document.querySelectorAll('.act-table')].some(d => d.open && d.querySelectorAll('tbody tr').length > 0)"));
  await activate(s, 'Public payload preview', '.act-payload > summary');
  await waitFor(s, "document.querySelector('.act-payload')?.open && !!document.querySelector('.act-payload pre')", 'keyboard preview');
  check('K.public_preview_expands', true);
  await activate(s, 'Pause activity sync');
  await waitFor(s, "[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Resume activity sync')", 'keyboard pause');
  check('K.pause_is_durable', runner('overview').value.producer.paused === true && await disabled(s, 'Run now'));
  await activate(s, 'Resume activity sync');
  await waitFor(s, "[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Pause activity sync')", 'keyboard resume');
  check('K.resume_is_durable', runner('overview').value.producer.paused === false);
  await activate(s, 'Run now');
  await waitFor(s, has('Batch kept pending'), 'keyboard run', 60000);
  const pending = runner('overview').value.pending;
  check('K.run_keeps_pending', pending?.sequence === 88 && pending.failureCount === 1);
  await activate(s, 'Retry pending');
  await waitFor(s, "[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Retry pending' && !b.disabled)", 'keyboard retry', 60000);
  const retried = runner('overview').value.pending;
  check('K.retry_keeps_exact_batch', retried.sequence === 88 && retried.exactSha256 === pending.exactSha256 && retried.failureCount > pending.failureCount);
  await activate(s, 'Refresh');
  await waitFor(s, has('#88'), 'keyboard refresh');
  check('K.refresh_keeps_retained_history', await s.evaluate(has('Last attempt failed · history retained')));
  await shot(s, '01-keyboard-pending');
  await activate(s, 'Change package');
  await waitFor(s, has('Connect the installed Activity producer'), 'keyboard clear');
  check('K.change_package_forgets_choice', !existsSync(settings));
  s.close();
  app.kill();
  await app.exited;
}

async function main() {
  rmSync(settings, { force: true });
  let app = launch();
  let s = await connect();
  await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
  await waitFor(s, has('Connect the installed Activity producer'), 'gate');
  check('A.gate_without_package', true);
  const unconfigured = await overview(s);
  check('A.unconfigured_is_structured', unconfigured.kind === 'activity_error' && unconfigured.error.code === 'unconfigured');

  await press(s, 'Choose installed package…');
  fillDialog(app.pid, pkg);
  await waitFor(s, has('Publication observed'), 'connected overview');
  check('B.picker_connects_package', await s.evaluate(`${has('sequence 87')} && ${has('Activity & Usage')}`));
  check('B.no_path_reaches_page', !(await s.evaluate(`document.body.innerText.includes(${JSON.stringify(pkg)})`)));
  check('B.choice_saved_by_shell', JSON.parse(readFileSync(settings, 'utf8')).installRoot.toLowerCase().endsWith('package'));
  check('B.three_fresh_sources', await s.evaluate("[...document.querySelectorAll('.act-source .mem-tag')].map((e) => e.textContent).join('|') === 'Fresh|Fresh|Fresh'"));
  check('B.heatmaps_drawn', await s.evaluate("document.querySelectorAll('.act-grid .act-known').length > 700"));
  await shot(s, '01-observed');

  const o = await overview(s);
  check('C.overview_kind', o.kind === 'activity_overview' && o.delivery.state === 'observed' && o.pending === null);
  check('C.task_query_failure_stays_unknown', o.schedule.task === null && o.health.some((h) => h.id === 'activity_scheduler' && h.state === 'unavailable'));
  const preview = await call(s, { operation: 'activity_preview_public_payload' });
  check('C.preview_hash_is_published_hash', preview.sha256 === o.delivery.publicHash);
  const days = await call(s, { operation: 'activity_get_days', source: 'codex', from: '2026-10-01', to: '2026-10-06' });
  check('C.days_filtered', days.kind === 'activity_days' && days.days.length === 6 && days.days.every((d) => d.date >= '2026-10-01'));
  const refused = await Promise.all([
    call(s, { operation: 'activity_get_days', source: 'claude_design', from: '2026-01-01', to: '2026-01-02' }),
    call(s, { operation: 'activity_reset_sequence' }),
    call(s, { operation: 'activity_get_overview', path: 'C:\\\\' }),
  ]);
  check('C.invalid_requests_refused', refused.every((r) => r.kind === 'activity_error' && r.error.code === 'contract_invalid'));

  check('C.next_trigger_not_invented', await s.evaluate(`${has('Next trigger')} && ${has('Not observed')} && !${has('Hourly while logged in')}`));
  await s.evaluate("document.querySelector('.runtime-skip-link').click();true");
  check('C.keyboard_surface_skip_entry', await s.evaluate("document.activeElement.id === 'runtime-content'"));

  // Controlled replies exercise latest-read ownership without changing the store.
  const controlledRefresh = (transform) => s.evaluate(`(() => {
    const callbacks=window.__TAURI_INTERNALS__.callbacks;
    const before=new Set(callbacks.keys());
    [...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Refresh').click();
    const added=[...callbacks.keys()].filter(id=>!before.has(id));
    if(added.length!==4)throw new Error('Refresh must register overview and preview callbacks');
    for(const id of added){const original=callbacks.get(id);callbacks.set(id,reply=>{
      if(reply?.kind==='activity_overview'){${transform}}
      else original(reply);
    });}return true;
  })()`);
  await controlledRefresh('window.__releaseActivity=()=>original(reply);');
  await waitFor(s, "typeof window.__releaseActivity === 'function'", 'held Activity read');
  await controlledRefresh("original({schemaVersion:1,kind:'activity_error',error:{code:'storage_failed',component:'activity_archive',retryable:false}});");
  await waitFor(s, has('The Activity store could not be read or written'), 'Activity read failure');
  check('H.failed_read_clears_old_values', await s.evaluate("document.querySelectorAll('.act-source').length===0") && await disabled(s, 'Run now'));
  await s.evaluate('window.__releaseActivity();true');
  await sleep(300);
  check('H.late_read_cannot_restore_old_values', await s.evaluate("document.querySelectorAll('.act-source').length===0"));
  check('H.refresh_remains_available', !(await disabled(s, 'Refresh')));
  await press(s, 'Refresh');
  await waitFor(s, has('Publication observed'), 'read recovery');
  check('H.refresh_recovers', true);

  // Create a synthetic Vault through the real native picker and pinned Core.
  const vault = join(out, 'vault');
  mkdirSync(vault);
  await s.evaluate("window.__activityVaultPick=null;window.__TAURI_INTERNALS__.invoke('memory_pick',{kind:'vault_root'}).then(value=>window.__activityVaultPick=value);true");
  fillDialog(app.pid, vault);
  await waitFor(s, "window.__activityVaultPick?.token", 'synthetic Vault folder picker');
  const pick = await s.evaluate('window.__activityVaultPick');
  const created = await memoryCall(s, 'vault_create', { rootToken: pick.token, confirmPhrase: 'create new vault' });
  check('H.synthetic_memory_vault_opens', created.result?.vault?.state === 'open', created.error?.code ?? '');
  const note = 'Synthetic Activity isolation note remains available in Memory.';
  const remembered = await memoryCall(s, 'remember', { text: note, claimKey: 'synthetic.activity.isolation' }, true);
  check('H.memory_write_before_activity_fault', Boolean(remembered.result?.candidateId), remembered.error?.code ?? '');

  await controlledRefresh('reply.sources.codex=null;original(reply);');
  await waitFor(s, has('The response did not match Activity IPC v1'), 'malformed Activity reply');
  await s.evaluate("document.querySelector('nav button[aria-label=\"Memory\"]').click()");
  await waitFor(s, has('Memory · Vault open'), 'Memory remains available');
  const inbox = await memoryCall(s, 'candidate_list', { cursor: null, limit: 50 });
  check('H.malformed_activity_keeps_memory_available', !inbox.error && JSON.stringify(inbox).includes(note) && !(await s.evaluate(has('This surface could not open'))));
  await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
  await waitFor(s, has('Publication observed'), 'Activity after Memory');

  await press(s, 'Pause activity sync');
  await waitFor(s, "[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Resume activity sync')", 'paused');
  check('D.pause_is_durable_runner_state', runner('overview').value.producer.paused === true && await disabled(s, 'Run now'));
  await press(s, 'Resume activity sync');
  await waitFor(s, "[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Pause activity sync')", 'resumed');
  check('D.resume', runner('overview').value.producer.paused === false);

  // No collector is configured and the SSH stand-in refuses outside its
  // harness, so the run must commit a failed-source batch and keep it pending.
  await press(s, 'Run now');
  await waitFor(s, has('Batch kept pending'), 'run ended', 60000);
  await waitFor(s, has('#88'), 'pending shown');
  const after = await overview(s);
  check('E.run_now_commits_and_keeps_pending', after.pending?.sequence === 88 && after.pending.failureCount === 1 && after.producer.highestReserved === 88);
  check('E.failed_sources_keep_history', ['github', 'codex', 'claude'].every((id) => after.sources[id].freshness === 'failed' && after.sources[id].total === o.sources[id].total && after.sources[id].lastSuccessAt === o.sources[id].lastSuccessAt));
  check('E.ui_states_retained_history', await s.evaluate(has('Last attempt failed · history retained')));
  await shot(s, '02-pending');

  // Terminate the shell while a retry runs; the runner and its lock decide.
  const before = runner('overview').value.pending.exactSha256;
  await press(s, 'Retry pending');
  s.close();
  app.kill();
  await app.exited;
  await sleep(4000);
  const survived = runner('overview');
  check('F.ui_kill_leaves_valid_store', survived.code === 0 && survived.value.pending.sequence === 88 && survived.value.pending.exactSha256 === before);

  app = launch();
  s = await connect();
  await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
  await waitFor(s, has('#88'), 'pending after restart');
  check('F.restart_reads_same_pending', true);
  await s.evaluate("[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Change package').click()");
  await waitFor(s, has('Connect the installed Activity producer'), 'cleared');
  check('G.change_package_forgets_choice', !existsSync(settings));
  s.close();
  app.kill();
  await app.exited;
}

try {
  if (taskMode) await taskReadMain(mode === '--task-enabled');
  else if (mode === '--keyboard') await keyboardMain();
  else await main();
} catch (err) {
  check('run', false, String(err.message ?? err));
} finally {
  for (const child of children) child.kill();
  rmSync(settings, { force: true });
  const passed = report.checks.filter((c) => c.ok).length;
  report.summary = `${passed}/${report.checks.length}`;
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`checks ${report.summary}`);
  process.exitCode = passed === report.checks.length ? 0 : 1;
}
