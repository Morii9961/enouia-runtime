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
// Default and index modes create a synthetic Vault: their output must be
// outside any Git working tree. Other modes do not create a Vault.
// This harness registers no task and collects no account. Its task-read modes
// use the independently owned, delivery-disabled package created by
// scripts/test-activity-package.ps1 -LiveScheduler -NativeDesktop <exe>.
// Default/keyboard fixtures publish only over 127.0.0.1. Synthetic data only.
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { createServer } from 'node:net';

const [exe, pkg, out, mode] = process.argv.slice(2);
const taskMode = ['--task-disabled', '--task-enabled'].includes(mode);
const overlapMode = ['--rebuild-overlap', '--rebuild-cancel', '--rebuild-partial', '--rebuild-mutations'].includes(mode);
const indexMode = ['--index-isolation', '--missing-index', '--malformed-index', '--current-read-lock', '--current-acl-denial', '--generation-manifest-denial', '--current-switch-lock', '--run-switch-lock', '--repeat-pause', '--generation-write-denial', '--pointer-create-denial', '--locked-index', '--rebuild-overlap', '--rebuild-cancel', '--rebuild-partial', '--rebuild-mutations'].includes(mode);
if (!out || !isAbsolute(out) || !isAbsolute(exe) || !isAbsolute(pkg) || (mode && !['--keyboard', '--full-days', '--read-contract', '--export-contract', '--run-contract', '--run-outcome', '--setup-contract', '--choice-save', '--choice-persistence', '--choice-delete', '--choice-clear-remount', '--choice-select-recovery', '--run-history', '--run-admission', '--runner-hash-change', '--runner-missing', '--runner-missing-restart', '--run-remount', '--setup-running', '--setup-dialog-race', '--saved-choice-boundary', '--saved-choice-read-lock', '--saved-choice-write-lock', '--saved-choice-replace-lock', '--manifest-boundary', '--pipe-deadline', '--copy-lifecycle', '--error-ownership', '--sequence-contract', '--date-only', '--future-age', '--clear-denial', '--window-scope', '--run-polling', '--poll-lifecycle', '--confirmation', '--index-isolation', '--missing-index', '--malformed-index', '--current-read-lock', '--current-acl-denial', '--generation-manifest-denial', '--current-switch-lock', '--run-switch-lock', '--repeat-pause', '--generation-write-denial', '--pointer-create-denial', '--locked-index', '--rebuild-overlap', '--rebuild-cancel', '--rebuild-partial', '--rebuild-mutations', '--task-disabled', '--task-enabled'].includes(mode)) || process.argv.length > 6) {
  throw new Error('usage: activity-smoke.mjs <absolute exe> <package-root> <out-dir> [--keyboard|--full-days|--read-contract|--export-contract|--run-contract|--run-outcome|--setup-contract|--choice-save|--choice-persistence|--choice-delete|--choice-clear-remount|--choice-select-recovery|--run-history|--run-admission|--runner-hash-change|--runner-missing|--runner-missing-restart|--run-remount|--setup-running|--setup-dialog-race|--saved-choice-boundary|--saved-choice-read-lock|--saved-choice-write-lock|--saved-choice-replace-lock|--manifest-boundary|--pipe-deadline|--copy-lifecycle|--error-ownership|--sequence-contract|--date-only|--future-age|--clear-denial|--run-polling|--poll-lifecycle|--confirmation|--index-isolation|--missing-index|--malformed-index|--current-read-lock|--current-acl-denial|--generation-manifest-denial|--current-switch-lock|--run-switch-lock|--repeat-pause|--generation-write-denial|--pointer-create-denial|--locked-index|--rebuild-overlap|--rebuild-cancel|--rebuild-partial|--rebuild-mutations|--task-disabled|--task-enabled]');
}
if (!mode || indexMode) {
  for (let ancestor = out; ; ancestor = dirname(ancestor)) {
    if (existsSync(join(ancestor, '.git'))) throw new Error('Default Activity smoke output must be outside any Git working tree for its synthetic Vault.');
    if (dirname(ancestor) === ancestor) break;
  }
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
let settingsDirectoryFixture = false;

function removeEmptySettingsFixture() {
  if (!settingsDirectoryFixture) throw Error('Settings directory is not an owned fixture');
  if(realpathSync(settings)!==join(realpathSync(out),'activity-install.json')||readdirSync(settings).length!==0)throw Error('Settings fixture must be contained and empty');
  rmdirSync(settings);settingsDirectoryFixture=false;
}

function launch(extra = []) {
  const child = spawn(exe, ['--activity-settings', settings, ...extra], {
    ... (mode==='--saved-choice-boundary'?{cwd:dirname(pkg)}:{}),
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT} --remote-debugging-address=127.0.0.1`,
      WEBVIEW2_USER_DATA_FOLDER: join(out, 'webview2'),
      ...(['--run-remount','--setup-running','--setup-dialog-race'].includes(mode)?{ENOU_TEST_ROOT:dirname(pkg),ENOU_TEST_CAPTURES:join(dirname(pkg),'captures'),ENOU_TEST_DESCENDANT:join(dirname(pkg),'tools','descendant.exe'),ENOU_TEST_LINGER:'ssh'}:{}),
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

async function connect(overlay = false) {
  for (let i = 0; i < 160; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      assertDebugOwner();
      for (const page of targets.filter((t) => t.type === 'page' && t.url.startsWith('http://tauri.localhost/') && t.url.includes('view=overlay') === overlay)) {
        const s = session(page.webSocketDebuggerUrl);
        await waitFor(s, "document.readyState === 'complete' && !!document.querySelector('#root > *')", 'page');
        if ((await s.evaluate('window.__TAURI_INTERNALS__.metadata.currentWindow.label')) === (overlay ? 'overlay' : 'main')) return s;
        s.close();
      }
    } catch (error) {
      if (error.message === 'foreign debug listener' || error.message === 'test host stopped') throw error;
    }
    await sleep(250);
  }
  throw new Error(overlay ? 'no owned overlay page' : 'no main page');
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

async function shot(s, name, full = true) {
  const r = await s.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
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

// Fill or cancel this process's own native folder dialog. A null path clicks
// its cancel button; a string fills the name edit and default button.
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
${path === null ? `$cancel = $all | Where-Object { $_.Current.ClassName -eq 'Button' -and $_.Current.AutomationId -eq '2' } | Select-Object -First 1
if (-not $cancel) { throw 'cancel control not found' }
[E2E.User32]::SendMessage([System.IntPtr]$cancel.Current.NativeWindowHandle, 0x00F5, [System.IntPtr]::Zero, $null) | Out-Null` : `
$edit = $all | Where-Object { $_.Current.ClassName -eq 'Edit' -and ($_.Current.AutomationId -eq '1148' -or $_.Current.AutomationId -eq '1152') } | Select-Object -First 1
$open = $all | Where-Object { $_.Current.ClassName -eq 'Button' -and $_.Current.AutomationId -eq '1' } | Select-Object -First 1
if (-not $edit -or -not $open) { throw 'dialog controls not found' }
[E2E.User32]::SendMessage([System.IntPtr]$edit.Current.NativeWindowHandle, 0x000C, [System.IntPtr]::Zero, '${path.replace(/'/g, "''")}') | Out-Null
[E2E.User32]::SendMessage([System.IntPtr]$open.Current.NativeWindowHandle, 0x00F5, [System.IntPtr]::Zero, $null) | Out-Null`}`);
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

function fixtureEntries(root) {
  return readdirSync(root, {withFileTypes:true}).sort((a,b) => a.name.localeCompare(b.name)).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error('Synthetic tree cannot contain links');
    const path = join(root, entry.name);
    if (entry.isDirectory()) return fixtureEntries(path).map(value => `${entry.name}/${value}`);
    if (!entry.isFile()) throw new Error('Unexpected synthetic tree entry');
    return [`${entry.name}:${createHash('sha256').update(readFileSync(path)).digest('hex')}`];
  });
}
const fixtureTree = root => fixtureEntries(root).join('|');

function fixtureImage(root) {
  const generation=readFileSync(join(root,'CURRENT'),'utf8').trim();
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(generation)) throw new Error('Invalid synthetic generation pointer');
  const directory=join(root,'generations',generation);
  if(realpathSync(directory).toLowerCase() !== join(realpathSync(root),'generations',generation).toLowerCase()) throw new Error('Synthetic generation escaped its data root');
  const digest=name=>createHash('sha256').update(readFileSync(join(directory,name))).digest('hex');
  return {generation,activity:digest('activity.json'),sequence:digest('sequence.json'),pending:existsSync(join(directory,'pending.json')) ? digest('pending.json') : null,delivery:JSON.parse(readFileSync(join(directory,'delivery.json'),'utf8'))};
}

