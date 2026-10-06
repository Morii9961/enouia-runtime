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

const inputs = process.argv.slice(2, 6);
if (inputs.length !== 4) throw new Error('usage: memory-smoke.mjs <exe> <vault-root> <import-file> <out-dir>');
const [exe, vault, importFile, out] = inputs.map(path => resolve(path));
mkdirSync(out, { recursive: true });
const PORT = 9341;
const report = { checks: [], screenshots: [] };
const children = new Set();
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
  child.exited = new Promise((r) => child.once('exit', (code) => { children.delete(child); r(code); }));
  return child;
}

function session(url) {
  const ws = new WebSocket(url);
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

async function connect(overlay = false, port = PORT) {
  for (let i = 0; i < 160; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = targets.find((t) => t.type === 'page' && t.url.startsWith('http://tauri.localhost/') && t.url.includes('view=overlay') === overlay);
      if (page) {
        const s = session(page.webSocketDebuggerUrl);
        await waitFor(s, "document.readyState === 'complete' && !!document.querySelector('#root > *')", 'page initialized');
        await s.evaluate(HELPERS);
        return s;
      }
    } catch { /* not up yet */ }
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

  const rival = launch(['--memory-vault', vault], { port: PORT + 1, profile: 'conflict-webview2' });
  const other = await connect(false, PORT + 1);
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
  $wins = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, (New-Object $C($A::ClassNameProperty, '#32770')))
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
    throw new Error(`native ${folder ? 'folder' : 'file'} picker: ${String(error.stderr).slice(-1600)}`);
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

async function main() {
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
  for (const child of children) child.kill();
  const passed = report.checks.filter((c) => c.ok).length;
  report.summary = `${passed}/${report.checks.length}`;
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`checks ${report.summary}`);
  process.exitCode = passed === report.checks.length ? 0 : 1;
}
