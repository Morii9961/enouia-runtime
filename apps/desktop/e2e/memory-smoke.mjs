// Real-app check of Runtime's Memory integration (ADR-025) on a synthetic Vault.
//
// Starts the built desktop shell with WebView2 remote debugging on a loopback
// port, drives the real page over the Chrome DevTools Protocol (real Tauri
// IPC, real pinned Memory Core), fills the native Open dialog of that process
// through UI Automation, and writes screenshots plus report.json.
//
//   node apps/desktop/e2e/memory-smoke.mjs <exe> <vault-root> <import-file> <out-dir>
//
// The Vault root must already exist (for example `enouia-memory init <dir>
// --confirm-new-vault` from the pinned Memory revision) and must not sit under
// a Git working tree. Synthetic data only. The debug port exists only for this
// test process.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

const inputs = process.argv.slice(2, 6);
if (inputs.length !== 4) throw new Error('usage: memory-smoke.mjs <exe> <vault-root> <import-file> <out-dir>');
const [exe, vault, importFile, out] = inputs.map(path => resolve(path));
mkdirSync(out, { recursive: true });
async function unusedPort() {
  const listener = createServer();
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
  const port = listener.address().port;
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}
const PORT = await unusedPort();
const report = { checks: [], screenshots: [] };
const children = new Set();
const processesByPort = new Map();
const sessions = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (id, ok, detail = '') => {
  report.checks.push({ id, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${detail}`);
};

function launch(args, { port = PORT, profile = 'webview2' } = {}) {
  const child = spawn(exe, [...args, '--hotkey-key', 'Q'], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,
      WEBVIEW2_USER_DATA_FOLDER: join(out, profile),
    },
    stdio: 'ignore',
  });
  children.add(child);
  processesByPort.set(port, child);
  child.exited = new Promise((r) => child.once('exit', (code) => { children.delete(child); r(code); }));
  return child;
}

function session(url) {
  const ws = new WebSocket(url);
  sessions.add(ws);
  ws.onclose = () => sessions.delete(ws);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const ready = new Promise((r) => (ws.onopen = r));
  const send = async (method, params = {}) => {
    await ready;
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

// The port may be claimed between selection and launch. Refuse CDP unless
// its listener belongs to a WebView2 descendant of our own spawned host.
function assertDebugOwner(port) {
  const child = processesByPort.get(port);
  if (!child || child.exitCode !== null) throw new Error('test host is not running');
  const script = `$ErrorActionPreference = 'Stop'
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort ${port})
if ($listeners.Count -ne 1) { throw 'unexpected debug listeners' }
$ancestor = [uint32]$listeners[0].OwningProcess
for ($depth = 0; $depth -lt 16 -and $ancestor -ne 0; $depth++) {
  if ($ancestor -eq ${child.pid}) { Write-Output 'owned'; exit 0 }
  $entry = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $ancestor)
  if (-not $entry) { break }
  $ancestor = [uint32]$entry.ParentProcessId
}
throw 'debug listener does not belong to test process'`;
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000, stdio: ['ignore', 'ignore', 'pipe'] });
  } catch {
    throw new Error('debug listener does not belong to test process');
  }
}

async function debugOwnerRefusal(app) {
  const foreign = createServer();
  await new Promise((resolve, reject) => { foreign.once('error', reject); foreign.listen(0, '127.0.0.1', resolve); });
  const port = foreign.address().port;
  processesByPort.set(port, app); // This Node listener is not a child of app.
  let refused = false;
  try { assertDebugOwner(port); }
  catch (error) { refused = error.message === 'debug listener does not belong to test process'; }
  finally {
    processesByPort.delete(port);
    await new Promise(resolve => foreign.close(resolve));
  }
  check('W04.foreign_debug_listener_refused', refused);
  if (!refused) throw new Error('debug ownership guard failed');
}

async function connect(overlay = false, port = PORT) {
  for (let i = 0; i < 160; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = targets.find((t) => t.type === 'page' && t.url.startsWith('http://tauri.localhost/') && t.url.includes('view=overlay') === overlay);
      if (page) {
        assertDebugOwner(port);
        const s = session(page.webSocketDebuggerUrl);
        await waitFor(s, "document.readyState === 'complete' && !!document.querySelector('#root > *')", 'page initialized');
        await s.evaluate(HELPERS);
        return s;
      }
    } catch (error) {
      if (error.message === 'debug listener does not belong to test process' || error.message === 'test host is not running') throw error;
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('no page');
}

const HELPERS = `
window.__t = {
  byText(sel, text) { return [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(text)); },
  async click(sel, text) {
    for (let i = 0; i < 150; i++) {
      const e = this.byText(sel, text);
      if (e && !e.disabled) { e.click(); return true; }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('missing or disabled ' + sel + ' ' + text);
  },
  set(sel, value) {
    const e = document.querySelector(sel); if (!e) throw new Error('missing ' + sel);
    const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, value);
    e.dispatchEvent(new Event('input', { bubbles: true })); return true;
  },
  text() { return document.body.innerText; },
  invoke(cmd, args) { return window.__TAURI_INTERNALS__.invoke(cmd, args).then((v) => ({ ok: v }), (e) => ({ err: String(e) })); },
  request(command, args) {
    return { schemaVersion: 1, requestId: 'req_' + crypto.randomUUID(), command, idempotencyKey: null, arguments: args };
  },
};`;

async function waitFor(s, expression, label, ms = 30000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try { if (await s.evaluate(expression)) return true; } catch { /* page busy */ }
    await sleep(150);
  }
  const text = await s.evaluate('document.body.innerText.slice(-600)').catch(() => '');
  throw new Error(`timeout: ${label} | ${String(text).replace(/\s+/g, ' ')}`);
}

async function shot(s, name) {
  const r = await s.send('Page.captureScreenshot', { format: 'png' });
  const file = join(out, `${name}.png`);
  writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  report.screenshots.push(`${name}.png`);
}

const has = (text) => `document.body.innerText.includes(${JSON.stringify(text)})`;
const nav = (s, label) => s.evaluate(`document.querySelector('nav button[aria-label=${JSON.stringify(label)}]').click()`);
const rail = (s, label) => s.evaluate(`__t.click('aside button.qr26', ${JSON.stringify(label)})`);
const click = (s, sel, text) => s.evaluate(`__t.click(${JSON.stringify(sel)}, ${JSON.stringify(text)})`);
const set = (s, sel, value) => s.evaluate(`__t.set(${JSON.stringify(sel)}, ${JSON.stringify(value)})`);
const dialogClosed = "!document.querySelector('dialog[open]')";

// Actual Windows input to this test process; CDP key events cannot trigger
// RegisterHotKey. Refuse input unless the foreground window belongs to it.
function pressHotkey(pid) {
  const script = `Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RuntimeKeys {
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort vk, scan; public uint flags, time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Explicit, Size=40)] public struct INPUT { [FieldOffset(0)] public uint type; [FieldOffset(8)] public KEYBDINPUT key; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint count, INPUT[] inputs, int size);
  public static void Press(uint expected) {
    uint current; GetWindowThreadProcessId(GetForegroundWindow(), out current);
    if (current != expected) throw new Exception("test process is not foreground");
    var keys = new ushort[] {17, 18, 81, 81, 18, 17};
    var inputs = new INPUT[6];
    for (int i=0; i<6; i++) { inputs[i].type=1; inputs[i].key.vk=keys[i]; inputs[i].key.flags=i>=3 ? 2u : 0u; }
    if (SendInput(6, inputs, Marshal.SizeOf(typeof(INPUT))) != 6) throw new Exception("SendInput failed");
  }
}
'@
[RuntimeKeys]::Press(${pid})`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 15000, windowsHide: true });
}

async function quickSearch(main, app) {
  let status = await main.evaluate("window.__TAURI_INTERNALS__.invoke('shell_status')");
  check('Q.hotkey_registered', status.hotkey.state === 'registered' && status.hotkey.combo === 'Ctrl+Alt+Q', JSON.stringify(status.hotkey));
  await main.evaluate("window.__TAURI_INTERNALS__.invoke('shell_show')");
  pressHotkey(app.pid);
  await waitFor(main, "window.__TAURI_INTERNALS__.invoke('shell_status').then(s => s.overlayVisible)", 'OS hotkey opened overlay');
  const overlay = await connect(true);
  await overlay.evaluate(`window.__focusTrace = []; ['focus','blur'].forEach(name => window.addEventListener(name, () => window.__focusTrace.push({name, at:Date.now()})));`);
  check('Q.os_hotkey_opens_search', await overlay.evaluate("document.activeElement?.id === 'quick-query'"));
  const search = async (text) => {
    await overlay.evaluate("window.__focusTrace.push({name:'before-set', focused:document.hasFocus(), at:Date.now()})");
    await set(overlay, '#quick-query', text);
    await overlay.evaluate("window.__focusTrace.push({name:'after-set', query:document.querySelector('#quick-query').value, focused:document.hasFocus(), at:Date.now()})");
    await overlay.evaluate("document.querySelector('form').requestSubmit()");
    await overlay.evaluate("window.__focusTrace.push({name:'after-submit', query:document.querySelector('#quick-query').value, focused:document.hasFocus(), at:Date.now()})");
  };
  await search('paper sketchbook');
  try { await waitFor(overlay, "[...document.querySelectorAll('.quick-results li')].some(row => row.textContent.includes('paper sketchbook'))", 'approved search result'); }
  catch (error) {
    check('Q.search_diagnostic', false, JSON.stringify(await overlay.evaluate("({query:document.querySelector('#quick-query').value, focused:document.hasFocus(), busy:document.querySelector('main').getAttribute('aria-busy'), trace:window.__focusTrace})")));
    check('Q.window_diagnostic', false, JSON.stringify(await main.evaluate("window.__TAURI_INTERNALS__.invoke('shell_status')")));
    await shot(overlay, '08-quick-search-failed');
    throw error;
  }
  check('Q.approved_search', await overlay.evaluate("document.querySelectorAll('.quick-results li').length === 1"));
  await shot(overlay, '08-quick-search');
  await search('<img src=x');
  await waitFor(overlay, has('<img src=x'), 'literal search markup');
  check('Q.text_only', await overlay.evaluate("!document.querySelector('main img') && window.__xss === undefined"));

  for (const command of ['workspace_status', 'memory_list', 'memory_detail', 'source_excerpt', 'remember', 'vault_lock']) {
    const result = await overlay.evaluate(`__t.invoke('memory_call', { request: {...__t.request(${JSON.stringify(command)}, {}), window:'main', surface:'workspace'} })`);
    check(`Q.scope_${command}`, result.err === 'permission_denied', JSON.stringify(result));
  }
  for (const command of ['memory_pick', 'shell_status', 'shell_search', 'shell_exit']) {
    const result = await overlay.evaluate(`__t.invoke(${JSON.stringify(command)}, {kind:'vault_root'})`);
    check(`Q.acl_${command}`, !!result.err && /not allowed|permission_denied/.test(result.err), JSON.stringify(result));
  }
  // Delay a real Core response, edit while pending, then release it. A stale
  // result must not repopulate the page. This is synthetic delivery timing.
  const heldSearch = async () => {
    await set(overlay, '#quick-query', 'paper sketchbook');
    await overlay.evaluate(`(() => { window.__held = false;
      const callbacks = window.__TAURI_INTERNALS__.callbacks;
      const before = new Set(callbacks.keys());
      document.querySelector('form').requestSubmit();
      const added = [...callbacks.keys()].filter(id => !before.has(id));
      if (added.length !== 2) throw new Error('search must register its success/error callbacks');
      const original = callbacks.get(added[0]);
      callbacks.set(added[0], result => { window.__held = true; window.__release = () => original(result); }); })()`);
  };
  await heldSearch();
  await waitFor(overlay, 'window.__held === true', 'delayed search');
  await set(overlay, '#quick-query', 'new query');
  await overlay.evaluate('window.__release()');
  await sleep(300);
  const edited = await overlay.evaluate("({query:document.querySelector('#quick-query').value, rows:document.querySelectorAll('.quick-results li').length, error:!!document.querySelector('[role=alert]'), focused:document.hasFocus(), trace:window.__focusTrace})");
  check('Q.edit_discards_delayed_result', edited.rows === 0 && !edited.error && (edited.query === 'new query' || (!edited.focused && edited.query === '')), JSON.stringify(edited));
  await heldSearch();
  await waitFor(overlay, 'window.__held === true', 'delayed hidden search');
  await overlay.send('Input.dispatchKeyEvent', { type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27 });
  await waitFor(main, "window.__TAURI_INTERNALS__.invoke('shell_status').then(s => !s.overlayVisible)", 'escape hides');
  await overlay.evaluate('window.__release()');
  await sleep(300);
  check('Q.hide_discards_delayed_result', await overlay.evaluate("document.querySelector('#quick-query').value === '' && !document.querySelector('.quick-results li')"));
  await main.evaluate("window.__TAURI_INTERNALS__.invoke('shell_search')");
  await search('paper sketchbook');
  await waitFor(overlay, "[...document.querySelectorAll('.quick-results li')].some(row => row.textContent.includes('paper sketchbook'))", 'search before lock');
  await main.evaluate("__t.invoke('memory_call', {request:__t.request('vault_lock',{})})");
  await waitFor(main, "window.__TAURI_INTERNALS__.invoke('shell_status').then(s => !s.overlayVisible)", 'lock hides');
  check('Q.lock_clears_text', await overlay.evaluate("document.querySelector('#quick-query').value === '' && !document.querySelector('.quick-results li')"));
  await main.evaluate("window.__TAURI_INTERNALS__.invoke('shell_search')");
  await search('paper sketchbook');
  await waitFor(overlay, has('The Vault is not open, or it is locked'), 'locked search refusal');
  check('Q.locked_error_visible', true);
  await overlay.evaluate("__t.click('button','Open main window')");
  await waitFor(main, "window.__TAURI_INTERNALS__.invoke('shell_status').then(s => s.visible && !s.overlayVisible)", 'overlay returns to main');
  check('Q.open_main', true);
  await main.evaluate("__t.invoke('memory_call', {request:__t.request('vault_unlock',{})})");
  overlay.close();

  const rivalPort = await unusedPort();
  const rival = launch(['--memory-vault', vault], { port: rivalPort, profile: 'conflict-webview2' });
  const other = await connect(false, rivalPort);
  await waitFor(other, has('Memory · No Vault open'), 'second process refused occupied Vault');
  check('W03.second_process_cannot_open_same_vault', true);
  await waitFor(other, has('already reserved by another Runtime'), 'occupied Vault explanation');
  const admission = await other.evaluate("window.__TAURI_INTERNALS__.invoke('shell_status')");
  check('W03.occupied_vault_is_explained', admission.vaultAdmissionError === 'root_in_use');
  await shot(other, '09-vault-occupied');
  const primary = await main.evaluate("__t.invoke('memory_call', {request:__t.request('workspace_status',{})})");
  check('W03.first_process_keeps_vault', primary.ok?.result?.vault?.state === 'open');
  const conflict = await other.evaluate("window.__TAURI_INTERNALS__.invoke('shell_status')");
  check('Q.conflict_reported', conflict.hotkey.state === 'conflict', JSON.stringify(conflict.hotkey));
  await nav(other, 'Settings');
  await waitFor(other, has('shortcut already in use'), 'visible conflict');
  await click(other, '[aria-label="Windows shell"] button', 'Open Quick Search');
  await waitFor(other, "window.__TAURI_INTERNALS__.invoke('shell_status').then(s => s.overlayVisible)", 'conflict fallback');
  check('Q.conflict_has_manual_fallback', true);
  await other.evaluate("window.__TAURI_INTERNALS__.invoke('shell_exit')");
  const exit = await Promise.race([rival.exited, sleep(20000).then(() => 'timeout')]);
  check('Q.conflict_process_exits', exit === 0);
  other.close();
  await main.evaluate("window.__TAURI_INTERNALS__.invoke('shell_show')");
}

// Fill this process's native dialog through UI Automation. File-name edit
// 1148 and folder-name edit 1152 differ; button 1 confirms either dialog.
function fillOpenDialog(pid, path, folder = false) {
  const script = `Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A = [System.Windows.Automation.AutomationElement]