async function searchMemory(s) {
  await s.evaluate("document.querySelector('nav button[aria-label=\"Memory\"]').click()");
  await waitFor(s,"!!document.querySelector('input[aria-label=\"Search memories\"]')",'Memory search field');
  await s.evaluate(`(()=>{
    const input=document.querySelector('input[aria-label="Search memories"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'isolation');
    input.dispatchEvent(new Event('input',{bubbles:true}));
    return true;
  })()`);
  await sleep(100);
  await s.evaluate("document.querySelector('form[role=\"search\"]').requestSubmit();true");
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
  const nextDisplay=await s.evaluate("[...document.querySelectorAll('dt')].find(e=>e.textContent==='Next trigger')?.nextElementSibling?.textContent");
  check('S.next_trigger_matches_enablement', enabled
    ? typeof o.schedule.nextTriggerAt==='string' && Date.parse(o.schedule.nextTriggerAt)>Date.now() && nextDisplay!=='Not observed'
    : o.schedule.nextTriggerAt===null && nextDisplay==='Not observed',JSON.stringify({nextTriggerAt:o.schedule.nextTriggerAt,display:nextDisplay}));
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

// Model production metadata only in the owned page. Every Run now request
// is intercepted and refused before native IPC: no production configuration,
// collector or delivery is used. Other reads still use the synthetic runner.
async function confirmationMain() {
  rmSync(settings, { force: true });
  const before = runner('overview').value;
  const app = launch();
  const s = await connect();
  await s.evaluate(`(() => {
    const real = window.fetch;
    const callUrl = window.__TAURI_INTERNALS__.convertFileSrc('activity_call','ipc');
    const setupUrl = window.__TAURI_INTERNALS__.convertFileSrc('activity_setup','ipc');
    window.__confirmationCase = 'enabled';
    window.__runRequests = 0;
    const intercepted = async (url, options) => {
      if (url !== callUrl && url !== setupUrl) return real(url, options);
      const args = JSON.parse(options.body);
      const command = url === callUrl ? 'activity_call' : 'activity_setup';
      if (command === 'activity_call' && args.request.operation === 'activity_run_now') {
        window.__runRequests++;
        return new Response(JSON.stringify({schemaVersion:1,kind:'activity_error',error:{code:'unconfigured',component:'activity_runner',retryable:false}}),{headers:{'Content-Type':'application/json','Tauri-Response':'ok'}});
      }
      const response = await real(url, options);
      const reply = await response.json();
      if (command === 'activity_setup' && reply.configured === true) {
        reply.mode = window.__confirmationCase === 'sandbox' ? 'sandbox' : 'production';
      }
      if (command === 'activity_call' && reply.kind === 'activity_overview') {
        if (window.__confirmationCase === 'missing') delete reply.producer;
        else reply.producer = {...reply.producer,mode:window.__confirmationCase === 'sandbox' ? 'sandbox' : 'production',deliveryEnabled:window.__confirmationCase !== 'disabled',paused:false};
      }
      return new Response(JSON.stringify(reply),{status:response.status,headers:response.headers});
    };
    window.fetch = intercepted;
    if (window.fetch !== intercepted) throw new Error('IPC fetch interception failed');
    return true;
  })()`);
  const probe = await call(s, {operation:'activity_run_now'});
  if (probe.kind !== 'activity_error' || await s.evaluate('window.__runRequests') !== 1) throw new Error('Mutation interception must be proved before page actions');
  await s.evaluate('window.__runRequests=0;true');
  check('Q.mutations_are_intercepted_before_native_ipc', true);
  await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
  await waitFor(s, has('Connect the installed Activity producer'), 'confirmation fixture gate');
  await press(s, 'Choose installed package…');
  fillDialog(app.pid, pkg);
  await waitFor(s, "document.querySelectorAll('.act-source').length===3", 'confirmation fixture reads');
  check('Q.synthetic_runner_connects', true);

  for (const scenario of ['enabled', 'missing', 'disabled', 'sandbox']) {
    await s.evaluate("document.querySelector('nav button[aria-label=\"Home\"]').click()");
    await waitFor(s, "!document.querySelector('.act-surface')", 'confirmation unmount');
    await s.evaluate(`window.__confirmationCase=${JSON.stringify(scenario)};window.__runRequests=0;document.querySelector('nav button[aria-label="Activity"]').click();true`);
    await waitFor(s, "document.querySelectorAll('.act-source').length===3", 'confirmation scenario');
    const requests = () => s.evaluate('window.__runRequests');
    await press(s, 'Run now');
    await sleep(250);
    const required = ['enabled', 'missing'].includes(scenario);
    check(`Q.${scenario}_first_run_request`, await requests() === (required ? 0 : 1));
    check(`Q.${scenario}_confirmation_visibility`, await s.evaluate("!!document.querySelector('.act-confirm')") === required);
    if (!required) continue;
    await press(s, 'Run now');
    await sleep(250);
    check(`Q.${scenario}_repeated_run_is_not_consent`, await requests() === 0 && await s.evaluate("!!document.querySelector('.act-confirm')"));
    if (await s.evaluate("!!document.querySelector('.act-confirm')")) {
      await press(s, 'Cancel');
      check(`Q.${scenario}_cancel_preserves_no_request`, await requests() === 0 && !(await s.evaluate("!!document.querySelector('.act-confirm')")));
      await press(s, 'Run now');
      await waitFor(s, "!!document.querySelector('.act-confirm')", 'confirmation reopened');
      await shot(s, `01-confirm-${scenario}`);
      await press(s, 'Collect and send');
      await waitFor(s, 'window.__runRequests===1', 'intercepted explicit confirmation');
      check(`Q.${scenario}_explicit_confirm_requests_once`, await requests() === 1 && !(await s.evaluate("!!document.querySelector('.act-confirm')")));
    }
  }
  const after = runner('overview').value;
  check('Q.no_real_mutation_or_delivery', before.producer.highestReserved === after.producer.highestReserved && before.delivery.publicHash === after.delivery.publicHash && before.pending === after.pending && before.producer.paused === after.producer.paused);
  s.close();
  app.kill();
  await app.exited;
}

// Malformed replies below are modeled only in this owned page; all restored
// reads still use the real installed runner, with no store mutation or Vault.
async function pollLifecycleMain() {
  rmSync(settings,{force:true});
  if(realpathSync(manifest.dataRoot).toLowerCase()!==join(realpathSync(dirname(pkg)),'data').toLowerCase())throw Error('Lifecycle drill requires the contained synthetic store');
  const before=fixtureTree(manifest.dataRoot),app=launch(),s=await connect();
  await s.evaluate(`(()=>{
    const real=window.fetch,url=window.__TAURI_INTERNALS__.convertFileSrc('activity_call','ipc');
    window.__lifeCase='backoff';window.__lifeStarts=0;window.__lifeQueries=[];
    window.fetch=async(endpoint,options)=>{
      if(endpoint!==url)return real(endpoint,options);
      const {request}=JSON.parse(options.body);let reply;
      if(['activity_run_now','activity_retry_pending'].includes(request.operation)) {
        window.__lifeStarts++;reply={schemaVersion:1,kind:'activity_run_accepted',runId:'run-lifecycle'};
      } else if(request.operation==='activity_set_paused')throw Error('Unexpected lifecycle mutation');
      else if(request.operation==='activity_get_run') {
        window.__lifeQueries.push({runId:request.runId,at:performance.now()});
        if(window.__lifeCase==='late')await new Promise(r=>setTimeout(r,1500));
        reply=window.__lifeCase==='backoff'&&window.__lifeQueries.length<=6
          ? {schemaVersion:1,kind:'activity_error',error:{code:'busy',component:'activity_archive',retryable:true}}
          : {schemaVersion:1,kind:'activity_run_status',runId:request.runId,stage:'completed',error:null};
      } else return real(endpoint,options);
      return new Response(JSON.stringify(reply),{headers:{'Content-Type':'application/json','Tauri-Response':'ok'}});
    };return true;
  })()`);
  const probe=await call(s,{operation:'activity_run_now'});
  if(probe.runId!=='run-lifecycle'||await s.evaluate('window.__lifeStarts')!==1)throw Error('Lifecycle interception was not proved');
  check('L.mutations_are_intercepted_before_native_ipc',true);
  await s.evaluate("window.__lifeStarts=0;document.querySelector('nav button[aria-label=\"Activity\"]').click()");
  await waitFor(s,has('Connect the installed Activity producer'),'lifecycle gate');await press(s,'Choose installed package…');fillDialog(app.pid,pkg);
  await waitFor(s,"[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Run now'&&!b.disabled)",'lifecycle actual reads');check('L.actual_synthetic_package_connects',true);
  await press(s,'Run now');await waitFor(s,"!!document.querySelector('.act-run')?.textContent.includes('Completed')",'six failures and recovered status',90000);
  const queries=await s.evaluate('window.__lifeQueries');
  const gaps=queries.slice(1).map((q,i)=>q.at-queries[i].at),expected=[1000,2000,4000,8000,16000,30000];
  check('L.retry_delays_reach_thirty_second_ceiling',queries.length===7&&gaps.every((gap,i)=>gap>=expected[i]-100&&gap<=expected[i]+5000),JSON.stringify({gapsMs:gaps}));
  check('L.retry_queries_keep_the_same_run_id',queries.every(q=>q.runId==='run-lifecycle'));
  check('L.recovery_keeps_one_start_request',await s.evaluate('window.__lifeStarts===1'));
  check('L.terminal_status_reenables_operation_controls',await s.evaluate("[...document.querySelectorAll('button')].filter(b=>['Run now','Pause activity sync','Change package'].includes(b.textContent.trim())).every(b=>!b.disabled)"));
  await s.evaluate("document.querySelector('nav button[aria-label=\"Home\"]').click()");await waitFor(s,"!document.querySelector('.act-surface')",'lifecycle unmount');
  await s.evaluate("window.__lifeCase='late';window.__lifeQueries=[];window.__lifeStarts=0;document.querySelector('nav button[aria-label=\"Activity\"]').click()");
  await waitFor(s,"[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Run now'&&!b.disabled)",'late scenario controls');await press(s,'Run now');await waitFor(s,'window.__lifeQueries.length===1','pending late read');check('L.late_read_is_pending',true);
  await s.evaluate("document.querySelector('nav button[aria-label=\"Home\"]').click()");await waitFor(s,"!document.querySelector('.act-surface')",'late response unmount');
  await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");await waitFor(s,"document.querySelectorAll('.act-source').length===3",'new lifecycle page');await sleep(2500);
  check('L.late_reply_does_not_populate_remounted_page',await s.evaluate("!document.querySelector('.act-run')"));
  check('L.unmount_stops_status_queries',await s.evaluate('window.__lifeQueries.length===1&&window.__lifeStarts===1'));
  check('L.lifecycle_preserves_complete_store',fixtureTree(manifest.dataRoot)===before);
  await press(s,'Change package');await waitFor(s,has('Connect the installed Activity producer'),'lifecycle forgotten choice');check('L.choice_is_cleared',!existsSync(settings));
  s.close();app.kill();await app.exited;
}

async function runPollingMain() {
  rmSync(settings,{force:true});
  if(realpathSync(manifest.dataRoot).toLowerCase()!==join(realpathSync(dirname(pkg)),'data').toLowerCase())throw Error('Run-polling requires the contained synthetic store');
  const before=fixtureTree(manifest.dataRoot),app=launch(),s=await connect();
  await s.evaluate(`(()=>{
    const real=window.fetch,url=window.__TAURI_INTERNALS__.convertFileSrc('activity_call','ipc');
    window.__pollCase='busy';window.__pollReplies=0;window.__pollStarts=0;
    window.fetch=async(endpoint,options)=>{
      if(endpoint!==url)return real(endpoint,options);
      const {request}=JSON.parse(options.body);let reply;
      if(['activity_run_now','activity_retry_pending'].includes(request.operation)) {
        window.__pollStarts++;reply={schemaVersion:1,kind:'activity_run_accepted',runId:'run-polling'};
      } else if(request.operation==='activity_set_paused') {
        throw Error('Unexpected mutation in read-polling drill');
      } else if(request.operation==='activity_get_run') {
        window.__pollReplies++;
        reply=window.__pollCase==='busy'&&window.__pollReplies===1
          ? {schemaVersion:1,kind:'activity_error',error:{code:'busy',component:'activity_archive',retryable:true}}
          : {schemaVersion:1,kind:'activity_run_status',runId:request.runId,stage:window.__pollReplies===1?window.__pollCase:'completed',error:null};
      } else return real(endpoint,options);
      return new Response(JSON.stringify(reply),{headers:{'Content-Type':'application/json','Tauri-Response':'ok'}});
    };return true;
  })()`);
  const probe=await call(s,{operation:'activity_run_now'});
  if(probe.runId!=='run-polling'||await s.evaluate('window.__pollStarts')!==1)throw Error('Polling interception was not proved');
  check('Z.mutations_are_intercepted_before_native_ipc',true);
  await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
  await waitFor(s,has('Connect the installed Activity producer'),'polling gate');await press(s,'Choose installed package…');fillDialog(app.pid,pkg);
  await waitFor(s,"document.querySelectorAll('.act-source').length===3",'polling actual reads');check('Z.actual_synthetic_package_connects',true);
  const reset=async scenario=>{
    await s.evaluate("document.querySelector('nav button[aria-label=\"Home\"]').click()");await waitFor(s,"!document.querySelector('.act-surface')",'polling unmount');
    await s.evaluate(`window.__pollCase=${JSON.stringify(scenario)};window.__pollReplies=0;window.__pollStarts=0;document.querySelector('nav button[aria-label="Activity"]').click();true`);
    await waitFor(s,"[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Run now'&&!b.disabled)",'polling controls');
  };
  const recovered=async()=>{
    try{await waitFor(s,'window.__pollReplies>=2','second status query',4000);}catch{return false;}
    await sleep(100);return await s.evaluate("!!document.querySelector('.act-run')?.textContent.includes('Completed')&&![...document.querySelectorAll('[role=alert]')].some(e=>e.textContent.includes('busy'))&&window.__pollStarts===1");
  };
  const blocked=()=>s.evaluate("[...document.querySelectorAll('button')].filter(b=>['Run now','Pause activity sync','Change package'].includes(b.textContent.trim())).every(b=>b.disabled)");
  await reset('busy');await press(s,'Run now');await waitFor(s,'window.__pollReplies===1','busy response');await sleep(100);
  check('Z.busy_status_is_visible',await s.evaluate(has('The Activity producer is busy with another run')));
  check('Z.busy_keeps_operation_controls_disabled',await blocked());
  check('Z.busy_recovers_without_second_run',await recovered());
  for(const stage of ['queued','collecting','persisting','uploading','observing']) {
    await reset(stage);await press(s,'Run now');await waitFor(s,'window.__pollReplies===1','intermediate response');await sleep(100);
    check(`Z.${stage}_keeps_operation_controls_disabled`,await blocked());
    check(`Z.${stage}_continues_to_terminal_status`,await recovered());
  }
  check('Z.polling_preserves_complete_store',fixtureTree(manifest.dataRoot)===before);
  await reset('queued');await press(s,'Change package');await waitFor(s,has('Connect the installed Activity producer'),'polling forgotten choice');check('Z.choice_is_cleared',!existsSync(settings));
  s.close();app.kill();await app.exited;
}

async function runContractMain(outcomeMode=false) {
  const prefix=outcomeMode?'U.':'Y.';
  const outcomeCases=[
    ...[['private_state','C:/SYNTHETIC_PRIVATE/config.json'],['future_state','future_outcome'],['constructor_state','constructor'],['prototype_state','toString']].map(([id,state])=>({id,summary:{state},label:'Run outcome unavailable',count:null})),
    ...[['fraction_count',1.5],['excess_count',4],['unsafe_count',9007199254740992],['negative_count',-1]].map(([id,sourceFailures])=>({id,summary:{state:'delivery_disabled',sourceFailures},label:'New batch kept locally',count:null})),
    {id:'valid_outcome',summary:{state:'delivery_unresolved',sourceFailures:2},label:'Batch kept pending',count:2},
  ];
  rmSync(settings,{force:true});
  if(realpathSync(manifest.dataRoot).toLowerCase()!==join(realpathSync(dirname(pkg)),'data').toLowerCase()) throw new Error('Run-contract acceptance requires the contained synthetic data root');
  const before=fixtureTree(manifest.dataRoot);
  const app=launch();const s=await connect();
  await s.evaluate(`(() => {
    const real=window.fetch;
    const url=window.__TAURI_INTERNALS__.convertFileSrc('activity_call','ipc');
    window.__runCase='valid';window.__statusReplies=0;window.__mutationReplies=0;
    window.fetch=async (endpoint,options)=>{
      if(endpoint!==url)return real(endpoint,options);
      const {request}=JSON.parse(options.body);let reply;
      if(['activity_run_now','activity_retry_pending'].includes(request.operation)) {
        window.__mutationReplies++;
        reply={schemaVersion:1,kind:'activity_run_accepted',runId:'run-contract'};
        if(window.__runCase==='extra_accepted')reply.privatePath='SYNTHETIC_PRIVATE';
      } else if(request.operation==='activity_set_paused') {
        window.__mutationReplies++;
        reply={schemaVersion:1,kind:'activity_pause_acknowledged',paused:!request.paused};
      } else if(request.operation==='activity_get_run') {
        window.__statusReplies++;
        reply={schemaVersion:1,kind:'activity_run_status',runId:request.runId,stage:'completed',error:null,operation:'activity_run_now',summary:null};
        if(window.__runCase==='wrong_run')reply.runId='another-run';
        if(window.__runCase==='invalid_run')reply.runId='../private';
        if(window.__runCase==='extra_status')reply.privatePath='SYNTHETIC_PRIVATE';
        if(window.__runCase==='wrong_operation')reply.operation='memory_list';
        if(window.__runCase==='invalid_summary')reply.summary='SYNTHETIC_PRIVATE';
        const outcomeCase=${JSON.stringify(outcomeCases)}.find(c=>c.id===window.__runCase);
        if(outcomeCase)reply.summary=outcomeCase.summary;
      } else return real(endpoint,options);
      return new Response(JSON.stringify(reply),{headers:{'Content-Type':'application/json','Tauri-Response':'ok'}});
    };return true;
  })()`);
  const probe=await call(s,{operation:'activity_run_now'});
  if(probe.runId!=='run-contract'||await s.evaluate('window.__mutationReplies')!==1)throw Error('Run interception must be proved before page actions');
  check(prefix+'mutations_are_intercepted_before_native_ipc',true);
  await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
  await waitFor(s,has('Connect the installed Activity producer'),'run-contract gate');
  await press(s,'Choose installed package…');fillDialog(app.pid,pkg);
  await waitFor(s,"document.querySelectorAll('.act-source').length===3",'run-contract actual reads');
  check(prefix+'actual_synthetic_package_connects',true);
  const reset=async scenario=>{
    await s.evaluate("document.querySelector('nav button[aria-label=\"Home\"]').click()");
    await waitFor(s,"!document.querySelector('.act-surface')",'run-contract unmount');
    await s.evaluate(`window.__runCase=${JSON.stringify(scenario)};window.__statusReplies=0;document.querySelector('nav button[aria-label="Activity"]').click();true`);
    await waitFor(s,"[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Run now'&&!b.disabled)",'run-contract controls');
  };
  if(outcomeMode) {
    for(const scenario of outcomeCases) {
      await reset(scenario.id);await press(s,'Run now');
      await waitFor(s,"!!document.querySelector('.act-run')?.textContent.includes('Completed')",'modeled outcome');
      const text=await s.evaluate("document.querySelector('.act-run').textContent");
      check(`U.${scenario.id}_label_is_sanitized`,text.includes(scenario.label)&&!text.includes('SYNTHETIC_PRIVATE')&&!text.includes('future_outcome'));
      check(`U.${scenario.id}_count_is_valid`,scenario.count===null?!text.includes('source(s) failed'):text.includes(`${scenario.count} source(s) failed`));
    }
    check('U.outcome_display_preserves_complete_store',fixtureTree(manifest.dataRoot)===before);
    await reset('valid');await press(s,'Change package');await waitFor(s,has('Connect the installed Activity producer'),'outcome forgotten choice');check('U.choice_is_cleared',!existsSync(settings));
    s.close();app.kill();await app.exited;return;
  }
  for(const scenario of ['wrong_run','invalid_run','extra_status','wrong_operation','invalid_summary','valid']) {
    await reset(scenario);await press(s,'Run now');
    await waitFor(s,'window.__statusReplies>0','modeled run status');await sleep(200);
    const invalid=await s.evaluate(has('The response did not match Activity IPC v1'));
    const completed=await s.evaluate("!!document.querySelector('.act-run')?.textContent.includes('Completed')");
    check(scenario==='valid'?'Y.matching_terminal_status_recovers':`Y.rejects_${scenario}`,scenario==='valid'?!invalid&&completed:invalid&&!completed);
  }
  await reset('extra_accepted');await press(s,'Run now');await sleep(200);
  check('Y.rejects_extra_accepted',await s.evaluate(has('The response did not match Activity IPC v1'))&&await s.evaluate('window.__statusReplies')===0);
  await reset('opposite_pause');await press(s,'Pause activity sync');await sleep(200);
  check('Y.rejects_opposite_pause_ack',await s.evaluate(has('The response did not match Activity IPC v1')));
  check('Y.modeled_operations_preserve_complete_store',fixtureTree(manifest.dataRoot)===before);
  await reset('valid');await press(s,'Change package');await waitFor(s,has('Connect the installed Activity producer'),'run-contract forgotten choice');
  check('Y.choice_is_cleared',!existsSync(settings));
  s.close();app.kill();await app.exited;
}

// Status faults are modeled before native IPC. Selection, cancellation and
// clearing below use the existing installed synthetic package and own dialog.
async function setupContractMain() {
  rmSync(settings,{force:true});
  if(realpathSync(manifest.dataRoot).toLowerCase()!==join(realpathSync(dirname(pkg)),'data').toLowerCase()) throw new Error('Setup acceptance requires contained synthetic data');
  const before=fixtureTree(manifest.dataRoot),app=launch(),s=await connect();
  await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
  await waitFor(s,has('Connect the installed Activity producer'),'setup gate');
  await press(s,'Choose installed package…');fillDialog(app.pid,null);
  await waitFor(s,"[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Choose installed package…'&&!b.disabled)",'actual cancelled selection');
  check('Z.actual_cancel_preserves_unconfigured_choice',!existsSync(settings)&&await s.evaluate(has('Connect the installed Activity producer'))&&!(await s.evaluate(has('The response did not match Activity IPC v1'))));
  await press(s,'Choose installed package…');fillDialog(app.pid,pkg);
  await waitFor(s,"document.querySelectorAll('.act-source').length===3",'actual setup selection');
  check('Z.actual_package_selection_connects',true);
  await s.evaluate(`(()=>{const real=window.fetch,setupUrl=window.__TAURI_INTERNALS__.convertFileSrc('activity_setup','ipc'),callUrl=window.__TAURI_INTERNALS__.convertFileSrc('activity_call','ipc');
    window.__setupCase=null;window.__setupReads=0;window.__setupMutations=0;
    window.fetch=async(url,options)=>{const args=(url===setupUrl||url===callUrl)?JSON.parse(options.body):null;
      if(url===callUrl){if(['activity_run_now','activity_retry_pending','activity_set_paused'].includes(args.request.operation)){window.__setupMutations++;return new Response(JSON.stringify({schemaVersion:1,kind:'activity_error',error:{code:'unconfigured',component:'activity_archive',retryable:false}}),{headers:{'Content-Type':'application/json','Tauri-Response':'ok'}});}window.__setupReads++;}
      if(url===setupUrl&&args.action==='status'&&window.__setupCase!==null)return new Response(JSON.stringify(window.__setupCase),{headers:{'Content-Type':'application/json','Tauri-Response':'ok'}});
      return real(url,options);};return true;})()`);
  const probe=await call(s,{operation:'activity_run_now'});
  if(probe.kind!=='activity_error'||await s.evaluate('window.__setupMutations')!==1)throw Error('Setup mutation interception must be proved');
  check('Z.mutations_are_intercepted_before_native_ipc',true);
  const installed={configured:true,mode:'sandbox',taskName:manifest.taskName,folder:'package'};
  const cases=[['future_mode',{...installed,mode:'SYNTHETIC_PRIVATE_MARKER'}],['extra_fields',{...installed,rawConfig:'SYNTHETIC_PRIVATE_MARKER'}],
    ['absolute_folder',{...installed,folder:'C:\\SYNTHETIC_PRIVATE_MARKER\\package'}],['invalid_task',{...installed,taskName:'../SYNTHETIC_PRIVATE_MARKER'}],
    ['invalid_saved',{...installed,saved:'SYNTHETIC_PRIVATE_MARKER'}],['contradictory_cancel',{...installed,cancelled:true}],
    ['status_error',{configured:false,error:'constructor'}],['clear_as_status',{configured:false,saved:true}],['cancel_as_status',{cancelled:true}]];
  for(const[name,reply]of cases){
    await s.evaluate("document.querySelector('nav button[aria-label=\"Home\"]').click()");
    await waitFor(s,"!document.querySelector('.act-surface')",'setup unmount');
    await s.evaluate(`window.__setupCase=${JSON.stringify(reply)};window.__setupReads=0;window.__setupMutations=0;document.querySelector('nav button[aria-label="Activity"]').click();true`);
    await sleep(700);
    check(`Z.${name}_contract_failure`,await s.evaluate(has('The response did not match Activity IPC v1')));
    check(`Z.${name}_no_producer_requests`,await s.evaluate('window.__setupReads===0&&window.__setupMutations===0'));
    check(`Z.${name}_no_private_text`,!(await s.evaluate(has('SYNTHETIC_PRIVATE_MARKER'))));
  }
  await s.evaluate("document.querySelector('nav button[aria-label=\"Home\"]').click()");
  await waitFor(s,"!document.querySelector('.act-surface')",'setup final unmount');
  await s.evaluate("window.__setupCase=null;document.querySelector('nav button[aria-label=\"Activity\"]').click();true");
  await waitFor(s,"document.querySelectorAll('.act-source').length===3",'real status recovery');
  check('Z.actual_status_recovers',true);
  const savedBefore=readFileSync(settings,'utf8');
  await press(s,'Change package');
  await waitFor(s,has('Connect the installed Activity producer'),'actual clear');
  check('Z.actual_clear_removes_owned_choice',!existsSync(settings));
  await press(s,'Choose installed package…');fillDialog(app.pid,pkg);
  await waitFor(s,"document.querySelectorAll('.act-source').length===3",'actual reselection');
  check('Z.actual_reselection_recovers',readFileSync(settings,'utf8')===savedBefore);
  check('Z.setup_flow_preserves_complete_store',fixtureTree(manifest.dataRoot)===before);
  await shot(s,'01-setup-recovered');s.close();app.kill();await app.exited;
}

// An empty owned directory at the file path actually refuses native writes
// and removal. It contains no personal config and is removed without recursion.
async function choiceSaveMain() {
  if(existsSync(settings))throw Error('Choice-save output requires an absent settings path');
  if(realpathSync(manifest.dataRoot).toLowerCase()!==join(realpathSync(dirname(pkg)),'data').toLowerCase())throw Error('Choice-save acceptance requires contained synthetic data');
  const before=fixtureTree(manifest.dataRoot);mkdirSync(settings);settingsDirectoryFixture=true;
  check('J.settings_fault_is_owned_empty_directory',readdirSync(settings).length===0);
  let app=launch(),s=await connect();
  await s.evaluate(`(()=>{const real=window.fetch,setupUrl=window.__TAURI_INTERNALS__.convertFileSrc('activity_setup','ipc'),callUrl=window.__TAURI_INTERNALS__.convertFileSrc('activity_call','ipc');window.__choiceReplies=[];window.__choiceClearCount=0;window.__choiceMutations=0;
    window.fetch=async(url,options)=>{const args=(url===setupUrl||url===callUrl)?JSON.parse(options.body):null;
      if(url===callUrl&&['activity_run_now','activity_retry_pending','activity_set_paused'].includes(args.request.operation)){window.__choiceMutations++;return new Response(JSON.stringify({schemaVersion:1,kind:'activity_error',error:{code:'unconfigured',component:'activity_archive',retryable:false}}),{headers:{'Content-Type':'application/json','Tauri-Response':'ok'}});}
      if(url===setupUrl&&args.action==='clear')window.__choiceClearCount++;
      const response=await real(url,options);if(url===setupUrl){const reply=await response.clone().json();window.__choiceReplies.push({action:args.action,saved:reply.saved,configured:reply.configured});if(args.action==='clear')await new Promise(r=>setTimeout(r,600));}return response;};return true;})()`);
  const probe=await call(s,{operation:'activity_run_now'});
  if(probe.kind!=='activity_error'||await s.evaluate('window.__choiceMutations')!==1)throw Error('Choice-save mutations must be intercepted');
  check('J.mutations_are_intercepted_before_native_ipc',true);
  await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
  await waitFor(s,has('Connect the installed Activity producer'),'choice-save gate');
  await press(s,'Choose installed package…');fillDialog(app.pid,pkg);
  await waitFor(s,"document.querySelectorAll('.act-source').length===3",'unsaved connected package');
  check('J.native_selection_really_reports_saved_false',await s.evaluate("window.__choiceReplies.some(r=>r.action==='select'&&r.configured===true&&r.saved===false)"));
  check('J.unsaved_connection_notice_is_visible',await s.evaluate(has('Package connected for this window'))&&await s.evaluate(has('select it again after restarting')));
  check('J.unsaved_selection_still_reads_three_sources',await s.evaluate("document.querySelectorAll('.act-source').length===3"));
  if(mode==='--choice-persistence'){
    await s.evaluate("document.querySelector('nav button[aria-label=\"Home\"]').click()");await waitFor(s,"!document.querySelector('.act-surface')",'unsaved remount');await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");await waitFor(s,"document.querySelectorAll('.act-source').length===3",'unsaved status remount');
    const status=await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'status'})");
    check('CP.remounted_status_reports_unconfirmed_saved_choice',status.configured===true&&status.saved===false);
    check('CP.remounted_unsaved_notice_stays_visible',await s.evaluate(has('Package connected for this window'))&&await s.evaluate(has('select it again after restarting')));
  }
  await s.evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Change package');b.click();b.click();return true;})()");
  await waitFor(s,has('Connect the installed Activity producer'),'failed clear gate');await sleep(250);
  check('J.repeated_clicks_make_one_actual_clear',await s.evaluate("window.__choiceClearCount===1&&window.__choiceReplies.some(r=>r.action==='clear'&&r.configured===false&&r.saved===false)"));
  check('J.failed_clear_explains_saved_choice',await s.evaluate(has('The saved package choice could not be cleared')));
  const retryVisible=await s.evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Retry forgetting package'&&!b.disabled)");
  check('J.failed_clear_has_named_retry',retryVisible);
  removeEmptySettingsFixture();check('J.only_empty_owned_fault_directory_is_removed',!existsSync(settings));
  if(retryVisible){await press(s,'Retry forgetting package');await waitFor(s,"window.__choiceReplies.some(r=>r.action==='clear'&&r.saved===true)",'actual clear recovery');await sleep(800);}
  check('J.actual_retry_accepts_clear_after_recovery',retryVisible&&await s.evaluate("window.__choiceReplies.some(r=>r.action==='clear'&&r.saved===true)"));
  check('J.retry_success_removes_failed_clear_feedback',retryVisible&&!(await s.evaluate(has('The saved package choice could not be cleared')))&&!(await s.evaluate(has('Retry forgetting package'))));
  await press(s,'Choose installed package…');fillDialog(app.pid,pkg);
  await waitFor(s,"document.querySelectorAll('.act-source').length===3",'saved reselection');
  check('J.native_reselection_really_reports_saved_true',await s.evaluate("window.__choiceReplies.some(r=>r.action==='select'&&r.configured===true&&r.saved===true)"));
  check('J.saved_connection_removes_temporary_notice',!(await s.evaluate(has('Package connected for this window'))));
  if(mode==='--choice-persistence'){
    await s.evaluate("document.querySelector('nav button[aria-label=\"Home\"]').click()");await waitFor(s,"!document.querySelector('.act-surface')",'saved remount');await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");await waitFor(s,"document.querySelectorAll('.act-source').length===3",'saved status remount');
    const status=await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'status'})");
    check('CP.remounted_status_verifies_saved_choice',status.configured===true&&status.saved===true);
    check('CP.remounted_saved_choice_stays_quiet',!(await s.evaluate(has('Package connected for this window'))));
  }
  const savedRoot=JSON.parse(readFileSync(settings,'utf8')).installRoot;
  // Rust stores a verbatim Windows path. Compare its normalized native form
  // without Node's realpath walker treating a verbatim drive as an entry.
  const comparableRoot=typeof savedRoot==='string'&&savedRoot.startsWith('\\\\?\\')?savedRoot.slice(4):savedRoot;
  check('J.recovered_choice_is_a_settings_file',typeof comparableRoot==='string'&&isAbsolute(comparableRoot)&&resolve(comparableRoot).toLowerCase()===realpathSync(pkg).toLowerCase());
  await shot(s,'01-choice-save-recovered');s.close();app.kill();await app.exited;
  app=launch();s=await connect();await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
  await waitFor(s,"document.querySelectorAll('.act-source').length===3",'recovered choice restart');
  check('J.restart_reads_recovered_saved_choice',true);
  check('J.complete_activity_store_is_unchanged',fixtureTree(manifest.dataRoot)===before);
  s.close();app.kill();await app.exited;
}

async function choiceDeleteMain() {
  if(existsSync(settings))throw Error('Choice-delete output requires an absent settings file');
  if(realpathSync(manifest.dataRoot).toLowerCase()!==join(realpathSync(dirname(pkg)),'data').toLowerCase())throw Error('Choice-delete acceptance requires contained synthetic data');
  const before=fixtureTree(manifest.dataRoot);let app=launch(),s=await connect();
  await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
  await waitFor(s,has('Connect the installed Activity producer'),'choice-delete gate');
  if(['--choice-clear-remount','--choice-select-recovery'].includes(mode)){const status=await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'status'})");check('CF.initial_unconfigured_status_has_no_invented_clear_failure',status.configured===false&&!Object.hasOwn(status,'saved')&&!(await s.evaluate(has('Retry forgetting package'))));}
  await press(s,'Choose installed package…');fillDialog(app.pid,pkg);
  await waitFor(s,"document.querySelectorAll('.act-source').length===3",'choice-delete selection');
  check('T.actual_selection_saves_owned_file',existsSync(settings));
  if(realpathSync(settings)!==join(realpathSync(out),'activity-install.json'))throw Error('Choice-delete file escaped output');
  const saved=readFileSync(settings),holder=spawn('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoProfile','-NonInteractive','-Command',`$f=[IO.File]::Open('${settings.replace(/'/g,"''")}','Open','Read','Read');try{'locked';Start-Sleep -Seconds 90}finally{$f.Dispose()}`],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  children.add(holder);holder.exited=new Promise(r=>holder.once('exit',code=>{children.delete(holder);r(code);}));
  try {
    await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Synthetic choice hold not ready')),10000);holder.stdout.on('data',bytes=>{output+=bytes.toString();if(output.includes('locked')){clearTimeout(timer);resolve();}});holder.once('exit',()=>{clearTimeout(timer);reject(Error('Synthetic choice hold exited'));});});
    check('T.saved_choice_is_held_without_delete_sharing',true);
    await s.evaluate(`(()=>{const real=window.fetch,url=window.__TAURI_INTERNALS__.convertFileSrc('activity_setup','ipc');window.__deleteReply=null;window.__selectReplies=[];window.fetch=async(u,o)=>{const response=await real(u,o);if(u===url){const action=JSON.parse(o.body).action,reply=await response.clone().json();if(action==='clear')window.__deleteReply=reply;if(action==='select')window.__selectReplies.push(reply);}return response;};return true;})()`);
    await press(s,'Change package');await waitFor(s,has('Connect the installed Activity producer'),'failed delete gate');
    check('T.actual_delete_refusal_reports_saved_false',await s.evaluate('window.__deleteReply?.configured===false&&window.__deleteReply.saved===false'));
    check('T.refusal_explains_reconnect_and_retry',await s.evaluate(has('It may reconnect after restarting'))&&await s.evaluate(has('Retry forgetting package')));
    check('T.failed_clear_preserves_exact_saved_file',readFileSync(settings).equals(saved));
    if(mode==='--choice-select-recovery'){
      await press(s,'Choose installed package…');fillDialog(app.pid,null);await waitFor(s,"window.__selectReplies.some(r=>r.cancelled===true)",'actual cancelled picker');await sleep(250);
      check('SR.actual_picker_cancel_is_reported',await s.evaluate("window.__selectReplies.some(r=>r.cancelled===true)"));
      check('SR.cancel_preserves_clear_warning_and_retry',await s.evaluate(has('The saved package choice could not be cleared'))&&await s.evaluate(has('Retry forgetting package')));
      await press(s,'Choose installed package…');fillDialog(app.pid,out);await waitFor(s,has('That folder is not an installed Activity package'),'actual invalid package selection');
      check('SR.actual_nonpackage_selection_is_refused',await s.evaluate("window.__selectReplies.some(r=>r.configured===false&&r.error==='not_a_package')"));
      check('SR.invalid_selection_preserves_clear_warning',await s.evaluate(has('The saved package choice could not be cleared'))&&await s.evaluate(has('It may reconnect after restarting')));
      check('SR.invalid_selection_preserves_clear_retry',await s.evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Retry forgetting package'&&!b.disabled)"));
      const status=await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'status'})");
      check('SR.invalid_selection_keeps_exact_native_choice_state',status.configured===false&&status.saved===false&&readFileSync(settings).equals(saved)&&await s.evaluate("document.querySelectorAll('.act-source').length===0"));
    }
    if(['--choice-clear-remount','--choice-select-recovery'].includes(mode)){
      await s.evaluate("document.querySelector('nav button[aria-label=\"Home\"]').click()");await waitFor(s,"!document.querySelector('.mem-gate[data-screen-label=\"Activity\"]')",'failed clear unmount');await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");await waitFor(s,has('Connect the installed Activity producer'),'failed clear remount');await sleep(250);
      const status=await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'status'})");
      check('CF.remounted_status_retains_actual_clear_failure',status.configured===false&&status.saved===false);
      check('CF.remounted_clear_warning_stays_visible',await s.evaluate(has('The saved package choice could not be cleared'))&&await s.evaluate(has('It may reconnect after restarting')));
      check('CF.remounted_clear_retry_stays_available',await s.evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Retry forgetting package'&&!b.disabled)"));
      check('CF.remount_never_reconnects_or_changes_saved_file',await s.evaluate("document.querySelectorAll('.act-source').length===0")&&readFileSync(settings).equals(saved));
    }
    s.close();app.kill();await app.exited;app=launch();s=await connect();
    await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
    await waitFor(s,"document.querySelectorAll('.act-source').length===3",'retained choice restart');
    check('T.restart_really_reconnects_retained_choice',true);
    check('T.restart_keeps_saved_file_exact',readFileSync(settings).equals(saved));
    await press(s,'Change package');await waitFor(s,has('Retry forgetting package'),'second actual delete refusal');
    check('T.restarted_host_reports_same_clear_failure',await s.evaluate(has('The saved package choice could not be cleared')));
  }finally{holder.kill();await holder.exited;}
  await press(s,'Retry forgetting package');await waitFor(s,"![...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Retry forgetting package')",'delete after release');
  check('T.released_retry_removes_saved_choice',!existsSync(settings));
  check('T.released_retry_clears_failure_feedback',!(await s.evaluate(has('The saved package choice could not be cleared'))));
  if(['--choice-clear-remount','--choice-select-recovery'].includes(mode)){
    await s.evaluate("document.querySelector('nav button[aria-label=\"Home\"]').click()");await waitFor(s,"!document.querySelector('.mem-gate[data-screen-label=\"Activity\"]')",'successful clear unmount');await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");await waitFor(s,has('Connect the installed Activity producer'),'successful clear remount');await sleep(250);
    const status=await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'status'})");
    check('CF.remounted_status_retains_successful_clear',status.configured===false&&status.saved===true);
    check('CF.remounted_success_has_no_warning_or_retry',!(await s.evaluate(has('The saved package choice could not be cleared')))&&!(await s.evaluate(has('Retry forgetting package')))&&!existsSync(settings));
  }
  s.close();app.kill();await app.exited;app=launch();s=await connect();
  await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");await waitFor(s,has('Connect the installed Activity producer'),'forgotten choice restart');
  check('T.restart_stays_unconfigured_after_actual_delete',await s.evaluate("document.querySelectorAll('.act-source').length===0")&&!existsSync(settings));
  check('T.complete_activity_store_is_unchanged',fixtureTree(manifest.dataRoot)===before);
  await shot(s,'01-forgotten-choice');s.close();app.kill();await app.exited;
}

async function runHistoryMain() {
  if(existsSync(settings))throw Error('Run-history output requires an absent settings file');
  if(realpathSync(manifest.dataRoot).toLowerCase()!==join(realpathSync(dirname(pkg)),'data').toLowerCase())throw Error('Run-history acceptance requires contained synthetic data');
  const image=fixtureImage(manifest.dataRoot),count=readdirSync(join(manifest.dataRoot,'generations')).length;let app=launch(),s=await connect();
  await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");await waitFor(s,has('Connect the installed Activity producer'),'run-history gate');
  await press(s,'Choose installed package…');fillDialog(app.pid,pkg);await waitFor(s,"document.querySelectorAll('.act-source').length===3",'run-history package');
  check('RH.actual_synthetic_package_connects',true);
  const paused=await call(s,{operation:'activity_set_paused',paused:true});
  check('RH.producer_is_actually_paused',paused.kind==='activity_pause_acknowledged'&&paused.paused===true&&(await overview(s)).producer.paused===true);
  if(paused.kind!=='activity_pause_acknowledged'||paused.paused!==true)throw Error('Paused run rehearsal must not continue without actual pause');
  const pausedTree=fixtureTree(manifest.dataRoot),ids=[],operations=[];
  for(let number=1;number<=17;number++){
    const operation=number%2?'activity_run_now':'activity_retry_pending',accepted=await call(s,{operation});
    if(accepted.kind!=='activity_run_accepted')throw Error('Paused run was not accepted');ids.push(accepted.runId);operations.push(operation);
    check(`RH.${number}_accepts_distinct_actual_run`,typeof accepted.runId==='string'&&new Set(ids).size===ids.length);
    let status;const deadline=Date.now()+10000;do{status=await call(s,{operation:'activity_get_run',runId:accepted.runId});if(['completed','blocked','failed'].includes(status.stage))break;await sleep(50);}while(Date.now()<deadline);
    check(`RH.${number}_terminal_is_same_paused_operation`,status.kind==='activity_run_status'&&status.runId===accepted.runId&&status.operation===operation&&status.stage==='blocked'&&status.summary?.state==='paused');
    if(status.stage!=='blocked'||status.summary?.state!=='paused')throw Error('Paused producer did not return its expected no-work outcome');
  }
  const expired=await call(s,{operation:'activity_get_run',runId:ids[0]});
  check('RH.seventeenth_run_evicts_oldest_with_contract_error',expired.kind==='activity_error'&&expired.error.code==='contract_invalid'&&expired.error.retryable===false);
  const kept=await Promise.all(ids.slice(1).map(runId=>call(s,{operation:'activity_get_run',runId})));
  check('RH.latest_sixteen_exact_records_remain_readable',kept.every((r,i)=>r.kind==='activity_run_status'&&r.runId===ids[i+1]&&r.operation===operations[i+1]&&r.stage==='blocked'&&r.summary?.state==='paused'));
  check('RH.seventeen_actual_ids_are_unique',new Set(ids).size===17);
  check('RH.all_paused_runs_preserve_complete_store',fixtureTree(manifest.dataRoot)===pausedTree);
  const afterRuns=fixtureImage(manifest.dataRoot);
  check('RH.paused_runs_preserve_archive_sequence_pending',afterRuns.activity===image.activity&&afterRuns.sequence===image.sequence&&afterRuns.pending===image.pending);
  s.close();app.kill();await app.exited;app=launch();s=await connect();await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");await waitFor(s,"document.querySelectorAll('.act-source').length===3",'run-history restart');
  const forgotten=await call(s,{operation:'activity_get_run',runId:ids.at(-1)});
  check('RH.restart_does_not_invent_old_session_records',forgotten.kind==='activity_error'&&forgotten.error.code==='contract_invalid'&&forgotten.error.retryable===false);
  check('RH.restart_keeps_actual_paused_state_and_store',(await overview(s)).producer.paused===true&&fixtureTree(manifest.dataRoot)===pausedTree);
  const resumed=await call(s,{operation:'activity_set_paused',paused:false});
  check('RH.actual_resume_recovers',resumed.kind==='activity_pause_acknowledged'&&resumed.paused===false&&(await overview(s)).producer.paused===false);
  const final=fixtureImage(manifest.dataRoot);check('RH.resume_preserves_archive_sequence_pending',final.activity===image.activity&&final.sequence===image.sequence&&final.pending===image.pending);
  check('RH.only_pause_and_resume_create_generations',readdirSync(join(manifest.dataRoot,'generations')).length===count+2);
  await press(s,'Change package');await waitFor(s,has('Connect the installed Activity producer'),'run-history clear');check('RH.actual_clear_removes_owned_choice',!existsSync(settings));
  s.close();app.kill();await app.exited;
}

async function runAdmissionMain() {
  if(existsSync(settings))throw Error('Run-admission output requires absent settings');
  if(realpathSync(manifest.dataRoot).toLowerCase()!==join(realpathSync(dirname(pkg)),'data').toLowerCase())throw Error('Run-admission escaped synthetic root');
  const image=fixtureImage(manifest.dataRoot),count=readdirSync(join(manifest.dataRoot,'generations')).length,app=launch(),s=await connect();
  await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");await waitFor(s,has('Connect the installed Activity producer'),'admission gate');await press(s,'Choose installed package…');fillDialog(app.pid,pkg);await waitFor(s,"document.querySelectorAll('.act-source').length===3",'admission package');
  const paused=await call(s,{operation:'activity_set_paused',paused:true});
  check('RA.actual_pause_is_required_before_run_pairs',paused.kind==='activity_pause_acknowledged'&&paused.paused===true&&(await overview(s)).producer.paused===true);
  if(paused.kind!=='activity_pause_acknowledged'||paused.paused!==true)throw Error('Concurrent rehearsal requires actual pause');
  const tree=fixtureTree(manifest.dataRoot),ids=[],operations=[];
  for(let number=1;number<=10;number++){
    const requests=number%2?['activity_run_now','activity_retry_pending']:['activity_retry_pending','activity_run_now'];
    const replies=await Promise.all(requests.map(operation=>call(s,{operation}))),accepted=replies.map((reply,i)=>({reply,operation:requests[i]})).filter(x=>x.reply.kind==='activity_run_accepted'),busy=replies.filter(reply=>reply.kind==='activity_error'&&reply.error?.code==='busy'&&reply.error?.retryable===true);
    check('RA.'+number+'_one_admission_and_one_retryable_busy',accepted.length===1&&busy.length===1);
    if(accepted.length!==1||busy.length!==1)throw Error('Pair did not establish exclusive active admission');
    const {reply,operation}=accepted[0];ids.push(reply.runId);operations.push(operation);
    let status;const deadline=Date.now()+10000;do{status=await call(s,{operation:'activity_get_run',runId:reply.runId});if(['completed','failed','blocked'].includes(status.stage))break;await sleep(50);}while(Date.now()<deadline);
    check('RA.'+number+'_terminal_matches_same_paused_operation',status.kind==='activity_run_status'&&status.runId===reply.runId&&status.operation===operation&&status.stage==='blocked'&&status.summary?.state==='paused');
    if(status.stage!=='blocked'||status.summary?.state!=='paused')throw Error('Expected no-work paused outcome');
    check('RA.'+number+'_pair_preserves_exact_paused_store',fixtureTree(manifest.dataRoot)===tree);
  }
  check('RA.ten_accepted_runs_have_distinct_ids',ids.length===10&&new Set(ids).size===10);
  const records=await Promise.all(ids.map(runId=>call(s,{operation:'activity_get_run',runId})));
  check('RA.all_ten_correlated_records_remain_readable',records.every((r,i)=>r.kind==='activity_run_status'&&r.runId===ids[i]&&r.operation===operations[i]&&r.stage==='blocked'&&r.summary?.state==='paused'));
  const resume=await call(s,{operation:'activity_set_paused',paused:false});check('RA.actual_resume_succeeds_after_concurrent_pairs',resume.kind==='activity_pause_acknowledged'&&resume.paused===false&&(await overview(s)).producer.paused===false);
  const recovered=fixtureImage(manifest.dataRoot);check('RA.archive_sequence_and_pending_remain_exact',recovered.activity===image.activity&&recovered.sequence===image.sequence&&recovered.pending===image.pending);
  check('RA.only_pause_resume_add_two_generations',readdirSync(join(manifest.dataRoot,'generations')).length===count+2);
  const clear=await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'clear'})");check('RA.owned_saved_choice_is_actually_removed',clear.configured===false&&clear.saved===true&&!existsSync(settings));
  await shot(s,'01-run-admission');s.close();app.kill();await app.exited;
}