$C = [System.Windows.Automation.PropertyCondition]
$root = $A::RootElement
$dialog = $null
for ($i = 0; $i -lt 80 -and -not $dialog; $i++) {
  $wins = $root.FindAll([System.Windows.Automation.TreeScope]::Children, (New-Object $C($A::ClassNameProperty, '#32770')))
  foreach ($w in $wins) { if ($w.Current.ProcessId -eq ${pid}) { $dialog = $w } }
  if (-not $dialog) { Start-Sleep -Milliseconds 250 }
}
if (-not $dialog) { throw 'no dialog' }
Add-Type -Namespace E2E -Name User32 -MemberDefinition '[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern System.IntPtr SendMessage(System.IntPtr h, uint m, System.IntPtr w, string l);'
$all = $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
$edit = $all | Where-Object { $_.Current.ClassName -eq 'Edit' -and $_.Current.AutomationId -eq '${folder ? '1152' : '1148'}' } | Select-Object -First 1
$open = $all | Where-Object { $_.Current.ClassName -eq 'Button' -and $_.Current.AutomationId -eq '1' } | Select-Object -First 1
if (-not $edit -or -not $open) {
  $controls = $all | Where-Object { $_.Current.ClassName -in @('Edit','Button') } | ForEach-Object { $_.Current.ClassName + ':' + $_.Current.AutomationId + ':' + $_.Current.Name }
  throw ('dialog controls not found: ' + ($controls -join ' | '))
}
[E2E.User32]::SendMessage([System.IntPtr]$edit.Current.NativeWindowHandle, 0x000C, [System.IntPtr]::Zero, '${path.replace(/'/g, "''")}') | Out-Null
[E2E.User32]::SendMessage([System.IntPtr]$open.Current.NativeWindowHandle, 0x00F5, [System.IntPtr]::Zero, $null) | Out-Null`;
  try {
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true, timeout: 30000 });
  } catch (error) {
    throw new Error(`native ${folder ? 'folder' : 'file'} picker (${error.code ?? error.status}): ${String(error.stderr).slice(-1600)}`);
  }
}

async function acceptFirstCandidate(s, expected, probeShortcut = false) {
  await waitFor(s, `[...document.querySelectorAll('article.mem-candidate textarea')].some((t) => t.value.includes(${JSON.stringify(expected)}))`, 'candidate listed');
  await click(s, 'article.mem-candidate button', 'Accept');
  await waitFor(s, "!!document.querySelector('dialog[open]')", 'plan dialog');
  if (probeShortcut) {
    // Ctrl+4 would switch to Sessions; a review dialog owns the keyboard.
    await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: '4', code: 'Digit4', modifiers: 2, windowsVirtualKeyCode: 52 });
    await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: '4', code: 'Digit4', modifiers: 2, windowsVirtualKeyCode: 52 });
    await sleep(300);
    check('W05.shortcut_inert_under_dialog', await s.evaluate("!!document.querySelector('dialog[open]') && !!document.querySelector('[data-screen-label=\"Memory Vault\"]')"));
  }
  const plan = await s.evaluate(`({ text: document.querySelector('dialog[open] pre').textContent, button: __t.byText('dialog[open] button', 'Confirm').textContent })`);
  await click(s, 'dialog[open] button', 'Confirm');
  await waitFor(s, dialogClosed, 'plan confirmed');
  return plan;
}

// Hold one real operation observation in Tauri's debug callback map. This
// controls delivery only; cancellation and completion still run in Core.
async function holdOperationObservation(s, memoryPage = false) {
  await s.evaluate(`(() => {
    window.__operationHeld = false;
    const callbacks = window.__TAURI_INTERNALS__.callbacks;
    const originalSet = callbacks.set;
    callbacks.set = function(id, callback) {
      return originalSet.call(this, id, value => {
        if (!window.__operationHeld && ${memoryPage ? 'Array.isArray(value?.result?.items)' : "value?.result?.operationId && typeof value.result.state === 'string'"}) {
          callbacks.set = originalSet;
          window.__operationHeld = true;
          window.__operationObserved = value.result;
          window.__releaseOperation = replacement => callback(replacement ?? value);
        } else callback(value);
      });
    };
  })()`);
}

async function operationChecks(s, app) {
  await nav(s, 'Memory');
  await rail(s, 'Import');
  await click(s, 'button', 'Choose file');
  fillOpenDialog(app.pid, importFile);
  await waitFor(s, has('recognized,'), 'long synthetic import preview');
  await click(s, 'button', 'Start import');
  await waitFor(s, "!![...document.querySelectorAll('.mem-operation button')].find(b => b.textContent === 'Cancel' && !b.disabled)", 'cooperative cancel available');
  check('W02.import_has_cancel', true);
  await click(s, '.mem-operation button', 'Cancel');
  await waitFor(s, "!!document.querySelector('.mem-state-cancelled')", 'import cancellation acknowledged by Core', 60000);
  const stopped = await s.evaluate("__t.invoke('memory_call', { request: __t.request('operation_list',{}) })");
  check('W02.import_cancelled_in_core', stopped.ok?.result?.items?.some(op => op.kind === 'import' && op.state === 'cancelled'));
  await waitFor(s, "!![...document.querySelectorAll('button')].find(b => b.textContent === 'Resume')", 'interrupted import resumable');
  await holdOperationObservation(s);
  await click(s, 'button', 'Resume');
  await waitFor(s, 'window.__operationHeld', 'new operation observation deferred');
  check('W02.new_operation_clears_previous_result', await s.evaluate("document.body.innerText.includes('Operation queued…') && !document.querySelector('.mem-state-cancelled')"));
  await s.evaluate('window.__releaseOperation()');
  await waitFor(s, "!!document.querySelector('.mem-state-succeeded')", 'import resume succeeded', 120000);
  const imports = await s.evaluate("__t.invoke('memory_call', { request: __t.request('import_list',{}) })");
  check('W02.import_resume_completes', imports.ok?.result?.items?.some(row => row.status === 'completed' && row.counts.sources_created === 500), JSON.stringify(imports.ok?.result?.items?.map(row => ({status:row.status, sources:row.counts.sources_created}))));
  await shot(s, '10-import-resumed');

  await rail(s, 'Vault & recovery');
  await holdOperationObservation(s);
  await click(s, 'button', 'Verify Vault');
  await waitFor(s, 'window.__operationHeld', 'verify observation deferred');
  // A synthetic read failure exercises the UI retry, not a failed Core job.
  await s.evaluate(`window.__releaseOperation({kind:'memory_error', result:null,
    error:{code:'busy',retryable:true,rules:['fixture.operation_read']}})`);
  await waitFor(s, has('Could not read the operation'), 'operation read error');
  check('W02.operation_read_error_visible', true);
  await click(s, '[role="alert"] button', 'Retry');
  await waitFor(s, "!!document.querySelector('.mem-state-succeeded')", 'retry reads verified result', 60000);
  const verified = await s.evaluate("__t.invoke('memory_call', { request: __t.request('operation_list',{}) })");
  check('W02.operation_read_retry_recovers', verified.ok?.result?.items?.some(op => op.kind === 'vault_verify' && op.state === 'succeeded' && op.result.clean));
  check('W02.verify_has_no_cancel', await s.evaluate("!document.querySelector('.mem-operation button')"));
  await shot(s, '11-verify-retry');
}

async function explorerChecks(s) {
  await s.evaluate(`window.__seedMemory = async index => {
    const send = async (command, args, write = false) => {
      const request = __t.request(command, args);
      if (write) request.idempotencyKey = 'ui-' + crypto.randomUUID();
      const response = await window.__TAURI_INTERNALS__.invoke('memory_call', {request});
      if (response.kind === 'memory_error') throw new Error(command + ': ' + response.error.code);
      return response.result;
    };
    const candidate = await send('remember', {text:'Synthetic paging fact ' + index,claimKey:'fixture.paging_' + index}, true);
    const plan = await send('review_plan', {decisions:[{candidateId:candidate.candidateId,revision:candidate.revision,action:'accept',editedContent:null,mergeTarget:null}]});
    await send('review_confirm', {planId:plan.planId,diffHash:plan.diffHash}, true);
  };
  (async () => { for (let index = 0; index < 26; index++) await window.__seedMemory(index); })()`);
  await nav(s, 'Memory');
  await rail(s, 'Current memories');
  await waitFor(s, "document.querySelectorAll('button.qr43').length === 25", 'first bounded memory page');
  check('W02.explorer_first_page', true);
  await click(s, 'button.qr43', 'Synthetic paging fact');
  await waitFor(s, "!!document.querySelector('aside[aria-label=" + JSON.stringify('Memory Inspector') + "] .mem-content')", 'selected memory detail');
  await holdOperationObservation(s, true);
  await set(s, '[aria-label="Search memories"]', 'no-synthetic-fact-matches-this');
  await s.evaluate("document.querySelector('[data-screen-label=\"Memory Vault\"] form[role=search]').requestSubmit()");
  await waitFor(s, 'window.__operationHeld', 'new search observation deferred');
  check('W02.new_query_clears_previous_rows', await s.evaluate("!document.querySelector('button.qr43')"));
  check('W02.new_query_clears_selected_detail', await s.evaluate("!document.querySelector('aside[aria-label=\"Memory Inspector\"] .mem-content')"));
  await s.evaluate(`window.__releaseOperation({kind:'memory_error',result:null,
    error:{code:'busy',retryable:true,rules:['fixture.memory_read']}})`);
  await waitFor(s, "!!document.querySelector('[role=alert]')", 'visible failed search read');
  check('W02.failed_search_is_not_empty_result', await s.evaluate("!document.body.innerText.includes('Nothing matches this search.') && !document.querySelector('button.qr43')"));
  await click(s, '[role="alert"] button', 'Retry');
  await waitFor(s, has('Nothing matches this search.'), 'retried empty search');
  check('W02.search_retry_recovers', await s.evaluate("!document.querySelector('[role=alert]') && !document.querySelector('button.qr43')"));
  const reset = async () => {
    await set(s, '[aria-label="Search memories"]', '');
    await s.evaluate("document.querySelector('[data-screen-label=\"Memory Vault\"] form[role=search]').requestSubmit()");
    await waitFor(s, "document.querySelectorAll('button.qr43').length === 25", 'new first page');
  };
  await reset();
  await click(s, 'button', 'Load more');
  await waitFor(s, "document.querySelectorAll('button.qr43').length === 26", 'second memory page');
  check('W02.paging_appends_unique_rows', await s.evaluate("new Set([...document.querySelectorAll('button.qr43 .qr39')].map(row => row.textContent)).size === 26"));
  await reset();
  await s.evaluate('window.__seedMemory(26)');
  await click(s, 'button', 'Load more');
  await waitFor(s, has('workspace.cursor_stale'), 'canonical stale cursor refusal');
  check('W02.stale_cursor_preserves_loaded_page', await s.evaluate("document.querySelectorAll('button.qr43').length === 25"));
  check('W02.stale_cursor_has_refresh', await s.evaluate("!![...document.querySelectorAll('button')].find(button => button.textContent === 'Refresh results')"));
  await click(s, 'button', 'Refresh results');
  await waitFor(s, "document.querySelectorAll('button.qr43').length === 25 && !document.querySelector('[role=alert]')", 'fresh cursor recovery');
  await click(s, 'button', 'Load more');
  await waitFor(s, "document.querySelectorAll('button.qr43').length === 27", 'all records after refresh');
  check('W02.stale_cursor_refresh_recovers', await s.evaluate("new Set([...document.querySelectorAll('button.qr43 .qr39')].map(row => row.textContent)).size === 27"));
  await shot(s, '12-explorer-paging');
}

async function main() {
  if (process.argv[6] === '--explorer-only') {
    const app = launch(['--memory-vault', vault]);
    await debugOwnerRefusal(app);
    const s = await connect();
    await waitFor(s, has('Memory · Vault open'), 'explorer fixture open');
    await explorerChecks(s);
    await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_exit')");
    const code = await Promise.race([app.exited, sleep(20000).then(() => 'timeout')]);
    check('W02.explorer_host_exits', code === 0);
    s.close();
    return;
  }
  if (process.argv[6] === '--operations-only') {
    const app = launch(['--memory-vault', vault]);
    await debugOwnerRefusal(app);
    const s = await connect();
    await waitFor(s, has('Memory · Vault open'), 'operation fixture open');
    await operationChecks(s, app);
    await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_exit')");
    const code = await Promise.race([app.exited, sleep(20000).then(() => 'timeout')]);
    check('W02.operation_host_exits', code === 0);
    s.close();
    return;
  }
  if (process.argv[6] === '--quick-only') {
    const app = launch(['--memory-vault', vault]);
    const s = await connect();
    await quickSearch(s, app);
    await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_exit')");
    await app.exited;
    s.close();
    return;
  }
  // No default root: without --memory-vault nothing is opened.
  let app = launch([]);
  await debugOwnerRefusal(app);
  let s = await connect();
  await waitFor(s, has('No Vault open'), 'no vault');
  check('D.no_default_root', await s.evaluate(has('Memory · No Vault open')));
  await nav(s, 'Memory');
  await click(s, 'button', 'Open an existing Vault');
  fillOpenDialog(app.pid, vault, true);
  await waitFor(s, has('Memory · Vault open'), 'Vault opened through native folder picker');
  check('W01.vault_folder_picker', true);
  check('W04.folder_picker_keeps_path_native', !(await s.evaluate('__t.text()')).includes(vault));
  s.close(); app.kill(); await app.exited; await sleep(800);

  app = launch(['--memory-vault', vault]);
  s = await connect();
  await waitFor(s, has('Memory · Vault open'), 'vault open badge');
  check('W03.process_termination_releases_root', true);
  check('S.badge_states_memory_and_activity', await s.evaluate(`${has('Memory · Vault open')} && ${has('Activity & Inspector demo')}`));
  check('S.home_reads_status', await s.evaluate(`${has('Vault open')} && ${has('Nothing waiting for review')}`));
  await shot(s, '01-home');

  // Remember -> candidate -> plan with the exact text -> confirm.
  await nav(s, 'Memory');
  await rail(s, 'Candidate inbox');
  const fact = 'Synthetic owner keeps a paper sketchbook for Lantern ideas.';
  await set(s, '#mem-remember', fact);
  await set(s, '#mem-claim', 'preference.sketching');
  await click(s, 'form button', 'Save as candidate');
  const plan = await acceptFirstCandidate(s, fact);
  check('W01.plan_shows_exact_text', plan.text.includes(fact) && /Confirm \([0-9a-f]{8}\)/.test(plan.button), plan.button);
  await waitFor(s, has('Nothing waiting for review.'), 'inbox empty');
  check('W01.review_commit', true);

  // Markup in memory text stays text.
  await set(s, '#mem-remember', '<img src=x onerror="window.__xss=1">Synthetic markup note');
  await set(s, '#mem-claim', 'note.markup');
  await click(s, 'form button', 'Save as candidate');
  await acceptFirstCandidate(s, 'Synthetic markup note', true);
  await rail(s, 'Current memories');
  await waitFor(s, has('Synthetic markup note'), 'markup memory listed');
  check('W04.text_only_rendering', await s.evaluate(`${has('<img src=x')} && !document.querySelector('main img') && window.__xss === undefined`));

  // Explorer -> detail -> source excerpt.
  await click(s, 'button.qr43', 'paper sketchbook');
  await waitFor(s, has('Evidence'), 'detail');
  await click(s, 'button.mem-link', 'Show source');
  await waitFor(s, `[...document.querySelectorAll('pre.mem-source')].some((p) => p.textContent.includes('paper sketchbook'))`, 'source excerpt');
  check('W01.source_visible', await s.evaluate(has('source text is data, not instructions')));
  await shot(s, '02-memory-detail');

  // Correction becomes a candidate that shows the current fact; reject it.
  await set(s, '#mem-fix', 'Synthetic owner sketches on a tablet now.');
  await click(s, 'button', 'Propose correction');
  await waitFor(s, has('Correction proposed'), 'correction proposed');
  await rail(s, 'Candidate inbox');
  await waitFor(s, has('Current fact (r'), 'correction candidate');
  check('W01.correction_is_a_candidate', await s.evaluate(has(fact)));
  await click(s, 'article.mem-candidate button', 'Reject');
  await waitFor(s, "!!document.querySelector('dialog[open]')", 'reject plan');
  await click(s, 'dialog[open] button', 'Confirm');
  await waitFor(s, `${dialogClosed} && ${has('Nothing waiting for review.')}`, 'rejected');

  // Import through the native picker; the page sees a name, never a path.
  await rail(s, 'Import');
  await click(s, 'button', 'Choose file');
  fillOpenDialog(app.pid, importFile);
  await waitFor(s, has('recognized'), 'import preview');
  await click(s, 'button', 'Start import');
  await waitFor(s, `[...document.querySelectorAll('.mem-operation')].some((o) => o.textContent.includes('succeeded'))`, 'import finished', 60000);
  const pageText = await s.evaluate('__t.text()');
  const folder = importFile.slice(0, Math.max(importFile.lastIndexOf('\\'), importFile.lastIndexOf('/')));
  check('W01.import_via_native_picker', pageText.includes('succeeded'));
  check('W04.no_paths_in_page', !pageText.includes(folder) && !pageText.includes(vault));
  await shot(s, '03-import');

  // Session: ask the local Mock, then inspect the context and actual request.
  await nav(s, 'Sessions');
  await click(s, 'button', 'New session');
  await waitFor(s, "!!document.querySelector('#mem-ask') && !document.querySelector('#mem-ask').disabled", 'session open');
  await set(s, '#mem-ask', 'What do I keep for Lantern ideas?');
  await click(s, 'form button', 'Send');
  await waitFor(s, has('Answer ·'), 'answer');
  check('W01.answer_from_local_mock', await s.evaluate(has('Sources:')));
  await shot(s, '04-session');
  await click(s, 'button', 'Inspect the context behind this answer');
  await waitFor(s, has('Dispatched'), 'context dispatched');
  await click(s, 'button', 'Show the actual request');
  await waitFor(s, has('re-rendered from the saved records'), 'actual request verified');
  check('W01.inspect_actual_request', true);
  await shot(s, '05-context');
  await set(s, '#mem-cq', 'sketchbook');
  await click(s, 'form button', 'Preview');
  await waitFor(s, has('Preview only'), 'preview');
  check('C.preview_not_sent', true);

  // Long work and the lock.
  await nav(s, 'Memory');
  await rail(s, 'Vault & recovery');
  await click(s, 'button', 'Rebuild index');
  await waitFor(s, `[...document.querySelectorAll('.mem-operation')].some((o) => o.textContent.includes('index_rebuild') && o.textContent.includes('succeeded'))`, 'rebuild', 60000);
  check('W02.rebuild_operation', true);
  await click(s, 'button', 'Lock Vault');
  await waitFor(s, has('Memory · Vault locked'), 'locked');
  const refused = await s.evaluate("__t.invoke('memory_call', { request: __t.request('memory_list', { includeInactive: false, cursor: null, limit: 5 }) })");
  check('W03.lock_refuses', refused.ok?.error?.code === 'vault_locked', JSON.stringify(refused.ok?.error ?? refused));
  await click(s, 'button', 'Unlock');
  await waitFor(s, has('Memory · Vault open'), 'unlocked');
  check('W03.unlock', true);

  // Capability and contract denials from the page.
  const fs = await s.evaluate("__t.invoke('plugin:fs|read_text_file', { path: 'C:\\\\Windows\\\\win.ini' })");
  check('W04.no_fs_plugin', Boolean(fs.err), fs.err ?? '');
  const shell = await s.evaluate("__t.invoke('plugin:shell|execute', { program: 'cmd' })");
  check('W04.no_shell_plugin', Boolean(shell.err), shell.err ?? '');
  const path = await s.evaluate(`__t.invoke('memory_call', { request: __t.request('vault_open', { rootToken: ${JSON.stringify(vault)} }) })`);
  check('W04.path_refused_as_token', path.err === 'root_token_unavailable', JSON.stringify(path));
  const kind = await s.evaluate("__t.invoke('memory_pick', { kind: 'vault' })");
  check('W04.unknown_pick_kind', kind.ok?.error?.rules?.includes('workspace.pick_kind'), JSON.stringify(kind));
  const remote = await s.evaluate("fetch('https://example.com/').then(() => 'fetched', () => 'blocked')");
  check('W04.remote_fetch_blocked', remote === 'blocked', remote);

  // Settings and Activity keep their truthful labels.
  await nav(s, 'Settings');
  await waitFor(s, has('Memory Vault'), 'settings');
  check('S.settings_vault_status', await s.evaluate(`${has('Vault open')} && ${has('Components')}`));
  await shot(s, '06-settings');
  await waitFor(s, has('Available · Show / Lock Memory Vault / Exit'), 'shell settings');
  check('S.shell_status', await s.evaluate(has('Hide to tray · Memory operations keep running')));
  await s.evaluate("document.querySelector('[aria-label=\"Windows shell\"]').scrollIntoView({block:'end'})");
  await shot(s, '07-shell-settings');
  await nav(s, 'Activity');
  check('A.activity_still_demo', await s.evaluate(has('Fictional')));
  await nav(s, 'Runtime');
  check('A.inspector_labelled_fictional', await s.evaluate(has('Fictional · frozen Runtime-local design')));

  // Close-to-tray keeps the same page and Core alive; explicit exit owns shutdown.
  await s.evaluate("document.querySelector('button[aria-label=\"Close\"]').click()");
  await sleep(400);
  const hidden = await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_status')");
  check('W03.close_hides_to_tray', hidden.visible === false && hidden.tray === 'present' && !hidden.closing);
  const stillOpen = await s.evaluate("__t.invoke('memory_call', { request: __t.request('workspace_status', {}) })");
  check('W03.hidden_core_stays_open', stillOpen.ok?.result?.vault?.state === 'open', JSON.stringify(stillOpen.ok?.result?.vault?.state));
  await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_show')");
  const shown = await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_status')");
  check('W03.main_restored', shown.visible === true);
  await quickSearch(s, app);
  await nav(s, 'Settings');
  await click(s, '[aria-label="Windows shell"] button', 'Exit Runtime');
  const code = await Promise.race([app.exited, sleep(20000).then(() => 'timeout')]);
  check('W03.explicit_exit', code === 0, `exit ${code}`);
  s.close();
  await sleep(800);

  // Typed memory text leaves no autofill copy in the WebView2 profile.
  const webData = join(out, 'webview2', 'EBWebView', 'Default', 'Web Data');
  if (existsSync(webData)) {
    const db = new DatabaseSync(webData, { readOnly: true });
    const rows = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'autofill'").get().n
      ? db.prepare('SELECT count(*) AS n FROM autofill').get().n : 0;
    db.close();
    check('W05.no_autofill_copies', rows === 0, `${rows} autofill rows`);
  } else {
    check('W05.no_autofill_copies', true, 'no Web Data file');
  }

  // Restart: committed memories and the session are still there.
  app = launch(['--memory-vault', vault]);
  s = await connect();
  await waitFor(s, has('Memory · Vault open'), 'reopened');
  const rebound = await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_status')");
  check('Q.hotkey_released_on_exit', rebound.hotkey.state === 'registered', JSON.stringify(rebound.hotkey));
  await nav(s, 'Memory');
  await rail(s, 'Current memories');
  await waitFor(s, has('paper sketchbook'), 'memory after restart');
  await nav(s, 'Sessions');
  await waitFor(s, "document.querySelectorAll('.mem-session-row').length > 0", 'session after restart');
  check('W01.persists_after_restart', true);
  s.close();
  app.kill();
  await app.exited;
}

try {
  await main();
} catch (err) {
  check('run', false, String(err.message ?? err));
} finally {
  for (const ws of sessions) ws.close();
  for (const child of children) child.kill();
  const passed = report.checks.filter((c) => c.ok).length;
  report.summary = `${passed}/${report.checks.length}`;
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`checks ${report.summary}`);
  process.exitCode = passed === report.checks.length ? 0 : 1;
}