async function runnerHashMain() {
  const startupMissing=mode==='--runner-missing-restart',missing=startupMissing||mode==='--runner-missing',probe=(id,ok,detail)=>check((startupMissing?'HR.':missing?'HM.':'HB.')+id,ok,detail);
  if(existsSync(settings))throw Error('Runner-hash output requires absent settings');
  if(realpathSync(manifest.dataRoot).toLowerCase()!==join(realpathSync(dirname(pkg)),'data').toLowerCase())throw Error('Runner-hash escaped synthetic data');
  const binary=join(pkg,'enouia-activity.exe');if(realpathSync(binary).toLowerCase()!==join(realpathSync(pkg),'enouia-activity.exe').toLowerCase())throw Error('Synthetic binary cannot be redirected');
  const original=readFileSync(binary),hash=bytes=>createHash('sha256').update(bytes).digest('hex'),image=fixtureImage(manifest.dataRoot),count=readdirSync(join(manifest.dataRoot,'generations')).length;
  probe('original_selected_runner_matches_manifest_hash',hash(original)===manifest.binaryHash.toLowerCase());if(hash(original)!==manifest.binaryHash.toLowerCase())throw Error('Prepared binary already changed');
  let app=launch(),s=await connect();await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");await waitFor(s,has('Connect the installed Activity producer'),'hash gate');await press(s,'Choose installed package…');fillDialog(app.pid,pkg);await waitFor(s,"document.querySelectorAll('.act-source').length===3",'hash package');
  const paused=await call(s,{operation:'activity_set_paused',paused:true});probe('actual_pause_precedes_binary_change',paused.kind==='activity_pause_acknowledged'&&paused.paused===true&&(await overview(s)).producer.paused===true);if(paused.kind!=='activity_pause_acknowledged'||paused.paused!==true)throw Error('Hash rehearsal requires actual pause');
  const tree=fixtureTree(manifest.dataRoot);
  try {
    if(missing)rmSync(binary);else writeFileSync(binary,Buffer.concat([original,Buffer.from('SYNTHETIC_ACTIVITY_HASH_PROBE')]));
    probe('owned_binary_change_really_breaks_manifest_hash',missing?!existsSync(binary):hash(readFileSync(binary))!==manifest.binaryHash.toLowerCase());
    if(missing)probe('development_runner_exists_while_installed_runner_is_absent',existsSync(resolve(import.meta.dirname,'../../../target/release/enouia-activity.exe'))&&!existsSync(binary));
    const replies=await Promise.all([overview(s),call(s,{operation:'activity_preview_public_payload'}),call(s,{operation:'activity_get_days',source:'github',from:'2026-01-01',to:'2026-12-31'})]);
    probe('cached_reads_refuse_changed_runner',replies.every(r=>r.kind==='activity_error'&&r.error?.code==='unconfigured'&&r.error.retryable===false));
    const pause=await call(s,{operation:'activity_set_paused',paused:false});probe('pause_refuses_changed_runner',pause.kind==='activity_error'&&pause.error?.code==='unconfigured');
    for(const[number,operation]of[[1,'activity_run_now'],[2,'activity_retry_pending']]){
      const accepted=await call(s,{operation});probe(''+number+'_run_is_correlated_to_native_id',accepted.kind==='activity_run_accepted'&&typeof accepted.runId==='string');if(accepted.kind!=='activity_run_accepted')throw Error('Hash run not admitted');
      let status;const deadline=Date.now()+10000;do{status=await call(s,{operation:'activity_get_run',runId:accepted.runId});if(['completed','failed','blocked'].includes(status.stage))break;await sleep(50);}while(Date.now()<deadline);
      probe(''+number+'_terminal_refuses_changed_runner',status.kind==='activity_run_status'&&status.runId===accepted.runId&&status.operation===operation&&status.stage==='failed'&&status.error?.code==='unconfigured'&&status.summary===null);
    }
    await press(s,'Refresh');await waitFor(s,has('The installed Activity package is missing, changed'),'hash read failure');probe('changed_runner_error_clears_cards_and_disables_mutation',await s.evaluate("document.querySelectorAll('.act-source').length===0")&&await disabled(s,'Run now')&&await disabled(s,'Retry pending')&&await disabled(s,'Pause activity sync'));
    probe('changed_runner_attempts_preserve_complete_paused_store',fixtureTree(manifest.dataRoot)===tree);
    if(startupMissing){
      const saved=readFileSync(settings);s.close();app.kill();await app.exited;app=launch();s=await connect();await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");await waitFor(s,has('Connect the installed Activity producer'),'missing runner startup gate');
      probe('restart_shows_actual_unconfigured_gate',await s.evaluate("document.querySelectorAll('.act-source').length===0"));
      const startup=await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'status'})");probe('startup_does_not_invent_clear_or_save_failure',startup.configured===false&&!Object.hasOwn(startup,'saved'));
      probe('restart_preserves_exact_saved_choice',existsSync(settings)&&readFileSync(settings).equals(saved));
      probe('startup_reads_refuse_and_preserve_paused_store',(await overview(s)).error?.code==='unconfigured'&&fixtureTree(manifest.dataRoot)===tree);
      const cleared=await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'clear'})");if(cleared.configured!==false||cleared.saved!==true)throw Error('Missing startup choice did not clear');
    }else{await press(s,'Change package');await waitFor(s,has('Connect the installed Activity producer'),'hash forget');}
    probe('actual_forget_removes_owned_saved_choice',!existsSync(settings));
    await press(s,'Choose installed package…');fillDialog(app.pid,pkg);await waitFor(s,has(missing?'That folder is not an installed Activity package':"The package's runner no longer matches its recorded hash"),'actual hash selection refusal');probe('actual_selection_refuses_changed_binary',true);
    const status=await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'status'})");probe('refused_selection_leaves_native_unconfigured',status.configured===false&&!existsSync(settings));
  }finally{writeFileSync(binary,original);}
  probe('original_runner_bytes_restore_exactly',readFileSync(binary).equals(original)&&hash(readFileSync(binary))===manifest.binaryHash.toLowerCase());
  await press(s,'Choose installed package…');fillDialog(app.pid,pkg);await waitFor(s,"document.querySelectorAll('.act-source').length===3",'restored runner reselection');probe('actual_reselection_recovers_three_histories',true);
  const resume=await call(s,{operation:'activity_set_paused',paused:false});probe('actual_resume_accepts_restored_runner',resume.kind==='activity_pause_acknowledged'&&resume.paused===false&&(await overview(s)).producer.paused===false);
  const recovered=fixtureImage(manifest.dataRoot);probe('archive_sequence_and_pending_stay_exact',recovered.activity===image.activity&&recovered.sequence===image.sequence&&recovered.pending===image.pending);probe('only_pause_resume_add_two_generations',readdirSync(join(manifest.dataRoot,'generations')).length===count+2);
  s.close();app.kill();await app.exited;app=launch();s=await connect();await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");await waitFor(s,"document.querySelectorAll('.act-source').length===3",'restored runner restart');probe('restart_reconnects_restored_verified_choice',true);
  const clear=await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'clear'})");probe('final_clear_removes_owned_choice',clear.configured===false&&clear.saved===true&&!existsSync(settings));await shot(s,'01-runner-hash-recovery');s.close();app.kill();await app.exited;
}

async function savedChoiceBoundaryMain() {
  if(existsSync(settings)||realpathSync(manifest.dataRoot).toLowerCase()!==join(realpathSync(dirname(pkg)),'data').toLowerCase()||basename(pkg)!=='package')throw Error('Saved-choice boundary requires a new owned fixture');
  const tree=fixtureTree(manifest.dataRoot),cases=[['relative',JSON.stringify({installRoot:'package'})],['oversized',JSON.stringify({installRoot:pkg})+' '.repeat(65537)],['malformed','{"installRoot":']];
  check('SB.only_owned_synthetic_choice_is_used',true);
  let app,s;
  for(const[name,text]of cases){
    writeFileSync(settings,text);const original=readFileSync(settings);app=launch();s=await connect();await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");await waitFor(s,"document.body.innerText.includes('Connect the installed Activity producer')||document.querySelectorAll('.act-source').length===3",'saved-choice startup result');
    const status=await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'status'})"),read=await overview(s);
    check('SB.'+name+'_native_status_refuses_invalid_choice',status.configured===false&&!Object.hasOwn(status,'saved'));
    check('SB.'+name+'_native_read_refuses_invalid_choice',read.kind==='activity_error'&&read.error?.code==='unconfigured');
    check('SB.'+name+'_page_shows_gate_without_history',await s.evaluate("document.body.innerText.includes('Connect the installed Activity producer')&&document.querySelectorAll('.act-source').length===0"));
    check('SB.'+name+'_retains_exact_invalid_settings',readFileSync(settings).equals(original));
    check('SB.'+name+'_preserves_complete_activity_store',fixtureTree(manifest.dataRoot)===tree);
    if(name!=='malformed'){s.close();app.kill();await app.exited;}
  }
  await press(s,'Choose installed package…');fillDialog(app.pid,pkg);await waitFor(s,"document.querySelectorAll('.act-source').length===3",'saved-choice actual recovery');
  const choice=JSON.parse(readFileSync(settings,'utf8'));
  const ordinaryRoot=choice.installRoot.startsWith('\\\\?\\')?choice.installRoot.slice(4):choice.installRoot;
  check('SB.real_picker_recovers_canonical_absolute_choice',isAbsolute(choice.installRoot)&&realpathSync(ordinaryRoot)===realpathSync(pkg));
  const configured=await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'status'})");check('SB.actual_recovery_reports_verified_saved',configured.configured===true&&configured.saved===true);
  check('SB.recovery_preserves_complete_activity_store',fixtureTree(manifest.dataRoot)===tree);
  const clear=await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'clear'})");check('SB.final_clear_removes_owned_choice',clear.configured===false&&clear.saved===true&&!existsSync(settings));await shot(s,'01-saved-choice-boundary-recovered');s.close();app.kill();await app.exited;
}

async function runRemountMain() {
  if(existsSync(settings))throw Error('Run-remount requires absent settings');
  const base=realpathSync(dirname(pkg)),config=JSON.parse(readFileSync(join(pkg,'activity-config.json'),'utf8')),tools=join(base,'tools'),standin=join(tools,'ssh.exe'),descendant=join(tools,'descendant.exe'),linger=join(base,'traces','linger-ssh.json'),hash=b=>createHash('sha256').update(b).digest('hex');
  if(realpathSync(manifest.dataRoot).toLowerCase()!==join(base,'data').toLowerCase()||config.mode!=='sandbox'||config.delivery?.restrictedAlias!=='sandbox-handback'||!config.delivery.publicOrigin.startsWith('http://127.0.0.1:')||realpathSync(config.delivery.sshExecutable).toLowerCase()!==realpathSync(standin).toLowerCase()||readFileSync(join(base,'ACTIVITY_SANDBOX_FIXTURE'),'utf8')!=='enouia-activity-isolated-handback-v1'||existsSync(descendant)||existsSync(linger))throw Error('Run-remount fixture must be new, contained and loopback-only');
  if(hash(readFileSync(standin))!==hash(readFileSync(resolve(import.meta.dirname,'../../../target/release/examples/sandbox_tools.exe'))))throw Error('Only the known development stand-in is allowed');copyFileSync(standin,descendant);
  check('RM.only_known_marked_loopback_test_tools_are_used',true);let app=launch(),s=await connect();
  await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");await waitFor(s,has('Connect the installed Activity producer'),'run-remount gate');await press(s,'Choose installed package…');fillDialog(app.pid,pkg);await waitFor(s,"[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Run now'&&!b.disabled)",'run-remount reads');
  await s.evaluate(`(()=>{const real=window.fetch,url=window.__TAURI_INTERNALS__.convertFileSrc('activity_call','ipc');window.__remountStarts=0;window.__remountId=null;window.fetch=async(u,o)=>{const response=await real(u,o);if(u===url&&JSON.parse(o.body).request.operation==='activity_run_now'){window.__remountStarts++;window.__remountId=(await response.clone().json()).runId;}return response;};return true;})()`);
  await press(s,'Run now');await waitFor(s,'typeof window.__remountId===\"string\"','actual started run');const runId=await s.evaluate('window.__remountId');
  const deadline=Date.now()+10000;while(!existsSync(linger)&&Date.now()<deadline)await sleep(50);if(!existsSync(linger))throw Error('Actual owned SSH linger did not start');check('RM.actual_owned_standin_run_is_in_progress',true);
  check('RM.local_run_initially_disables_operations',await disabled(s,'Run now')&&await disabled(s,'Pause activity sync')&&await disabled(s,'Change package'));
  await s.evaluate("document.querySelector('nav button[aria-label=\"Home\"]').click()");await waitFor(s,"!document.querySelector('.act-surface')",'run unmount');await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");await waitFor(s,"document.querySelectorAll('.act-source').length===3",'active run remount');
  const [observed,status]=await Promise.all([overview(s),call(s,{operation:'activity_get_run',runId})]);check('RM.remounted_native_host_still_reports_running',observed.schedule.mode==='running'&&status.stage==='running');if(observed.schedule.mode!=='running'||status.stage!=='running')throw Error('Active native bracket required before checking remounted controls');
  check('RM.remounted_page_has_no_invented_local_run_record',await s.evaluate("!document.querySelector('.act-run')"));
  check('RM.remounted_running_host_disables_all_mutations',await disabled(s,'Run now')&&await disabled(s,'Retry pending')&&await disabled(s,'Pause activity sync')&&await disabled(s,'Change package'));
  let terminal;const end=Date.now()+15000;do{terminal=await call(s,{operation:'activity_get_run',runId});if(['completed','failed','blocked'].includes(terminal.stage))break;await sleep(100);}while(Date.now()<end);
  check('RM.same_actual_run_reaches_terminal_status',terminal.kind==='activity_run_status'&&terminal.runId===runId&&['completed','failed','blocked'].includes(terminal.stage));
  await press(s,'Refresh');await waitFor(s,has('#88'),'finished run remount refresh');const final=await overview(s);
  check('RM.finished_refresh_recovers_operation_controls',await s.evaluate("[...document.querySelectorAll('button')].filter(b=>['Run now','Retry pending','Pause activity sync','Change package'].includes(b.textContent.trim())).every(b=>!b.disabled)"));
  check('RM.remount_never_sends_a_second_start',await s.evaluate('window.__remountStarts===1'));
  check('RM.actual_pending_is_retained_after_failed_loopback_observation',final.schedule.mode==='idle'&&final.pending?.sequence===88&&final.producer.highestReserved===88&&final.pending.failureCount===1);
  await press(s,'Change package');await waitFor(s,has('Connect the installed Activity producer'),'run-remount forgotten');check('RM.owned_choice_is_cleared',!existsSync(settings));await shot(s,'01-run-remount-recovered');s.close();app.kill();await app.exited;
}

async function windowScopeMain() {
  if(existsSync(settings))throw Error('Window scope requires absent settings');
  if(realpathSync(manifest.dataRoot).toLowerCase()!==join(realpathSync(dirname(pkg)),'data').toLowerCase())throw Error('Window-scope escaped synthetic root');
  const before=fixtureTree(manifest.dataRoot),app=launch(),main=await connect();await main.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");await waitFor(main,has('Connect the installed Activity producer'),'window scope gate');await press(main,'Choose installed package…');fillDialog(app.pid,pkg);await waitFor(main,"document.querySelectorAll('.act-source').length===3",'window scope actual package');
  check('WS.main_selects_real_synthetic_package',existsSync(settings));const saved=readFileSync(settings),preview=await call(main,{operation:'activity_preview_public_payload'});check('WS.main_reads_three_source_histories',preview.kind==='activity_public_preview'&&Object.keys(preview.data.sources).length===3);
  await main.evaluate("window.__TAURI_INTERNALS__.invoke('shell_search')");const overlay=await connect(true);check('WS.owned_quick_search_window_label_is_verified',await overlay.evaluate("window.__TAURI_INTERNALS__.metadata.currentWindow.label==='overlay'"));
  const requests=[['overview',{operation:'activity_get_overview'}],['preview',{operation:'activity_preview_public_payload'}],['days',{operation:'activity_get_days',source:'github',from:'2026-01-01',to:'2026-12-31'}],['run_record',{operation:'activity_get_run',runId:'run-synthetic'}],['run_now',{operation:'activity_run_now'}],['retry_pending',{operation:'activity_retry_pending'}],['pause',{operation:'activity_set_paused',paused:true}],['resume',{operation:'activity_set_paused',paused:false}]];
  const denied=async(command,args)=>overlay.evaluate(`(async()=>{try{await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)});return false;}catch(error){const text=String(error);return (text.includes('not allowed')||text==='permission_denied')&&!text.includes(${JSON.stringify(pkg)})&&!text.includes(${JSON.stringify(settings)});}})()`);
  for(const[id,request]of requests)check('WS.overlay_refuses_'+id,await denied('activity_call',{request}));
  for(const action of ['status','clear','select'])check('WS.overlay_refuses_setup_'+action,await denied('activity_setup',{action}));
  check('WS.denials_preserve_exact_saved_choice',readFileSync(settings).equals(saved));check('WS.denials_preserve_complete_activity_store',fixtureTree(manifest.dataRoot)===before);
  const actual=await call(main,{operation:'activity_preview_public_payload'});check('WS.main_read_keeps_same_public_history',actual.kind==='activity_public_preview'&&actual.sha256===preview.sha256);
  await overlay.evaluate("window.__TAURI_INTERNALS__.invoke('shell_show').then(()=>window.__TAURI_INTERNALS__.invoke('shell_hide'))");check('WS.overlay_keeps_its_allowed_show_hide_scope',true);overlay.close();
  await press(main,'Change package');await waitFor(main,has('Connect the installed Activity producer'),'window scope clear');check('WS.main_final_clear_removes_owned_choice',!existsSync(settings));await shot(main,'01-window-scope');main.close();app.kill();await app.exited;
}

async function setupRunningMain() {
  if(existsSync(settings))throw Error('Run-remount requires absent settings');
  const base=realpathSync(dirname(pkg)),config=JSON.parse(readFileSync(join(pkg,'activity-config.json'),'utf8')),tools=join(base,'tools'),standin=join(tools,'ssh.exe'),descendant=join(tools,'descendant.exe'),linger=join(base,'traces','linger-ssh.json'),hash=b=>createHash('sha256').update(b).digest('hex');
  if(realpathSync(manifest.dataRoot).toLowerCase()!==join(base,'data').toLowerCase()||config.mode!=='sandbox'||config.delivery?.restrictedAlias!=='sandbox-handback'||!config.delivery.publicOrigin.startsWith('http://127.0.0.1:')||realpathSync(config.delivery.sshExecutable).toLowerCase()!==realpathSync(standin).toLowerCase()||readFileSync(join(base,'ACTIVITY_SANDBOX_FIXTURE'),'utf8')!=='enouia-activity-isolated-handback-v1'||existsSync(descendant)||existsSync(linger))throw Error('Run-remount fixture must be new, contained and loopback-only');
  if(hash(readFileSync(standin))!==hash(readFileSync(resolve(import.meta.dirname,'../../../target/release/examples/sandbox_tools.exe'))))throw Error('Only the known development stand-in is allowed');copyFileSync(standin,descendant);
  check('SG.known_owned_loopback_tools_are_verified',true);let app=launch(),s=await connect();

  await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");await waitFor(s,has('Connect the installed Activity producer'),'setup-running gate');await press(s,'Choose installed package…');fillDialog(app.pid,pkg);await waitFor(s,"document.querySelectorAll('.act-source').length===3",'setup-running package');const saved=readFileSync(settings);
  if(mode==='--setup-dialog-race'){
    await s.evaluate("window.__dialogRace=null;window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'select'}).then(reply=>window.__dialogRace={reply},error=>window.__dialogRace={error:String(error)});true");
    const owned=powershell(`Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A=[System.Windows.Automation.AutomationElement]
$C=[System.Windows.Automation.PropertyCondition]
for($i=0;$i -lt 40;$i++){
  foreach($w in $A::RootElement.FindAll([System.Windows.Automation.TreeScope]::Descendants,(New-Object $C($A::ClassNameProperty,'#32770')))){if($w.Current.ProcessId -eq ${app.pid}){Write-Output 'owned-dialog';exit 0}}
  Start-Sleep -Milliseconds 100
}
throw 'no owned picker'`);
    check('DG.actual_owned_picker_precedes_run',owned==='owned-dialog'&&await s.evaluate('window.__dialogRace===null'));
  }
  const accepted=await call(s,{operation:'activity_run_now'});if(accepted.kind!=='activity_run_accepted')throw Error('Actual run required');const runId=accepted.runId;const ready=Date.now()+10000;while(!existsSync(linger)&&Date.now()<ready)await sleep(50);if(!existsSync(linger))throw Error('Owned linger missing');check('SG.actual_run_precedes_setup_changes',(await call(s,{operation:'activity_get_run',runId})).stage==='running');
  if(mode==='--setup-dialog-race'){
    fillDialog(app.pid,pkg);await waitFor(s,'window.__dialogRace!==null','post-dialog busy reply');
    check('DG.confirmed_picker_refuses_new_active_run',(await s.evaluate('window.__dialogRace')).error==='busy');
    check('DG.post_dialog_preserves_exact_saved_choice',existsSync(settings)&&readFileSync(settings).equals(saved));
  }

  const status=await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'status'})");check('SG.status_reads_current_choice_during_run',status.configured===true&&status.saved===true);
  await s.evaluate("window.__setupAttempt=null;window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'select'}).then(reply=>window.__setupAttempt={reply},error=>window.__setupAttempt={error:String(error)});true");await sleep(500);
  if(!(await s.evaluate('window.__setupAttempt!==null'))){fillDialog(app.pid,null);await waitFor(s,'window.__setupAttempt!==null','old native dialog cancellation');}
  const selected=await s.evaluate('window.__setupAttempt');check('SG.select_refuses_active_run_with_busy',selected.error==='busy');
  const clear=await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'clear'}).then(reply=>({reply}),error=>({error:String(error)}))");check('SG.clear_refuses_active_run_with_busy',clear.error==='busy');check('SG.refused_clear_preserves_exact_saved_choice',existsSync(settings)&&readFileSync(settings).equals(saved));
  // A failing old baseline may actually clear. Restore only its owned choice
  // through the real picker before waiting for the original run.
  if(clear.reply?.configured===false){await s.evaluate("window.__restoreChoice=null;window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'select'}).then(r=>window.__restoreChoice=r);true");fillDialog(app.pid,pkg);await waitFor(s,'window.__restoreChoice?.configured===true','baseline owned choice recovery');}
  const still=await call(s,{operation:'activity_get_run',runId});check('SG.same_run_still_active_after_setup_attempts',still.stage==='running');
  const connected=await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'status'})");check('SG.native_choice_remains_connected',connected.configured===true&&connected.saved===true);
  let terminal;const end=Date.now()+15000;do{terminal=await call(s,{operation:'activity_get_run',runId});if(['completed','failed','blocked'].includes(terminal.stage))break;await sleep(100);}while(Date.now()<end);check('SG.original_run_reaches_terminal',terminal.runId===runId&&['completed','failed','blocked'].includes(terminal.stage));
  const final=await overview(s);check('SG.terminal_run_retains_actual_pending',final.pending?.sequence===88&&final.pending.failureCount===1&&final.producer.highestReserved===88);
  await s.evaluate("window.__afterSelect=null;window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'select'}).then(r=>window.__afterSelect=r);true");fillDialog(app.pid,null);await waitFor(s,'window.__afterSelect!==null','terminal allowed picker');check('SG.terminal_reopens_native_picker',await s.evaluate('window.__afterSelect.cancelled===true'));
  const forgotten=await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'clear'})");check('SG.terminal_accepts_clear_and_removes_choice',forgotten.configured===false&&forgotten.saved===true&&!existsSync(settings));await shot(s,'01-setup-running-recovered');s.close();app.kill();await app.exited;
}

async function readContractMain(exportContract = false) {
  const prefix=exportContract?'X.':'V.';
  const privateMarker='SYNTHETIC_PRIVATE_MARKER';
  rmSync(settings,{force:true});
  if(realpathSync(manifest.dataRoot).toLowerCase()!==join(realpathSync(dirname(pkg)),'data').toLowerCase()) throw new Error('Read-contract acceptance requires the contained synthetic data root');
  const before=fixtureTree(manifest.dataRoot), app=launch(), s=await connect();
  await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
  await waitFor(s,has('Connect the installed Activity producer'),'read-contract gate');
  await press(s,'Choose installed package…'); fillDialog(app.pid,pkg);
  await waitFor(s,has('Publication observed'),'actual valid source data');
  check(prefix+'actual_package_connects',true);
  const actual=await call(s,{operation:'activity_preview_public_payload'});
  check(prefix+'actual_three_source_snapshot',actual.kind==='activity_public_preview'&&Object.keys(actual.data.sources).length===3);
  if(exportContract) await s.evaluate("Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async text=>{window.__capturedActivityCopy=text;}});true");
  const cases=exportContract ? [
    ["extra_overview","activity_overview","reply.rawConfig='SYNTHETIC_PRIVATE_MARKER';"],
    ["extra_summary","activity_overview","reply.sources.github.rawTitle='SYNTHETIC_PRIVATE_MARKER';"],
    ["extra_schedule","activity_overview","reply.schedule.configPath='SYNTHETIC_PRIVATE_MARKER';"],
    ["extra_task","activity_overview","reply.schedule.task={registered:false,enabled:null,rawXml:'SYNTHETIC_PRIVATE_MARKER'};"],
    ["extra_delivery","activity_overview","reply.delivery.rawStderr='SYNTHETIC_PRIVATE_MARKER';"],
    ["extra_producer","activity_overview","reply.producer.environment='SYNTHETIC_PRIVATE_MARKER';"],
    ["extra_health","activity_overview","reply.health[0].privatePath='SYNTHETIC_PRIVATE_MARKER';"],
    ["raw_generated_time","activity_overview","reply.generatedAt='SYNTHETIC_PRIVATE_MARKER';"],
    ["raw_health_id","activity_overview","reply.health[0].id='SYNTHETIC_PRIVATE_MARKER';"],
    ["extra_preview","activity_public_preview","reply.rawConfig='SYNTHETIC_PRIVATE_MARKER';"],
    ["extra_public_data","activity_public_preview","reply.data.privatePath='SYNTHETIC_PRIVATE_MARKER';"],
    ["extra_snapshot","activity_public_preview","reply.data.sources.github.rawReport='SYNTHETIC_PRIVATE_MARKER';"],
    ["extra_day","activity_public_preview","reply.data.sources.github.days[0].rawTitle='SYNTHETIC_PRIVATE_MARKER';"],
    ["raw_snapshot_time","activity_public_preview","reply.data.sources.github.updatedAt='SYNTHETIC_PRIVATE_MARKER';"],
  ] : [
    ['github_metric','activity_overview',"reply.sources.github.metric='tokens';"],
    ['codex_timezone','activity_overview',"reply.sources.codex.timezone='Asia/Shanghai';"],
    ['extra_overview_source','activity_overview',"reply.sources.claude_design=reply.sources.claude;"],
    ['overview_impossible_date','activity_overview',"reply.sources.github.firstDate='2026-02-30';"],
    ['claude_preview_metric','activity_public_preview',"reply.data.sources.claude.metric='contributions';"],
    ['preview_impossible_date','activity_public_preview',"reply.data.sources.github.days[0].date='2026-02-30';"],
    ['preview_duplicate_date','activity_public_preview',"reply.data.sources.codex.days[1].date=reply.data.sources.codex.days[0].date;"],
    ['preview_unsafe_total','activity_public_preview',"reply.data.sources.codex.days[0].value=Number.MAX_SAFE_INTEGER;reply.data.sources.codex.days[1].value=1;"],
    ['preview_unsorted_days','activity_public_preview',"reply.data.sources.github.days.reverse();"],
  ];
  for(const [id,kind,transform] of cases) {
    await s.evaluate(`(()=>{window.__contractReplyDone=false;const callbacks=window.__TAURI_INTERNALS__.callbacks,before=new Set(callbacks.keys());[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Refresh').click();const added=[...callbacks.keys()].filter(id=>!before.has(id));if(added.length!==4)throw Error('Expected two Activity reads');for(const key of added){const original=callbacks.get(key);callbacks.set(key,reply=>{if(reply?.kind===${JSON.stringify(kind)}){${transform}window.__contractReplyDone=true;}original(reply);});}return true;})()`);
    await waitFor(s,"window.__contractReplyDone===true",'modeled invalid reply '+id);
    await new Promise(resolve=>setTimeout(resolve,200));
    const rejected=await s.evaluate(`${has('The response did not match Activity IPC v1')} && document.querySelectorAll('.act-source').length===0`);
    check(prefix+'rejects_'+id,rejected);
    if(id==='preview_impossible_date'&&rejected) await shot(s,'01-invalid-source-date');
    if(exportContract&&id==='extra_overview') {
      await s.evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Copy diagnostic summary').click();true");
      await new Promise(resolve=>setTimeout(resolve,100));
      check('X.private_extension_never_reaches_copy',await s.evaluate(`!String(window.__capturedActivityCopy??'').includes(${JSON.stringify(privateMarker)})`));
    }
    if(exportContract&&id==='extra_day') {
      await s.evaluate("document.querySelector('.act-payload summary')?.click();true");
      await new Promise(resolve=>setTimeout(resolve,100));
      check('X.private_day_title_never_reaches_preview',!(await s.evaluate(has(privateMarker))));
      if(rejected) await shot(s,'01-private-fields-refused',false);
    }
    await press(s,'Refresh'); await waitFor(s,has('Publication observed'),'real read recovers '+id);
    check(prefix+'recovers_'+id,await s.evaluate("document.querySelectorAll('.act-source').length===3"));
  }
  check(prefix+'invalid_replies_preserve_actual_store',fixtureTree(manifest.dataRoot)===before);
  if(exportContract) {
    await s.evaluate("window.__capturedActivityCopy=null;[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Copy diagnostic summary').click();true");
    await waitFor(s,"typeof window.__capturedActivityCopy==='string'",'actual sanitized copy');
    check('X.real_sanitized_copy_recovers',await s.evaluate(`JSON.parse(window.__capturedActivityCopy).kind==='activity_overview' && !window.__capturedActivityCopy.includes(${JSON.stringify(privateMarker)})`));
  }
  check(prefix+'paths_stay_private',!(await s.evaluate(`document.body.innerText.includes(${JSON.stringify(pkg)})`)));
  await press(s,'Change package');await waitFor(s,has('Connect the installed Activity producer'),'clear contract-read choice');
  check(prefix+'choice_is_cleared',!existsSync(settings));
  s.close();app.kill();await app.exited;
}

async function fullDaysMain() {
  rmSync(settings,{force:true});
  if(realpathSync(manifest.dataRoot).toLowerCase() !== join(realpathSync(dirname(pkg)),'data').toLowerCase()) throw new Error('Recorded-days acceptance requires the contained synthetic data root');
  const treeBefore=fixtureTree(manifest.dataRoot);
  const app=launch();
  const s=await connect();
  await key(s,'5',2);
  await waitFor(s,has('Connect the installed Activity producer'),'recorded-days keyboard gate');
  check('T.shortcut_opens_activity',true);
  await activate(s,'Choose installed package…');
  fillDialog(app.pid,pkg);
  await waitFor(s,has('Publication observed'),'recorded-days package selection');
  const payload=await call(s,{operation:'activity_preview_public_payload'});
  check('T.actual_preview_has_three_histories', payload.kind==='activity_public_preview' && ['github','codex','claude'].every(id=>payload.data.sources[id].days.length>14));
  for(const id of ['github','codex','claude']) {
    const selector=`section[aria-labelledby="act-${id}"] .act-table`;
    const days=payload.data.sources[id].days;
    await activate(s,'Recent recorded days',`${selector} > summary`);
    const rows=()=>s.evaluate(`[...document.querySelectorAll(${JSON.stringify(`${selector} tbody tr`)})].map(row=>({date:row.querySelector('time').dateTime,value:row.querySelector('td').textContent.replaceAll(',','')}))`);
    const recent=days.slice(-14).reverse().map(day=>({date:day.date,value:String(day.value)}));
    check(`T.${id}_recent_days_are_exact`, JSON.stringify(await rows())===JSON.stringify(recent));
    const available=await s.evaluate(`[...document.querySelectorAll(${JSON.stringify(`${selector} button`)})].some(button=>button.textContent.trim()==='Show all recorded days')`);
    check(`T.${id}_all_days_control_exists`,available);
    if(available) {
      await activate(s,'Show all recorded days',`${selector} button`);
      const expected=days.slice().reverse().map(day=>({date:day.date,value:String(day.value)}));
      check(`T.${id}_all_recorded_days_are_exact`,JSON.stringify(await rows())===JSON.stringify(expected) && await s.evaluate(`document.activeElement.matches(${JSON.stringify(`${selector} button`)}) && document.activeElement.getAttribute('aria-expanded')==='true'`),`${days.length} recorded days`);
      if(id==='github') await shot(s,'01-full-days-keyboard',false);
      await activate(s,'Show recent days',`${selector} button`);
    } else check(`T.${id}_all_recorded_days_are_exact`,false,'No keyboard control exposes older recorded days');
    check(`T.${id}_recent_view_restores`,JSON.stringify(await rows())===JSON.stringify(recent));
  }
  check('T.history_controls_preserve_activity_bytes',fixtureTree(manifest.dataRoot)===treeBefore);
  await activate(s,'Change package');
  await waitFor(s,has('Connect the installed Activity producer'),'recorded-days package cleared');
  check('T.keyboard_change_package_forgets_choice',!existsSync(settings));
  s.close();app.kill();await app.exited;
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
  let expectedMemories = 1;
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

  if (indexMode) {
    // The Vault above is freshly created by this process outside Git. Only
    // the pinned Core operates on it; Activity never receives its root.
    if (realpathSync(manifest.dataRoot).toLowerCase() !== realpathSync(join(dirname(pkg), 'data')).toLowerCase()) throw new Error('Index isolation requires the prepared synthetic Activity data root');
    let treeBefore = fixtureTree(manifest.dataRoot);
    const plan = await memoryCall(s, 'review_plan', {decisions:[{candidateId:remembered.result.candidateId,revision:remembered.result.revision,action:'accept',editedContent:null,mergeTarget:null}]});
    if (!plan.result?.planId) throw new Error(`Synthetic review plan: ${plan.error?.code}`);
    const confirmed = await memoryCall(s, 'review_confirm', {planId:plan.result.planId,diffHash:plan.result.diffHash}, true);
    check('I.synthetic_memory_is_approved', !confirmed.error && (await memoryCall(s,'memory_list',{cursor:null,limit:25,includeInactive:false})).result?.total === 1);
    if (overlapMode) {
      // Seed only through the pinned Core, below its 20,000-character text
      // and 20-decision limits. Nothing writes canonical files directly.
      for (let batch=0; batch<12; batch++) {
        const decisions=[];
        for (let item=0; item<20; item++) {
          const number=batch*20+item;
          const text=`Synthetic rebuild overlap record ${number}. ` + Array.from({length:240},(_,n)=>createHash('sha256').update(`synthetic-overlap-${number}-${n}`).digest('hex')).join(' ');
          const candidate=await memoryCall(s,'remember',{text,claimKey:`synthetic.overlap.${number}`},true);
          if(!candidate.result?.candidateId) throw new Error(`Overlap candidate: ${candidate.error?.code}`);
          decisions.push({candidateId:candidate.result.candidateId,revision:candidate.result.revision,action:'accept',editedContent:null,mergeTarget:null});
        }
        const shown=await memoryCall(s,'review_plan',{decisions});
        if(!shown.result?.planId) throw new Error(`Overlap plan: ${shown.error?.code}`);
        const accepted=await memoryCall(s,'review_confirm',{planId:shown.result.planId,diffHash:shown.result.diffHash},true);
        if(accepted.error) throw new Error(`Overlap confirmation: ${accepted.error.code}`);
        console.log(`Prepared synthetic overlap memories: ${(batch+1)*20}`);
      }
      expectedMemories=241;
      check('O.synthetic_core_seed_is_approved', (await memoryCall(s,'memory_list',{cursor:null,limit:25,includeInactive:false})).result?.total === expectedMemories, `${expectedMemories} approved synthetic memories`);
    }
    const overlapCanonical=overlapMode ? fixtureTree(join(vault,'vault')) : null;
    let rebuild = await memoryCall(s, 'index_rebuild');
    check('I.pinned_core_index_rebuild_starts', typeof rebuild.result?.operationId === 'string');
    if (!rebuild.result?.operationId) throw new Error(`Synthetic rebuild: ${rebuild.error?.code}`);
    const overlapBefore=overlapMode ? (await memoryCall(s,'operation_get',{operationId:rebuild.result.operationId})).result : null;
    const overlapStart=Date.now();
    const [read, payload] = await Promise.all([overview(s), call(s,{operation:'activity_preview_public_payload'})]);
    if (overlapMode) {
      const after=(await memoryCall(s,'operation_get',{operationId:rebuild.result.operationId})).result;
      check('O.activity_reads_bracketed_by_running_rebuild', overlapBefore?.state === 'running' && after?.state === 'running' && after.operationId === overlapBefore.operationId, JSON.stringify({before:overlapBefore,after,activityReadElapsedMs:Date.now()-overlapStart}));
    }
    check('I.activity_reads_survive_index_rebuild', read.kind === 'activity_overview' && read.producer.highestReserved === o.producer.highestReserved && read.pending === null && payload.sha256 === preview.sha256);
    if (mode === '--rebuild-mutations') {
      const image=fixtureImage(manifest.dataRoot);
      const before=(await memoryCall(s,'operation_get',{operationId:rebuild.result.operationId})).result;
      const start=Date.now();
      const pause=await call(s,{operation:'activity_set_paused',paused:true});
      check('W.pause_commits_while_core_rebuild_runs', pause.kind === 'activity_pause_acknowledged' && pause.paused === true && (await overview(s)).producer.paused === true);
      const resume=await call(s,{operation:'activity_set_paused',paused:false});
      check('W.resume_commits_while_core_rebuild_runs', resume.kind === 'activity_pause_acknowledged' && resume.paused === false && (await overview(s)).producer.paused === false);
      const after=(await memoryCall(s,'operation_get',{operationId:rebuild.result.operationId})).result;
      check('W.mutations_bracketed_by_running_rebuild', before?.state === 'running' && after?.state === 'running' && before.operationId === after.operationId, JSON.stringify({before,after,activityMutationElapsedMs:Date.now()-start}));
      check('W.activity_mutations_preserve_canonical_vault', fixtureTree(join(vault,'vault')) === overlapCanonical);
      const next=fixtureImage(manifest.dataRoot);
      check('W.pause_resume_preserve_archive_sequence_pending_delivery', next.activity === image.activity && next.sequence === image.sequence && next.pending === image.pending && JSON.stringify(next.delivery) === JSON.stringify(image.delivery));
      const treeAfter=fixtureTree(manifest.dataRoot);
      check('W.pause_resume_intentionally_advance_generations', next.generation !== image.generation && treeAfter !== treeBefore);
      // Producer mutations intentionally commit operational generations.
      // The remaining Core worker must leave this new baseline unchanged.
      treeBefore=treeAfter;
    }
    if (['--rebuild-cancel', '--rebuild-partial'].includes(mode)) {
      const originalId=rebuild.result.operationId;
      if (mode === '--rebuild-partial') {
        let progress;
        const end=Date.now()+30000;
        do {
          progress=(await memoryCall(s,'operation_get',{operationId:originalId})).result;
          if(progress?.state !== 'running' || progress.progress.done >= 1) break;
          await sleep(20);
        } while(Date.now()<end);
        check('K.partial_worker_progress_is_observed', progress?.state === 'running' && progress.progress.done >= 1, JSON.stringify(progress));
      }
      const cancel=await memoryCall(s,'operation_cancel',{operationId:originalId});
      check('K.running_rebuild_accepts_cancellation', cancel.result?.cancelRequested === true && cancel.result.operationId === originalId, JSON.stringify(cancel.result));
      let stopped;
      const end=Date.now()+30000;
      do {
        stopped=(await memoryCall(s,'operation_get',{operationId:originalId})).result;
        if(stopped && ['succeeded','failed','cancelled'].includes(stopped.state)) break;
        await sleep(100);
      } while(Date.now()<end);
      check('K.worker_reaches_actual_cancelled_state', stopped?.state === 'cancelled' && stopped.result?.cancelled === true && stopped.result.reachedHead === false, JSON.stringify(stopped));
      if (mode === '--rebuild-partial') {
        check('K.partial_cancel_keeps_committed_watermark', stopped?.result?.commitsApplied > 0 && stopped.result.commitsApplied < 496 && stopped.result.watermarkSequence === stopped.result.commitsApplied, JSON.stringify(stopped?.result));
      }
      check('K.cancel_preserves_canonical_vault', fixtureTree(join(vault,'vault')) === overlapCanonical);
      check('K.cancel_preserves_activity_bytes', fixtureTree(manifest.dataRoot) === treeBefore);
      if (mode === '--rebuild-partial') {
        // Ordinary search uses the existing index update path to catch up a
        // cancelled projection. Page through every synthetic overlap fact.
        const ids=new Set();
        const snapshots=[];
        let cursor=null;
        do {
          const page=await memoryCall(s,'memory_search',{query:'overlap',includeHistorical:false,cursor,limit:100});
          if(page.error) throw new Error(`Partial-index search: ${page.error.code}`);
          for(const item of page.result.items) ids.add(item.memoryId);
          snapshots.push(page.result.snapshotSequence);
          cursor=page.result.nextCursor;
          if(snapshots.length>4) throw new Error('Unexpected partial-index search page count');
        } while(cursor);
        check('K.partial_index_updates_all_search_pages', ids.size === 240 && snapshots.every(sequence=>sequence===496), JSON.stringify({uniqueMemories:ids.size,snapshots}));
      }
      rebuild=await memoryCall(s,'index_rebuild');
      check('K.new_rebuild_has_fresh_operation_identity', typeof rebuild.result?.operationId === 'string' && rebuild.result.operationId !== originalId);
      if(!rebuild.result?.operationId) throw new Error(`Cancelled-index recovery: ${rebuild.error?.code}`);
    }
    let status;
    const end = Date.now() + 30000;
    do {
      status = (await memoryCall(s,'operation_get',{operationId:rebuild.result.operationId})).result;
      if (!status || ['failed','cancelled'].includes(status.state)) throw new Error('Synthetic index rebuild failed');
      if (status.state === 'succeeded') break;
      await sleep(100);
    } while (Date.now() < end);
    check('I.pinned_core_index_rebuild_completes', status.kind === 'index_rebuild' && status.state === 'succeeded' && status.progress.done >= 1, JSON.stringify({kind:status.kind,state:status.state,progress:status.progress}));
    check('I.memory_rebuild_preserves_activity_bytes', fixtureTree(manifest.dataRoot) === treeBefore);
    if (overlapMode) {
      check('O.rebuild_preserves_canonical_vault', fixtureTree(join(vault,'vault')) === overlapCanonical);
      check('O.rebuild_preserves_activity_bytes', fixtureTree(manifest.dataRoot) === treeBefore);
      check('O.rebuild_returns_all_approved_memories', (await memoryCall(s,'memory_list',{cursor:null,limit:25,includeInactive:false})).result?.total === expectedMemories);
    }
    if (mode === '--repeat-pause') {
      const canonical=fixtureTree(join(vault,'vault')),image=fixtureImage(manifest.dataRoot),generationCount=readdirSync(join(manifest.dataRoot,'generations')).length,operations=[];
      for(let cycle=1;cycle<=10;cycle++) {
        const rebuild=await memoryCall(s,'index_rebuild');if(!rebuild.result?.operationId)throw Error('Repeated synthetic rebuild was not accepted');operations.push(rebuild.result.operationId);
        // Commands are issued together; their actual replies do not assert
        // that the rebuild worker stayed running throughout every request.
        const [pause,list]=await Promise.all([call(s,{operation:'activity_set_paused',paused:true}),memoryCall(s,'memory_list',{cursor:null,limit:25,includeInactive:false})]);
        check(`RPT.${cycle}_pause_and_memory_list_are_durable`,pause.kind==='activity_pause_acknowledged'&&pause.paused===true&&(await overview(s)).producer.paused===true&&!list.error&&list.result?.total===1);
        const resume=await call(s,{operation:'activity_set_paused',paused:false});
        check(`RPT.${cycle}_resume_is_durable`,resume.kind==='activity_pause_acknowledged'&&resume.paused===false&&(await overview(s)).producer.paused===false);
        let terminal;const deadline=Date.now()+30000;
        do{terminal=(await memoryCall(s,'operation_get',{operationId:rebuild.result.operationId})).result;if(terminal&&['succeeded','failed','cancelled'].includes(terminal.state))break;await sleep(100);}while(Date.now()<deadline);
        const search=await memoryCall(s,'memory_search',{query:'isolation',includeHistorical:false,cursor:null,limit:25});
        check(`RPT.${cycle}_rebuild_and_search_recover`,terminal?.state==='succeeded'&&!search.error&&search.result?.items?.length===1);
        const after=fixtureImage(manifest.dataRoot);
        check(`RPT.${cycle}_archive_sequence_pending_and_vault_are_exact`,after.activity===image.activity&&after.sequence===image.sequence&&after.pending===image.pending&&fixtureTree(join(vault,'vault'))===canonical);
      }
      check('RPT.ten_rebuilds_have_distinct_operation_ids',operations.length===10&&new Set(operations).size===10);
      check('RPT.twenty_mutations_create_exactly_twenty_generations',readdirSync(join(manifest.dataRoot,'generations')).length===generationCount+20&&fixtureImage(manifest.dataRoot).generation!==image.generation);
    }
    if(mode==='--generation-write-denial') {
      if(realpathSync(manifest.dataRoot).toLowerCase()!==join(realpathSync(dirname(pkg)),'data').toLowerCase())throw Error('Write ACL drill escaped the prepared synthetic data root');
      const generations=join(manifest.dataRoot,'generations');
      if(realpathSync(generations).toLowerCase()!==join(realpathSync(manifest.dataRoot),'generations').toLowerCase())throw Error('Synthetic generation directory cannot be redirected');
      const canonical=fixtureTree(join(vault,'vault')),image=fixtureImage(manifest.dataRoot);
      const powershell='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',literal=generations.replace(/'/g,"''"),release=join(out,'release-write-acl');
      const readAcl=()=>execFileSync(powershell,['-NoProfile','-NonInteractive','-Command',`([IO.Directory]::GetAccessControl('${literal}')).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::All)`],{encoding:'utf8',windowsHide:true,timeout:10000}).trim();
      const originalAcl=readAcl();if(!originalAcl.startsWith('O:')||!originalAcl.includes('D:'))throw Error('Synthetic generation ACL backup is incomplete');
      const restore=`$ErrorActionPreference='Stop';$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetSecurityDescriptorSddlForm([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(originalAcl).toString('base64')}')),[Security.AccessControl.AccessControlSections]::Access);[IO.Directory]::SetAccessControl('${literal}',$acl)`;
      const command=`$ErrorActionPreference='Stop';$changed=[IO.Directory]::GetAccessControl('${literal}');$rule=[Security.AccessControl.FileSystemAccessRule]::new(([Security.Principal.WindowsIdentity]::GetCurrent()).User,[Security.AccessControl.FileSystemRights]::CreateDirectories,[Security.AccessControl.AccessControlType]::Deny);$changed.AddAccessRule($rule);try{[IO.Directory]::SetAccessControl('${literal}',$changed);'denied';$watch=[Diagnostics.Stopwatch]::StartNew();while($watch.Elapsed.TotalSeconds -lt 90 -and ![IO.File]::Exists('${release.replace(/'/g,"''")}')){[Threading.Thread]::Sleep(200)}}finally{${restore}}`;
      const holder=spawn(powershell,['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,stdio:['ignore','pipe','pipe']});children.add(holder);
      holder.exited=new Promise(resolve=>holder.once('exit',code=>{children.delete(holder);resolve(code);}));
      try {
        await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Write ACL helper did not become ready')),10000);holder.stdout.on('data',bytes=>{output+=bytes.toString();if(output.includes('denied')){clearTimeout(timer);resolve();}});holder.once('exit',()=>{clearTimeout(timer);reject(Error('Write ACL helper exited early'));});});
        check('N.synthetic_generation_creation_is_denied',true);
        const probe=join(generations,'.acl-write-probe');if(existsSync(probe))throw Error('Unexpected preexisting ACL probe');let denied=false,created=false;
        try{mkdirSync(probe);created=true;}catch(error){denied=['EACCES','EPERM'].includes(error.code);}finally{if(created){if(realpathSync(probe).toLowerCase()!==join(realpathSync(generations),'.acl-write-probe').toLowerCase())throw Error('ACL probe escaped');rmdirSync(probe);}}
        check('N.directory_creation_really_refuses_access',denied);
        const failed=await call(s,{operation:'activity_set_paused',paused:true});
        check('N.actual_pause_write_reports_storage_failure',failed.kind==='activity_error'&&failed.error.code==='storage_failed',JSON.stringify(failed));
        await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
        await waitFor(s,"[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Pause activity sync'&&!b.disabled)",'write-denial Activity controls');
        await press(s,'Pause activity sync');await waitFor(s,has('The Activity store could not be read or written'),'actual pause write failure');check('N.failed_pause_is_visible',true);
        const [read,payload,list,search]=await Promise.all([overview(s),call(s,{operation:'activity_preview_public_payload'}),memoryCall(s,'memory_list',{cursor:null,limit:25,includeInactive:false}),memoryCall(s,'memory_search',{query:'isolation',includeHistorical:false,cursor:null,limit:25})]);
        check('N.failed_writes_keep_unpaused_reads_and_exact_history',read.producer.paused===false&&read.producer.highestReserved===o.producer.highestReserved&&payload.sha256===preview.sha256);
        check('N.memory_queries_survive_actual_write_failure',list.result?.total===1&&search.result?.items?.length===1&&!list.error&&!search.error);
        check('N.failed_writes_preserve_complete_activity_store',fixtureTree(manifest.dataRoot)===treeBefore);
        check('N.failed_writes_preserve_canonical_vault',fixtureTree(join(vault,'vault'))===canonical);
      }finally{writeFileSync(release,'release');await Promise.race([holder.exited,sleep(10000)]);execFileSync(powershell,['-NoProfile','-NonInteractive','-Command',restore],{windowsHide:true,timeout:10000,stdio:'pipe'});holder.kill();await holder.exited;}
      check('N.original_directory_security_descriptor_is_restored',readAcl()===originalAcl);
      const pause=await call(s,{operation:'activity_set_paused',paused:true});check('N.restored_permission_accepts_pause',pause.kind==='activity_pause_acknowledged'&&pause.paused===true&&(await overview(s)).producer.paused===true);
      const resume=await call(s,{operation:'activity_set_paused',paused:false});check('N.restored_permission_accepts_resume',resume.kind==='activity_pause_acknowledged'&&resume.paused===false&&(await overview(s)).producer.paused===false);
      const recovered=fixtureImage(manifest.dataRoot);check('N.successful_recovery_preserves_archive_sequence_pending',recovered.activity===image.activity&&recovered.sequence===image.sequence&&recovered.pending===image.pending);
      check('N.recovery_preserves_canonical_vault',fixtureTree(join(vault,'vault'))===canonical);
    }
    if(mode==='--pointer-create-denial') {
      if(realpathSync(manifest.dataRoot).toLowerCase()!==join(realpathSync(dirname(pkg)),'data').toLowerCase())throw Error('Write ACL drill escaped the prepared synthetic data root');
      const generations=join(manifest.dataRoot,'generations');
      if(realpathSync(generations).toLowerCase()!==join(realpathSync(manifest.dataRoot),'generations').toLowerCase())throw Error('Synthetic generation directory cannot be redirected');
      const canonical=fixtureTree(join(vault,'vault')),image=fixtureImage(manifest.dataRoot),oldNames=new Set(readdirSync(generations)),entries=new Set(fixtureEntries(manifest.dataRoot)),original=readFileSync(join(manifest.dataRoot,'CURRENT'));
      if(!existsSync(join(manifest.dataRoot,'sync.lock'))||readdirSync(manifest.dataRoot).some(name=>/^CURRENT\.g-.*\.tmp$/.test(name)))throw Error('Pointer-create drill requires an existing lock and no pointer remnants');
      let failedNames=[];
      const powershell='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',literal=manifest.dataRoot.replace(/'/g,"''"),release=join(out,'release-pointer-acl');
      const readAcl=()=>execFileSync(powershell,['-NoProfile','-NonInteractive','-Command',`([IO.Directory]::GetAccessControl('${literal}')).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::All)`],{encoding:'utf8',windowsHide:true,timeout:10000}).trim();
      const originalAcl=readAcl();if(!originalAcl.startsWith('O:')||!originalAcl.includes('D:'))throw Error('Synthetic generation ACL backup is incomplete');
      const restore=`$ErrorActionPreference='Stop';$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetSecurityDescriptorSddlForm([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(originalAcl).toString('base64')}')),[Security.AccessControl.AccessControlSections]::Access);[IO.Directory]::SetAccessControl('${literal}',$acl)`;
      const command=`$ErrorActionPreference='Stop';$changed=[IO.Directory]::GetAccessControl('${literal}');$rule=[Security.AccessControl.FileSystemAccessRule]::new(([Security.Principal.WindowsIdentity]::GetCurrent()).User,[Security.AccessControl.FileSystemRights]::CreateFiles,[Security.AccessControl.AccessControlType]::Deny);$changed.AddAccessRule($rule);try{[IO.Directory]::SetAccessControl('${literal}',$changed);'denied';$watch=[Diagnostics.Stopwatch]::StartNew();while($watch.Elapsed.TotalSeconds -lt 90 -and ![IO.File]::Exists('${release.replace(/'/g,"''")}')){[Threading.Thread]::Sleep(200)}}finally{${restore}}`;
      const holder=spawn(powershell,['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,stdio:['ignore','pipe','pipe']});children.add(holder);
      holder.exited=new Promise(resolve=>holder.once('exit',code=>{children.delete(holder);resolve(code);}));
      try {
        await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Write ACL helper did not become ready')),10000);holder.stdout.on('data',bytes=>{output+=bytes.toString();if(output.includes('denied')){clearTimeout(timer);resolve();}});holder.once('exit',()=>{clearTimeout(timer);reject(Error('Write ACL helper exited early'));});});
        check('PC.synthetic_root_file_creation_is_denied',true);
        const probe=join(manifest.dataRoot,'.acl-pointer-probe');if(existsSync(probe))throw Error('Unexpected preexisting ACL probe');let denied=false,created=false;
        try{writeFileSync(probe,'owned synthetic probe',{flag:'wx'});created=true;}catch(error){denied=['EACCES','EPERM'].includes(error.code);}finally{if(created){if(realpathSync(probe).toLowerCase()!==join(realpathSync(manifest.dataRoot),'.acl-pointer-probe').toLowerCase())throw Error('ACL probe escaped');rmSync(probe);}}
        check('PC.root_file_creation_really_refuses_access',denied);if(!denied)throw Error('Actual denial required before fault mutations');
        const failed=await call(s,{operation:'activity_set_paused',paused:true});
        check('PC.actual_pause_write_reports_storage_failure',failed.kind==='activity_error'&&failed.error.code==='storage_failed',JSON.stringify(failed));
        await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
        await waitFor(s,"[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Pause activity sync'&&!b.disabled)",'write-denial Activity controls');
        await press(s,'Pause activity sync');await waitFor(s,has('The Activity store could not be read or written'),'actual pause write failure');check('PC.failed_pause_is_visible',true);
        const [read,payload,list,search]=await Promise.all([overview(s),call(s,{operation:'activity_preview_public_payload'}),memoryCall(s,'memory_list',{cursor:null,limit:25,includeInactive:false}),memoryCall(s,'memory_search',{query:'isolation',includeHistorical:false,cursor:null,limit:25})]);
        check('PC.failed_writes_keep_unpaused_reads_and_exact_history',read.producer.paused===false&&read.producer.highestReserved===o.producer.highestReserved&&payload.sha256===preview.sha256);
        check('PC.memory_queries_survive_actual_write_failure',list.result?.total===1&&search.result?.items?.length===1&&!list.error&&!search.error);
        check('PC.failed_writes_preserve_exact_current_pointer',readFileSync(join(manifest.dataRoot,'CURRENT')).equals(original));
        const afterEntries=new Set(fixtureEntries(manifest.dataRoot));check('PC.all_original_files_keep_exact_hashes',Array.from(entries).every(entry=>afterEntries.has(entry)));
        failedNames=readdirSync(generations).filter(name=>!oldNames.has(name));
        check('PC.failed_preparation_retracts_two_complete_generations_to_staging',failedNames.length===2&&failedNames.every(name=>name.startsWith('.staging-g-')&&['activity.json','sequence.json','delivery.json','manifest.json'].every(file=>existsSync(join(generations,name,file)))&&JSON.parse(readFileSync(join(generations,name,'delivery.json'),'utf8')).paused===true));
        check('PC.failed_preparation_creates_no_temporary_pointer_file',!readdirSync(manifest.dataRoot).some(name=>/^CURRENT\.g-.*\.tmp$/.test(name)));
        check('PC.failed_writes_preserve_canonical_vault',fixtureTree(join(vault,'vault'))===canonical);
      }finally{writeFileSync(release,'release');await Promise.race([holder.exited,sleep(10000)]);execFileSync(powershell,['-NoProfile','-NonInteractive','-Command',restore],{windowsHide:true,timeout:10000,stdio:'pipe'});holder.kill();await holder.exited;}
      check('PC.original_directory_security_descriptor_is_restored',readAcl()===originalAcl);
      const pause=await call(s,{operation:'activity_set_paused',paused:true});check('PC.restored_permission_accepts_pause',pause.kind==='activity_pause_acknowledged'&&pause.paused===true&&(await overview(s)).producer.paused===true);
      const resume=await call(s,{operation:'activity_set_paused',paused:false});check('PC.restored_permission_accepts_resume',resume.kind==='activity_pause_acknowledged'&&resume.paused===false&&(await overview(s)).producer.paused===false);
      const recovered=fixtureImage(manifest.dataRoot);check('PC.successful_recovery_preserves_archive_sequence_pending',recovered.activity===image.activity&&recovered.sequence===image.sequence&&recovered.pending===image.pending);
      check('PC.recovery_retains_failed_generations',failedNames.length===2&&failedNames.every(name=>existsSync(join(generations,name))));
      check('PC.recovery_preserves_canonical_vault',fixtureTree(join(vault,'vault'))===canonical);
    }
    if (mode === '--current-switch-lock') {
      if(realpathSync(manifest.dataRoot).toLowerCase()!==join(realpathSync(dirname(pkg)),'data').toLowerCase())throw Error('Switch drill escaped the synthetic root');
      const pointer=join(manifest.dataRoot,'CURRENT'),generations=join(manifest.dataRoot,'generations');
      if(realpathSync(pointer).toLowerCase()!==join(realpathSync(manifest.dataRoot),'CURRENT').toLowerCase())throw Error('Switch pointer escaped');
      const original=readFileSync(pointer),image=fixtureImage(manifest.dataRoot),entries=new Set(fixtureEntries(manifest.dataRoot)),oldNames=new Set(readdirSync(generations)),canonical=fixtureTree(join(vault,'vault'));
      const holder=spawn('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoProfile','-NonInteractive','-Command',`$f=[IO.File]::Open('${pointer.replace(/'/g,"''")}','Open','Read','Read');try{'locked';Start-Sleep -Seconds 90}finally{$f.Dispose()}`],{windowsHide:true,stdio:['ignore','pipe','pipe']});
      children.add(holder);holder.exited=new Promise(r=>holder.once('exit',code=>{children.delete(holder);r(code);}));
      let failedNames=[],temporaryPointers=[];
      try {
        await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Synthetic pointer hold not ready')),10000);holder.stdout.on('data',bytes=>{output+=bytes.toString();if(output.includes('locked')){clearTimeout(timer);resolve();}});holder.once('exit',()=>{clearTimeout(timer);reject(Error('Synthetic pointer hold exited'));});});
        check('L.current_is_held_without_delete_sharing',true);
        const initialReads=await Promise.all([overview(s),call(s,{operation:'activity_preview_public_payload'})]);
        check('L.reads_remain_available_during_switch_lock',initialReads[0].kind==='activity_overview'&&initialReads[0].producer.paused===false&&initialReads[1].sha256===preview.sha256);
        const failed=await call(s,{operation:'activity_set_paused',paused:true});
        check('L.actual_pause_reports_storage_failure',failed.kind==='activity_error'&&failed.error.code==='storage_failed');
        await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
        await waitFor(s,"document.querySelectorAll('.act-source').length===3",'switch lock readable page');
        await press(s,'Pause activity sync');await waitFor(s,has('The Activity store could not be read or written'),'actual switch-lock failure');
        check('L.actual_failure_is_visible_with_old_history',await s.evaluate("document.querySelectorAll('.act-source').length===3"));
        const reads=await Promise.all([overview(s),call(s,{operation:'activity_preview_public_payload'})]);
        check('L.failed_switch_keeps_current_unpaused_and_exact',readFileSync(pointer).equals(original)&&reads[0].producer.paused===false&&reads[0].producer.highestReserved===initialReads[0].producer.highestReserved&&reads[1].sha256===preview.sha256);
        const currentEntries=new Set(fixtureEntries(manifest.dataRoot));
        check('L.all_original_files_are_preserved',Array.from(entries).every(entry=>currentEntries.has(entry)));
        failedNames=readdirSync(generations).filter(name=>!oldNames.has(name));temporaryPointers=readdirSync(manifest.dataRoot).filter(name=>/^CURRENT\.g-[a-zA-Z0-9-]+\.tmp$/.test(name));
        const complete=failedNames.length===2&&failedNames.every(name=>name.startsWith('.staging-g-')&&['activity.json','sequence.json','delivery.json','manifest.json'].every(file=>existsSync(join(generations,name,file)))&&JSON.parse(readFileSync(join(generations,name,'delivery.json'),'utf8')).paused===true);
        check('L.failed_switch_retracts_two_complete_generations_to_staging',complete);
        check('L.prepared_pointer_files_are_retained',temporaryPointers.length===2&&temporaryPointers.every(name=>failedNames.includes('.staging-'+readFileSync(join(manifest.dataRoot,name),'utf8').trim())));
        const [list,search]=await Promise.all([memoryCall(s,'memory_list',{cursor:null,limit:25,includeInactive:false}),memoryCall(s,'memory_search',{query:'isolation',includeHistorical:false,cursor:null,limit:25})]);
        check('L.memory_queries_survive_actual_switch_failure',!list.error&&list.result?.total===1&&!search.error&&search.result?.items?.length===1);
        check('L.failure_preserves_canonical_vault',fixtureTree(join(vault,'vault'))===canonical);
        await shot(s,'03-pointer-switch-failure',false);
      } finally {holder.kill();await holder.exited;}
      const pause=await call(s,{operation:'activity_set_paused',paused:true});
      check('L.release_accepts_actual_pause',pause.kind==='activity_pause_acknowledged'&&pause.paused===true&&(await overview(s)).producer.paused===true);
      const resume=await call(s,{operation:'activity_set_paused',paused:false});
      check('L.release_accepts_actual_resume',resume.kind==='activity_pause_acknowledged'&&resume.paused===false&&(await overview(s)).producer.paused===false);
      const recovered=fixtureImage(manifest.dataRoot);
      check('L.recovery_preserves_archive_sequence_pending',recovered.activity===image.activity&&recovered.sequence===image.sequence&&recovered.pending===image.pending);
      check('L.recovery_preserves_failed_generation_and_pointer_remnants',failedNames.every(name=>existsSync(join(generations,name)))&&temporaryPointers.every(name=>existsSync(join(manifest.dataRoot,name))));
      check('L.recovery_preserves_canonical_vault',fixtureTree(join(vault,'vault'))===canonical);
    }
    if (mode === '--run-switch-lock') {
      // An actual sync whose CURRENT replacement is refused must fail once and
      // leave the next run able to reserve the same sequence (store retraction).
      if(realpathSync(manifest.dataRoot).toLowerCase()!==join(realpathSync(dirname(pkg)),'data').toLowerCase())throw Error('Run switch drill escaped the synthetic root');
      const pointer=join(manifest.dataRoot,'CURRENT'),generations=join(manifest.dataRoot,'generations');
      if(realpathSync(pointer).toLowerCase()!==join(realpathSync(manifest.dataRoot),'CURRENT').toLowerCase())throw Error('Run switch pointer escaped');
      if(readdirSync(manifest.dataRoot).some(name=>/^CURRENT\..*\.tmp$/.test(name)))throw Error('Run switch drill requires no pointer remnants');
      const original=readFileSync(pointer),entries=new Set(fixtureEntries(manifest.dataRoot)),oldNames=new Set(readdirSync(generations)),canonical=fixtureTree(join(vault,'vault')),reserved=o.producer.highestReserved;
      const runToEnd=async()=>{const accepted=await call(s,{operation:'activity_run_now'});if(accepted.kind!=='activity_run_accepted')return accepted;let status;const deadline=Date.now()+60000;do{status=await call(s,{operation:'activity_get_run',runId:accepted.runId});if(['completed','failed','blocked'].includes(status.stage))break;await sleep(100);}while(Date.now()<deadline);return status;};
      const holder=spawn('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoProfile','-NonInteractive','-Command',`$f=[IO.File]::Open('${pointer.replace(/'/g,"''")}','Open','Read','Read');try{'locked';Start-Sleep -Seconds 90}finally{$f.Dispose()}`],{windowsHide:true,stdio:['ignore','pipe','pipe']});
      children.add(holder);holder.exited=new Promise(r=>holder.once('exit',code=>{children.delete(holder);r(code);}));
      let failedNames=[],temporaryPointers=[];
      try {
        await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Synthetic pointer hold not ready')),10000);holder.stdout.on('data',bytes=>{output+=bytes.toString();if(output.includes('locked')){clearTimeout(timer);resolve();}});holder.once('exit',()=>{clearTimeout(timer);reject(Error('Synthetic pointer hold exited'));});});
        check('RS.current_is_held_without_delete_sharing',true);
        const failed=await runToEnd();
        check('RS.actual_run_reports_storage_failure',failed.kind==='activity_run_status'&&failed.stage==='failed'&&failed.error?.code==='storage_failed',JSON.stringify({stage:failed.stage,error:failed.error,state:failed.summary?.state}));
        const [read,payload]=await Promise.all([overview(s),call(s,{operation:'activity_preview_public_payload'})]);
        check('RS.failed_run_keeps_current_high_water_and_history_exact',readFileSync(pointer).equals(original)&&read.producer.highestReserved===reserved&&read.pending===null&&payload.sha256===preview.sha256);
        const currentEntries=new Set(fixtureEntries(manifest.dataRoot));
        check('RS.failed_run_preserves_all_original_files',Array.from(entries).every(entry=>currentEntries.has(entry)));
        failedNames=readdirSync(generations).filter(name=>!oldNames.has(name));temporaryPointers=readdirSync(manifest.dataRoot).filter(name=>/^CURRENT\.g-[a-zA-Z0-9-]+\.tmp$/.test(name));
        const pendingSequence=name=>{try{return JSON.parse(readFileSync(join(generations,name,'pending.json'),'utf8')).sequence;}catch{return null;}};
        check('RS.failed_run_retracts_its_generation_to_staging',failedNames.length===1&&failedNames[0].startsWith('.staging-g-run-')&&['activity.json','sequence.json','pending.json','delivery.json','manifest.json'].every(file=>existsSync(join(generations,failedNames[0],file)))&&pendingSequence(failedNames[0])===reserved+1,JSON.stringify(failedNames));
        check('RS.prepared_pointer_file_is_retained',temporaryPointers.length===1&&failedNames.length===1&&failedNames[0]==='.staging-'+readFileSync(join(manifest.dataRoot,temporaryPointers[0]),'utf8').trim());
        const [list,search]=await Promise.all([memoryCall(s,'memory_list',{cursor:null,limit:25,includeInactive:false}),memoryCall(s,'memory_search',{query:'isolation',includeHistorical:false,cursor:null,limit:25})]);
        check('RS.memory_queries_survive_actual_run_failure',!list.error&&list.result?.total===1&&!search.error&&search.result?.items?.length===1);
        await shot(s,'03-run-switch-failure',false);
      } finally {holder.kill();await holder.exited;}
      const next=await runToEnd();
      check('RS.next_run_after_release_is_not_storage_blocked',next.kind==='activity_run_status'&&next.stage!=='failed'&&next.summary?.sequence===reserved+1,JSON.stringify({stage:next.stage,error:next.error,state:next.summary?.state,sequence:next.summary?.sequence}));
      const after=await overview(s);
      check('RS.next_run_reserves_the_same_sequence_once',after.producer.highestReserved===reserved+1&&after.pending?.sequence===reserved+1&&after.pending.failureCount===1);
      check('RS.retracted_generation_and_pointer_remain_unselected',failedNames.length===1&&failedNames[0].startsWith('.staging-g-run-')&&existsSync(join(generations,failedNames[0]))&&temporaryPointers.every(name=>existsSync(join(manifest.dataRoot,name)))&&fixtureImage(manifest.dataRoot).generation!==failedNames[0].slice('.staging-'.length));
      check('RS.recovery_preserves_canonical_vault',fixtureTree(join(vault,'vault'))===canonical);
    }
    if (['--current-read-lock','--current-acl-denial'].includes(mode)) {
      const aclMode=mode==='--current-acl-denial';
      if(aclMode&&realpathSync(manifest.dataRoot).toLowerCase()!==join(realpathSync(dirname(pkg)),'data').toLowerCase())throw Error('ACL drill escaped the prepared synthetic data root');
      const canonical=fixtureTree(join(vault,'vault'));
      const pointer=join(manifest.dataRoot,'CURRENT');
      if(realpathSync(pointer).toLowerCase()!==join(realpathSync(manifest.dataRoot),'CURRENT').toLowerCase()) throw new Error('Current lock escaped the synthetic Activity store');
      const original=readFileSync(pointer);
      if(!/^g-[a-zA-Z0-9-]{1,62}\n?$/.test(original.toString())) throw new Error('Expected a generated current pointer');
      const powershell='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
      const literal=pointer.replace(/'/g,"''");
      const release=join(out,'release-current-acl');
      const readAcl=()=>execFileSync(powershell,['-NoProfile','-NonInteractive','-Command',`([IO.File]::GetAccessControl('${literal}')).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::All)`],{encoding:'utf8',windowsHide:true,timeout:10000}).trim();
      const originalAcl=aclMode?readAcl():null;
      if(aclMode&&(!originalAcl.startsWith('O:')||!originalAcl.includes('D:')))throw Error('Synthetic CURRENT ACL backup is incomplete');
      // SetAccessControl persists modified descriptors only; reconstruct the
      // original DACL rather than reapplying an untouched GetAccessControl result.
      // https://learn.microsoft.com/en-us/dotnet/api/system.io.file.setaccesscontrol?view=netframework-4.8.1
      const restoreAcl=originalAcl===null?null:`$ErrorActionPreference='Stop';$acl=[Security.AccessControl.FileSecurity]::new();$acl.SetSecurityDescriptorSddlForm([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(originalAcl).toString('base64')}')),[Security.AccessControl.AccessControlSections]::Access);[IO.File]::SetAccessControl('${literal}',$acl)`;
      const command=aclMode
        ? `$ErrorActionPreference='Stop';$changed=[IO.File]::GetAccessControl('${literal}');$rule=[Security.AccessControl.FileSystemAccessRule]::new(([Security.Principal.WindowsIdentity]::GetCurrent()).User,[Security.AccessControl.FileSystemRights]::ReadData,[Security.AccessControl.AccessControlType]::Deny);$changed.AddAccessRule($rule);try{[IO.File]::SetAccessControl('${literal}',$changed);'locked';$watch=[Diagnostics.Stopwatch]::StartNew();while($watch.Elapsed.TotalSeconds -lt 90 -and ![IO.File]::Exists('${release.replace(/'/g,"''")}')){[Threading.Thread]::Sleep(200)}}finally{${restoreAcl}}`
        : `$f=[IO.File]::Open('${literal}','Open','Read','None');try{'locked';Start-Sleep -Seconds 90}finally{$f.Dispose()}`;
      const holder=spawn(powershell,['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,stdio:['ignore','pipe','pipe']});
      children.add(holder);
      holder.exited=new Promise(resolve=>holder.once('exit',code=>{children.delete(holder);resolve(code);}));
      try {
        await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>reject(Error('Synthetic CURRENT lock did not become ready')),10000);let output='';
          holder.stdout.on('data',bytes=>{output+=bytes.toString();if(output.includes('locked')){clearTimeout(timer);resolve();}});
          holder.once('exit',()=>{clearTimeout(timer);reject(Error('Synthetic CURRENT holder exited early'));});
        });
        check(aclMode?'P.synthetic_current_read_is_denied':'A.synthetic_current_is_exclusively_held',true);
        if(aclMode){let denied=false;try{readFileSync(pointer);}catch(error){denied=['EACCES','EPERM'].includes(error.code);}check('P.current_file_really_refuses_read',denied);}
        const reads=await Promise.all([overview(s),call(s,{operation:'activity_preview_public_payload'})]);
        check('A.actual_activity_reads_report_storage_failure',reads.every(r=>r.kind==='activity_error'&&r.error.code==='storage_failed'),JSON.stringify(reads));
        await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
        await press(s,'Refresh');await waitFor(s,has('The Activity store could not be read or written'),'actual Activity sharing failure');
        check('A.actual_failure_reaches_activity_page',await s.evaluate("document.querySelectorAll('.act-source').length===0"));
        await shot(s,'03-activity-read-failure',false);
        const [list,search]=await Promise.all([
          memoryCall(s,'memory_list',{cursor:null,limit:25,includeInactive:false}),
          memoryCall(s,'memory_search',{query:'isolation',includeHistorical:false,cursor:null,limit:25})]);
        check('A.memory_list_and_search_survive_activity_read_failure',!list.error&&list.result?.total===1&&!search.error&&search.result?.items?.length===1);
        await s.evaluate("document.querySelector('nav button[aria-label=\"Memory\"]').click()");
        await waitFor(s,has('Memory · Vault open'),'Memory during Activity pointer hold');
        check('A.memory_surface_survives_actual_activity_failure',!(await s.evaluate(has('This surface could not open'))));
        check('A.failure_preserves_canonical_vault',fixtureTree(join(vault,'vault'))===canonical);
      } finally {
        if(aclMode){
          writeFileSync(release,'release');
          await Promise.race([holder.exited,sleep(10000)]);
          // Restore independently before terminating an unresponsive owned helper.
          execFileSync(powershell,['-NoProfile','-NonInteractive','-Command',restoreAcl],{windowsHide:true,timeout:10000,stdio:'pipe'});
        }
        holder.kill();await holder.exited;
      }
      if(aclMode)check('P.original_security_descriptor_is_restored',readAcl()===originalAcl);
      check('A.release_preserves_current_pointer_bytes',readFileSync(pointer).equals(original));
      check('A.failure_preserves_complete_activity_store',fixtureTree(manifest.dataRoot)===treeBefore);
      await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
      await waitFor(s,"[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Refresh'&&!b.disabled)",'Activity read controls after pointer release');
      await press(s,'Refresh');await waitFor(s,has('Publication observed'),'Activity after pointer release');
      const recovered=await call(s,{operation:'activity_preview_public_payload'});
      check('A.release_restores_exact_public_history',recovered.sha256===preview.sha256&&await s.evaluate("document.querySelectorAll('.act-source').length===3"));
      check('A.recovery_preserves_canonical_vault',fixtureTree(join(vault,'vault'))===canonical);
    }
    if (mode === '--generation-manifest-denial') {
      const aclMode=true;
      if(aclMode&&realpathSync(manifest.dataRoot).toLowerCase()!==join(realpathSync(dirname(pkg)),'data').toLowerCase())throw Error('ACL drill escaped the prepared synthetic data root');
      const canonical=fixtureTree(join(vault,'vault'));
      const generation=fixtureImage(manifest.dataRoot).generation,current=readFileSync(join(manifest.dataRoot,'CURRENT'));
      const pointer=join(manifest.dataRoot,'generations',generation,'manifest.json');
      if(realpathSync(pointer).toLowerCase()!==join(realpathSync(manifest.dataRoot),'generations',generation,'manifest.json').toLowerCase()) throw new Error('Manifest read denial escaped the synthetic Activity store');
      const original=readFileSync(pointer);
      if(!JSON.parse(original.toString()).schemaVersion)throw Error('Expected a generated manifest');
      const powershell='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
      const literal=pointer.replace(/'/g,"''");
      const release=join(out,'release-manifest-acl');
      const readAcl=()=>execFileSync(powershell,['-NoProfile','-NonInteractive','-Command',`([IO.File]::GetAccessControl('${literal}')).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::All)`],{encoding:'utf8',windowsHide:true,timeout:10000}).trim();
      const originalAcl=aclMode?readAcl():null;
      if(aclMode&&(!originalAcl.startsWith('O:')||!originalAcl.includes('D:')))throw Error('Synthetic selected manifest ACL backup is incomplete');
      // SetAccessControl persists modified descriptors only; reconstruct the
      // original DACL rather than reapplying an untouched GetAccessControl result.
      // https://learn.microsoft.com/en-us/dotnet/api/system.io.file.setaccesscontrol?view=netframework-4.8.1
      const restoreAcl=originalAcl===null?null:`$ErrorActionPreference='Stop';$acl=[Security.AccessControl.FileSecurity]::new();$acl.SetSecurityDescriptorSddlForm([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(originalAcl).toString('base64')}')),[Security.AccessControl.AccessControlSections]::Access);[IO.File]::SetAccessControl('${literal}',$acl)`;
      const command=aclMode
        ? `$ErrorActionPreference='Stop';$changed=[IO.File]::GetAccessControl('${literal}');$rule=[Security.AccessControl.FileSystemAccessRule]::new(([Security.Principal.WindowsIdentity]::GetCurrent()).User,[Security.AccessControl.FileSystemRights]::ReadData,[Security.AccessControl.AccessControlType]::Deny);$changed.AddAccessRule($rule);try{[IO.File]::SetAccessControl('${literal}',$changed);'locked';$watch=[Diagnostics.Stopwatch]::StartNew();while($watch.Elapsed.TotalSeconds -lt 90 -and ![IO.File]::Exists('${release.replace(/'/g,"''")}')){[Threading.Thread]::Sleep(200)}}finally{${restoreAcl}}`
        : `$f=[IO.File]::Open('${literal}','Open','Read','None');try{'locked';Start-Sleep -Seconds 90}finally{$f.Dispose()}`;
      const holder=spawn(powershell,['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,stdio:['ignore','pipe','pipe']});
      children.add(holder);
      holder.exited=new Promise(resolve=>holder.once('exit',code=>{children.delete(holder);resolve(code);}));
      try {
        await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>reject(Error('Synthetic selected manifest lock did not become ready')),10000);let output='';
          holder.stdout.on('data',bytes=>{output+=bytes.toString();if(output.includes('locked')){clearTimeout(timer);resolve();}});
          holder.once('exit',()=>{clearTimeout(timer);reject(Error('Synthetic selected manifest holder exited early'));});
        });
        check(aclMode?'GM.synthetic_selected_manifest_read_is_denied':'GM.synthetic_current_is_exclusively_held',true);
        if(aclMode){let denied=false;try{readFileSync(pointer);}catch(error){denied=['EACCES','EPERM'].includes(error.code);}check('GM.selected_manifest_really_refuses_read',denied);if(!denied)throw Error('Actual manifest read denial required');}
        check('GM.current_pointer_stays_readable_and_exact',readFileSync(join(manifest.dataRoot,'CURRENT')).equals(current));
        const failedPause=await call(s,{operation:'activity_set_paused',paused:true});check('GM.actual_pause_refuses_unreadable_selected_generation',failedPause.kind==='activity_error'&&failedPause.error?.code==='storage_failed');
        const reads=await Promise.all([overview(s),call(s,{operation:'activity_preview_public_payload'})]);
        check('GM.actual_activity_reads_report_storage_failure',reads.every(r=>r.kind==='activity_error'&&r.error.code==='storage_failed'),JSON.stringify(reads));
        await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
        await press(s,'Refresh');await waitFor(s,has('The Activity store could not be read or written'),'actual Activity sharing failure');
        check('GM.actual_failure_reaches_activity_page',await s.evaluate("document.querySelectorAll('.act-source').length===0"));
        check('GM.unreadable_generation_disables_mutating_controls',await disabled(s,'Run now')&&await disabled(s,'Retry pending')&&await disabled(s,'Pause activity sync'));
        check('GM.read_failure_never_rewrites_current_pointer',readFileSync(join(manifest.dataRoot,'CURRENT')).equals(current));
        await shot(s,'03-activity-read-failure',false);
        const [list,search]=await Promise.all([
          memoryCall(s,'memory_list',{cursor:null,limit:25,includeInactive:false}),
          memoryCall(s,'memory_search',{query:'isolation',includeHistorical:false,cursor:null,limit:25})]);
        check('GM.memory_list_and_search_survive_activity_read_failure',!list.error&&list.result?.total===1&&!search.error&&search.result?.items?.length===1);
        await s.evaluate("document.querySelector('nav button[aria-label=\"Memory\"]').click()");
        await waitFor(s,has('Memory · Vault open'),'Memory during Activity pointer hold');
        check('GM.memory_surface_survives_actual_activity_failure',!(await s.evaluate(has('This surface could not open'))));
        check('GM.failure_preserves_canonical_vault',fixtureTree(join(vault,'vault'))===canonical);
      } finally {
        if(aclMode){
          writeFileSync(release,'release');
          await Promise.race([holder.exited,sleep(10000)]);
          // Restore independently before terminating an unresponsive owned helper.
          execFileSync(powershell,['-NoProfile','-NonInteractive','-Command',restoreAcl],{windowsHide:true,timeout:10000,stdio:'pipe'});
        }
        holder.kill();await holder.exited;
      }
      if(aclMode)check('GM.original_security_descriptor_is_restored',readAcl()===originalAcl);
      check('GM.release_preserves_selected_manifest_bytes',readFileSync(pointer).equals(original));
      check('GM.failure_preserves_complete_activity_store',fixtureTree(manifest.dataRoot)===treeBefore);
      await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
      await waitFor(s,"[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Refresh'&&!b.disabled)",'Activity read controls after pointer release');
      await press(s,'Refresh');await waitFor(s,has('Publication observed'),'Activity after pointer release');
      const recovered=await call(s,{operation:'activity_preview_public_payload'});
      check('GM.release_restores_exact_public_history',recovered.sha256===preview.sha256&&await s.evaluate("document.querySelectorAll('.act-source').length===3"));
      check('GM.recovery_preserves_canonical_vault',fixtureTree(join(vault,'vault'))===canonical);
    }
    if (mode === '--locked-index') {
      const canonical = fixtureTree(join(vault, 'vault'));
      const indexPath = join(vault, 'indexes', 'memory.sqlite');
      s.close();
      app.kill();
      await app.exited;
      if (realpathSync(indexPath).toLowerCase() !== join(realpathSync(vault), 'indexes', 'memory.sqlite').toLowerCase()) throw new Error('Index lock escaped the synthetic Vault');
      const original = readFileSync(indexPath);
      if (original.subarray(0,16).toString() !== 'SQLite format 3\0') throw new Error('Expected the generated SQLite cache');
      writeFileSync(join(out,'original-locked-memory.sqlite'),original,{flag:'wx'});
      // Hold only this freshly created derived cache through Windows file
      // sharing. The helper self-expires and is owned by this harness.
      const holder = spawn('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', ['-NoProfile','-NonInteractive','-Command',
        `$f=[IO.File]::Open('${indexPath.replace(/'/g,"''")}','Open','ReadWrite','None'); try { 'locked'; Start-Sleep -Seconds 90 } finally { $f.Dispose() }`], {stdio:['ignore','pipe','pipe']});
      children.add(holder);
      holder.exited = new Promise(r => holder.once('exit',code => {children.delete(holder);r(code);}));
      await new Promise((resolve,reject) => {
        const timer=setTimeout(()=>reject(new Error('Synthetic index lock did not become ready')),10000);
        let output='';
        holder.stdout.on('data',bytes => {output+=bytes.toString();if(output.includes('locked')) {clearTimeout(timer);resolve();}});
        holder.once('exit',()=>{clearTimeout(timer);reject(new Error('Synthetic index lock exited before readiness'));});
      });
      check('S.generated_index_is_exclusively_held', true);
      app=launch(['--memory-vault',vault]);
      s=await connect();
      check('S.synthetic_vault_reopens_with_held_index', (await memoryCall(s,'workspace_status')).result?.vault?.state === 'open');
      const operation = await memoryCall(s,'index_rebuild');
      if (!operation.result?.operationId) throw new Error(`Held-index rebuild: ${operation.error?.code}`);
      let failed;
      const deadline=Date.now()+30000;
      do {
        failed=(await memoryCall(s,'operation_get',{operationId:operation.result.operationId})).result;
        if (failed && ['succeeded','failed','cancelled'].includes(failed.state)) break;
        await sleep(100);
      } while(Date.now()<deadline);
      check('S.held_index_rebuild_reports_failure', failed?.state === 'failed', JSON.stringify(failed));
      const [read,payload]=await Promise.all([overview(s),call(s,{operation:'activity_preview_public_payload'})]);
      check('S.activity_reads_survive_index_storage_failure', read.producer.highestReserved === o.producer.highestReserved && read.pending === null && payload.sha256 === preview.sha256);
      check('S.failed_rebuild_preserves_canonical_vault', fixtureTree(join(vault,'vault')) === canonical);
      check('S.failed_rebuild_preserves_activity_bytes', fixtureTree(manifest.dataRoot) === treeBefore);
      holder.kill();
      await holder.exited;
      check('S.failed_rebuild_preserves_index_cache', readFileSync(indexPath).equals(original));
      const repair=await memoryCall(s,'index_rebuild');
      if (!repair.result?.operationId) throw new Error(`Released-index rebuild: ${repair.error?.code}`);
      let recovered;
      const end=Date.now()+30000;
      do {
        recovered=(await memoryCall(s,'operation_get',{operationId:repair.result.operationId})).result;
        if(recovered && ['succeeded','failed','cancelled'].includes(recovered.state)) break;
        await sleep(100);
      } while(Date.now()<end);
      check('S.released_index_rebuild_succeeds', recovered?.state === 'succeeded', JSON.stringify(recovered));
      const found=await memoryCall(s,'memory_search',{query:'isolation',includeHistorical:false,cursor:null,limit:25});
      check('S.recovered_search_returns_approved_memory', !found.error && found.result?.items?.length === 1);
      check('S.recovery_preserves_canonical_vault', fixtureTree(join(vault,'vault')) === canonical);
      check('S.recovery_preserves_activity_bytes', fixtureTree(manifest.dataRoot) === treeBefore);
      await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
      await waitFor(s,"document.querySelectorAll('.act-source').length===3",'Activity after index lock recovery');
    }
    if (['--missing-index', '--malformed-index'].includes(mode)) {
      const malformed = mode === '--malformed-index';
      const prefix = malformed ? 'M' : 'R';
      const canonical = fixtureTree(join(vault, 'vault'));
      const indexPath = join(vault, 'indexes', 'memory.sqlite');
      if (readFileSync(indexPath).subarray(0,16).toString() !== 'SQLite format 3\0') throw new Error('Expected the generated SQLite index before cache removal');
      s.close();
      app.kill();
      await app.exited;
      // Delete only caches generated by this run, after its Core host exits.
      // Canonical records and all Activity files remain outside this list.
      for (const name of ['memory.sqlite', 'memory.sqlite-wal', 'memory.sqlite-shm']) {
        const path = join(vault, 'indexes', name);
        if (!existsSync(path)) continue;
        if (realpathSync(path).toLowerCase() !== join(realpathSync(vault), 'indexes', name).toLowerCase()) throw new Error('Generated index cache escaped the synthetic Vault');
        writeFileSync(join(out, `original-${name}`), readFileSync(path), {flag:'wx'});
        rmSync(path);
      }
      if (malformed) {
        // Replace only this run's backed-up disposable cache after its host
        // exits. Never edit canonical records or a user-selected Vault.
        writeFileSync(indexPath, 'Synthetic Activity acceptance: deliberately invalid SQLite cache.', {flag:'wx'});
      }
      check(`${prefix}.generated_index_${malformed ? 'is_malformed' : 'is_absent'}_before_restart`, malformed ? readFileSync(indexPath).subarray(0,16).toString() !== 'SQLite format 3\0' : !existsSync(indexPath));
      app = launch(['--memory-vault', vault]);
      s = await connect();
      const reopened = await memoryCall(s, 'workspace_status');
      check(`${prefix}.synthetic_vault_reopens_${malformed ? 'with_malformed' : 'without'}_index`, reopened.result?.vault?.state === 'open', reopened.error?.code ?? '');
      if (malformed) {
        const listed = await memoryCall(s,'memory_list',{cursor:null,limit:25,includeInactive:false});
        check('M.canonical_memory_list_survives_malformed_index', !listed.error && listed.result?.total === 1 && JSON.stringify(listed.result).includes(note));
        const refused = await memoryCall(s,'memory_search',{query:'isolation',includeHistorical:false,cursor:null,limit:25});
        check('M.malformed_index_is_reported_not_ready', refused.error?.code === 'index_not_ready', JSON.stringify(refused.error));
        await searchMemory(s);
        await waitFor(s,"[...document.querySelectorAll('[role=alert]')].some(node=>node.textContent.includes('The index'))",'actual malformed-index search error');
        const message=await s.evaluate("[...document.querySelectorAll('[role=alert]')].map(node=>node.textContent).join(' ')");
        check('U.persistent_index_failure_explains_rebuild', message.includes('Rebuild index') && message.includes('Vault & recovery'), message);
        check('U.failed_search_is_not_empty_result', !(await s.evaluate(has('Nothing matches this search.'))) && await s.evaluate("document.querySelectorAll('button.qr43').length===0"));
        await shot(s,'03-malformed-search');
      }
      await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
      await waitFor(s, "document.querySelectorAll('.act-source').length===3", 'Activity while index cache is absent');
      if (malformed) {
        const [read, payload] = await Promise.all([overview(s),call(s,{operation:'activity_preview_public_payload'})]);
        check('M.activity_reads_survive_malformed_index', read.producer.highestReserved === o.producer.highestReserved && read.pending === null && payload.sha256 === preview.sha256);
      }
      const repair = await memoryCall(s,'index_rebuild');
      if (!repair.result?.operationId) throw new Error(`Index cache rebuild: ${repair.error?.code}`);
      const end = Date.now() + 30000;
      let result;
      do {
        result = (await memoryCall(s,'operation_get',{operationId:repair.result.operationId})).result;
        if (!result || ['failed','cancelled'].includes(result.state)) throw new Error('Index cache rebuild failed');
        if (result.state === 'succeeded') break;
        await sleep(100);
      } while (Date.now() < end);
      check(`${prefix}.${malformed ? 'malformed' : 'missing'}_index_rebuild_succeeds`, result.state === 'succeeded' && existsSync(indexPath) && readFileSync(indexPath).subarray(0,16).toString() === 'SQLite format 3\0');
      check(`${prefix}.cache_recovery_preserves_canonical_vault`, fixtureTree(join(vault,'vault')) === canonical);
      check(`${prefix}.cache_recovery_preserves_activity_bytes`, fixtureTree(manifest.dataRoot) === treeBefore);
      const recovered = await memoryCall(s,'memory_list',{cursor:null,limit:25,includeInactive:false});
      check(`${prefix}.rebuilt_index_returns_approved_memory`, !recovered.error && recovered.result?.total === 1 && JSON.stringify(recovered.result).includes(note));
      if (malformed) {
        const found = await memoryCall(s,'memory_search',{query:'isolation',includeHistorical:false,cursor:null,limit:25});
        check('M.rebuilt_index_search_returns_approved_memory', !found.error && found.result?.items?.length === 1 && JSON.stringify(found.result).includes('isolation'));
        await searchMemory(s);
        await waitFor(s,"document.querySelectorAll('button.qr43').length===1",'actual search after cache rebuild');
        check('U.search_recovers_after_index_rebuild', await s.evaluate("!document.querySelector('[role=alert]')") && await s.evaluate(has('isolation')));
        await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
        await waitFor(s,"document.querySelectorAll('.act-source').length===3",'Activity after Memory recovery');
      }
    }
  }

  await press(s, 'Pause activity sync');
  await waitFor(s, "[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Resume activity sync')", 'paused');
  check('D.pause_is_durable_runner_state', runner('overview').value.producer.paused === true && await disabled(s, 'Run now'));
  await press(s, 'Resume activity sync');
  await waitFor(s, "[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Pause activity sync')", 'resumed');
  check('D.resume', runner('overview').value.producer.paused === false);

  // No collector is configured and the SSH stand-in refuses outside its
  // harness, so the run must commit a failed-source batch and keep it pending.
  // The run-switch drill already made this run through IPC after release.
  if (mode === '--run-switch-lock') await press(s, 'Refresh');
  else {
    await press(s, 'Run now');
    await waitFor(s, has('Batch kept pending'), 'run ended', 60000);
  }
  await waitFor(s, has('#88'), 'pending shown');
  const after = await overview(s);
  check('E.run_now_commits_and_keeps_pending', after.pending?.sequence === 88 && after.pending.failureCount === 1 && after.producer.highestReserved === 88);
  check('E.failed_sources_keep_history', ['github', 'codex', 'claude'].every((id) => after.sources[id].freshness === 'failed' && after.sources[id].total === o.sources[id].total && after.sources[id].lastSuccessAt === o.sources[id].lastSuccessAt));
  check('E.ui_states_retained_history', await s.evaluate(has('Last attempt failed · history retained')));
  if (indexMode) {
    const memories = await memoryCall(s,'memory_list',{cursor:null,limit:25,includeInactive:false});
    check('I.approved_memory_survives_activity_source_failure', !memories.error && memories.result?.total === expectedMemories && (overlapMode || JSON.stringify(memories.result).includes(note)));
    if (['--rebuild-cancel', '--rebuild-partial'].includes(mode)) {
      const found=await memoryCall(s,'memory_search',{query:'isolation',includeHistorical:false,cursor:null,limit:25});
      check('K.original_memory_survives_activity_failure', !found.error && found.result?.items?.length === 1 && JSON.stringify(found.result).includes('isolation'));
    }
    if (mode === '--rebuild-mutations') {
      const found=await memoryCall(s,'memory_search',{query:'isolation',includeHistorical:false,cursor:null,limit:25});
      check('W.original_memory_survives_activity_failure', !found.error && found.result?.items?.length === 1 && JSON.stringify(found.result).includes('isolation'));
    }
  }
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
  else if (mode === '--confirmation') await confirmationMain();
  else if (mode === '--setup-contract') await setupContractMain();
  else if (mode === '--choice-save') await choiceSaveMain();
  else if (mode === '--choice-persistence') await choiceSaveMain();
  else if (['--choice-delete','--choice-clear-remount','--choice-select-recovery'].includes(mode)) await choiceDeleteMain();
  else if (mode === '--run-history') await runHistoryMain();
  else if (mode === '--run-admission') await runAdmissionMain();
  else if (['--runner-hash-change','--runner-missing','--runner-missing-restart'].includes(mode)) await runnerHashMain();
  else if (mode==='--saved-choice-boundary') await savedChoiceBoundaryMain();
  else if (mode==='--saved-choice-read-lock') await (await import('./activity-choice-read-lock.mjs')).savedChoiceReadLockMain({ settings, out, pkg, manifest, fixtureTree, launch, connect, check, press, fillDialog, waitFor, has, overview, sleep, children, shot });
  else if (mode==='--pipe-deadline') await (await import('./activity-pipe-deadline.mjs')).pipeDeadlineMain({ settings, out, pkg, manifest, fixtureTree, launch, connect, check, press, fillDialog, waitFor, has, overview, shot, sleep });
  else if (mode==='--copy-lifecycle') await (await import('./activity-copy-lifecycle.mjs')).copyLifecycleMain({ settings, out, pkg, manifest, fixtureTree, launch, connect, check, press, fillDialog, waitFor, has, overview, shot, sleep });
  else if (mode==='--error-ownership') await (await import('./activity-error-ownership.mjs')).errorOwnershipMain({ settings, out, pkg, manifest, fixtureTree, launch, connect, check, press, fillDialog, waitFor, has, overview, shot, sleep });
  else if (mode==='--sequence-contract') await (await import('./activity-sequence-contract.mjs')).sequenceContractMain({ settings, out, pkg, manifest, fixtureTree, launch, connect, check, press, fillDialog, waitFor, has, overview, shot, sleep });
  else if (mode==='--clear-denial') await (await import('./activity-clear-denial.mjs')).clearDenialMain({ settings, out, pkg, manifest, fixtureTree, launch, connect, check, press, fillDialog, waitFor, has, overview });
  else if (mode==='--future-age') await (await import('./activity-future-age.mjs')).futureAgeMain({ settings, pkg, manifest, fixtureTree, launch, connect, check, press, fillDialog, waitFor, has, overview, shot, sleep });
  else if (mode==='--date-only') await (await import('./activity-date-only.mjs')).dateOnlyMain({ settings, out, pkg, manifest, fixtureTree, launch, connect, check, press, fillDialog, waitFor, has, overview, shot, sleep });
  else if (mode==='--manifest-boundary') await (await import('./activity-manifest-boundary.mjs')).manifestBoundaryMain({ settings, out, pkg, manifest, fixtureTree, launch, connect, check, fillDialog, waitFor, has, overview, shot });
  else if (mode==='--saved-choice-replace-lock') await (await import('./activity-choice-write-lock.mjs')).savedChoiceWriteLockMain({ settings, out, pkg, manifest, fixtureTree, launch, connect, check, fillDialog, waitFor, has, overview, shot, children, replacementOnly: true });
  else if (mode==='--saved-choice-write-lock') await (await import('./activity-choice-write-lock.mjs')).savedChoiceWriteLockMain({ settings, out, pkg, manifest, fixtureTree, launch, connect, check, fillDialog, waitFor, has, overview, shot, children });
  else if (mode === '--run-remount') await runRemountMain();
  else if (mode === '--window-scope') await windowScopeMain();
  else if (['--setup-running','--setup-dialog-race'].includes(mode)) await setupRunningMain();
  else if (mode === '--keyboard') await keyboardMain();
  else if (mode === '--full-days') await fullDaysMain();
  else if (mode === '--read-contract') await readContractMain();
  else if (mode === '--export-contract') await readContractMain(true);
  else if (mode === '--run-contract') await runContractMain();
  else if (mode === '--run-outcome') await runContractMain(true);
  else if (mode === '--run-polling') await runPollingMain();
  else if (mode === '--poll-lifecycle') await pollLifecycleMain();
  else await main();
} catch (err) {
  check('run', false, String(err.message ?? err));
} finally {
  for (const child of children) child.kill();
  if(settingsDirectoryFixture)removeEmptySettingsFixture();
  else rmSync(settings, { force: true });
  const passed = report.checks.filter((c) => c.ok).length;
  report.summary = `${passed}/${report.checks.length}`;
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`checks ${report.summary}`);
  process.exitCode = passed === report.checks.length ? 0 : 1;
}
