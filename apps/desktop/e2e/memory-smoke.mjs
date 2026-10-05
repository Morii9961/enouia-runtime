// Real-app check of Runtime's Memory integration (ADR-025) and companion
// shell (ADR-026) on synthetic Vaults.
//
// Starts the built desktop shell with WebView2 remote debugging on a loopback
// port, drives the real pages over the Chrome DevTools Protocol (real Tauri
// IPC, real pinned Memory Core), fills the native Open/folder dialogs of
// that process through UI Automation, and writes screenshots plus
// report.json.
//
//   node apps/desktop/e2e/memory-smoke.mjs <absolute exe> <vault-root> <import-file> <out-dir> [hotkey-letter]
//
// The Vault root must already exist (for example `enouia-memory init <dir>
// --confirm-new-vault` from the pinned Memory revision). The out directory
// must not sit under a Git working tree: a second Vault is created there.
// The login-startup check writes and then removes Runtime's own Run value;
// it never touches a value that existed before the run. Once the hotkey is
// confirmed registered, the run presses Ctrl+Alt+<letter> once through
// SendInput, so keep the desktop idle while it runs.
// Synthetic data only. The debug ports exist only for this test process.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const [exe, vault, importFile, out, HOTKEY = 'K'] = process.argv.slice(2);
if (!out || !isAbsolute(exe) || !/^[A-Za-z]$/.test(HOTKEY)) {
  throw new Error('usage: memory-smoke.mjs <absolute exe> <vault-root> <import-file> <out-dir> [hotkey-letter]');
}
mkdirSync(out, { recursive: true });
const MAIN_PORT = 9341;
const SECOND_PORT = 9342;
const report = { checks: [], screenshots: [] };
const children = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (id, ok, detail = '') => {
  report.checks.push({ id, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${detail}`);
};

function launch(port, args, profile = 'webview2') {
  const child = spawn(exe, args, {
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

async function connect(port, quick = false) {
  for (let i = 0; i < 160; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const want = quick ? 'overlay' : 'main';
      for (const page of targets.filter((t) => t.type === 'page' && t.url.startsWith('http://tauri.localhost/'))) {
        const s = session(page.webSocketDebuggerUrl);
        await waitFor(s, "document.readyState === 'complete' && !!document.querySelector('#root > *')", 'page initialized');
        // The native window label, not the URL, identifies the window.
        if ((await s.evaluate('window.__TAURI_INTERNALS__.metadata.currentWindow.label')) === want) {
          await s.evaluate(HELPERS);
          return s;
        }
        s.close();
      }
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error(`no ${quick ? 'quick-search' : 'main'} page on ${port}`);
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
  request(command, args, key = null) {
    return { schemaVersion: 1, requestId: 'req_' + crypto.randomUUID(), command, idempotencyKey: key, arguments: args };
  },
  async memory(command, args, key = null) {
    const r = await window.__TAURI_INTERNALS__.invoke('memory_call', { request: this.request(command, args, key) });
    return r;
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
  writeFileSync(join(out, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  report.screenshots.push(`${name}.png`);
}

const has = (text) => `document.body.innerText.includes(${JSON.stringify(text)})`;
const nav = (s, label) => s.evaluate(`document.querySelector('nav button[aria-label=${JSON.stringify(label)}]').click()`);
const rail = (s, label) => s.evaluate(`__t.click('aside button.qr26', ${JSON.stringify(label)})`);
const click = (s, sel, text) => s.evaluate(`__t.click(${JSON.stringify(sel)}, ${JSON.stringify(text)})`);
const set = (s, sel, value) => s.evaluate(`__t.set(${JSON.stringify(sel)}, ${JSON.stringify(value)})`);
const dialogClosed = "!document.querySelector('dialog[open]')";
const statusOf = (s) => s.evaluate("__t.memory('workspace_status', {}).then((r) => r.result)");

function powershell(script, opts = {}) {
  return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

// Fill the native Open or folder dialog of `pid` through UI Automation: the
// name edit gets the path by WM_SETTEXT, then the dialog's default button
// (control 1: Open or Select Folder) gets BM_CLICK. Only windows of this
// process are touched; nothing is typed anywhere if no dialog is found.
function fillDialog(pid, path) {
  powershell(`Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
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
$edit = $all | Where-Object { $_.Current.ClassName -eq 'Edit' -and ($_.Current.AutomationId -eq '1148' -or $_.Current.AutomationId -eq '1152') } | Select-Object -First 1
$open = $all | Where-Object { $_.Current.ClassName -eq 'Button' -and $_.Current.AutomationId -eq '1' } | Select-Object -First 1
if (-not $edit -or -not $open) { throw 'dialog controls not found' }
[E2E.User32]::SendMessage([System.IntPtr]$edit.Current.NativeWindowHandle, 0x000C, [System.IntPtr]::Zero, '${path.replace(/'/g, "''")}') | Out-Null
[E2E.User32]::SendMessage([System.IntPtr]$open.Current.NativeWindowHandle, 0x00F5, [System.IntPtr]::Zero, $null) | Out-Null`);
}

// Visible or hidden state of this process's top-level window with an exact title.
function windowState(pid, title) {
  return powershell(`Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class WindowProbe {
public delegate bool EnumProc(IntPtr h, IntPtr p);
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc e, IntPtr p);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
public static string Probe(uint pid, string want) {
var result="missing";
EnumWindows((h,p)=> { uint id; GetWindowThreadProcessId(h,out id); if(id==pid) {
var title=new StringBuilder(512); GetWindowText(h,title,512);
if(title.ToString()==want) result=IsWindowVisible(h)?"visible":"hidden";
} return true; },IntPtr.Zero); return result;
}}
'@
[WindowProbe]::Probe(${pid}, '${title}')`);
}

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
function runValue() {
  try {
    const text = execFileSync('reg', ['query', RUN_KEY, '/v', 'EnouiaRuntime'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return text.split(/REG_SZ\s+/)[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

// Set only when no Run value existed before this run switched startup on,
// so cleanup removes this run's value and never an owner's own.
let ownRunValue = false;
function removeOwnRunValue() {
  if (ownRunValue && runValue() === `"${exe}" --autostart`) {
    try { execFileSync('reg', ['delete', RUN_KEY, '/v', 'EnouiaRuntime', '/f'], { stdio: 'ignore' }); } catch { /* reported by the check */ }
  }
}
process.on('SIGINT', () => {
  for (const child of children) child.kill();
  removeOwnRunValue();
  process.exit(130);
});

// Ctrl+Alt+<letter> through SendInput. Only called after this process's
// hotkey is confirmed registered, so Windows routes the combination to it
// and no other program receives the letter.
function pressHotkey(letter) {
  powershell(`Add-Type -Namespace E2E -Name Keys -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, System.UIntPtr extra);'
$k = [byte][char]'${letter.toUpperCase()}'
foreach ($vk in 0x11, 0x12, $k) { [E2E.Keys]::keybd_event([byte]$vk, 0, 0, [System.UIntPtr]::Zero) }
foreach ($vk in $k, 0x12, 0x11) { [E2E.Keys]::keybd_event([byte]$vk, 0, 2, [System.UIntPtr]::Zero) }`);
}

async function until(probe, ms = 5000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (probe()) return true;
    await sleep(200);
  }
  return false;
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
  // No default root: without --memory-vault nothing is opened.
  let app = launch(MAIN_PORT, ['--hotkey-key', HOTKEY]);
  let s = await connect(MAIN_PORT);
  await waitFor(s, has('No Vault open'), 'no vault');
  check('D.no_default_root', await s.evaluate(has('Memory · No Vault open')));
  s.close(); app.kill(); await app.exited; await sleep(800);

  app = launch(MAIN_PORT, ['--memory-vault', vault, '--hotkey-key', HOTKEY]);
  s = await connect(MAIN_PORT);
  await waitFor(s, has('Memory · Vault open'), 'vault open badge');
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

  // W02 retry: another process holds the Vault's writer lock, so the write
  // fails as busy and offers Retry; after release, Retry resends the same
  // key and exactly one candidate appears.
  const lockFile = join(vault, 'vault', 'LOCK');
  const holder = spawn('powershell', ['-NoProfile', '-Command',
    `$f = [IO.File]::Open('${lockFile.replace(/'/g, "''")}', 'Open', 'ReadWrite', 'ReadWrite'); $f.Lock(0, [long]::MaxValue); 'locked'; Start-Sleep -Seconds 60`], { stdio: ['ignore', 'pipe', 'ignore'] });
  children.add(holder);
  await new Promise((r) => holder.stdout.once('data', r));
  const before = (await statusOf(s)).pendingCandidates;
  await set(s, '#mem-remember', 'Synthetic retry note under a held writer lock.');
  await set(s, '#mem-claim', 'note.retry');
  await click(s, 'form button', 'Save as candidate');
  await waitFor(s, `[...document.querySelectorAll('[role=alert]')].some((a) => a.textContent.includes('busy') && a.querySelector('button'))`, 'busy with retry', 20000);
  holder.kill();
  await sleep(500);
  await click(s, '[role=alert] button', 'Retry');
  await waitFor(s, `[...document.querySelectorAll('article.mem-candidate textarea')].some((t) => t.value.includes('Synthetic retry note'))`, 'retried candidate');
  const after = (await statusOf(s)).pendingCandidates;
  check('W02.retry_reuses_its_key', after === before + 1, `${before} -> ${after}`);
  await acceptFirstCandidate(s, 'Synthetic retry note');

  // W02 paging: 26 more approved memories through the page channel, then
  // Load more in the explorer.
  await s.evaluate(`(async () => {
    for (let i = 0; i < 26; i++) {
      const p = await __t.memory('remember', { text: 'Synthetic paging note ' + i + '.', claimKey: 'note.paging.' + i }, 'smoke-page-' + crypto.randomUUID());
      const plan = await __t.memory('review_plan', { decisions: [{ candidateId: p.result.candidateId, revision: p.result.revision, action: 'accept', editedContent: null, mergeTarget: null }] });
      await __t.memory('review_confirm', { planId: plan.result.planId, diffHash: plan.result.diffHash }, 'smoke-confirm-' + crypto.randomUUID());
    }
  })()`);
  await rail(s, 'Including history');
  await rail(s, 'Current memories');
  await waitFor(s, "document.querySelectorAll('button.qr43').length === 25 && !!__t.byText('button', 'Load more')", 'first page');
  await click(s, 'button', 'Load more');
  await waitFor(s, "document.querySelectorAll('button.qr43').length === 29", 'second page');
  check('W02.paging_load_more', true);

  // Import through the native picker; the page sees a name, never a path.
  await rail(s, 'Import');
  await click(s, 'button', 'Choose file');
  fillDialog(app.pid, importFile);
  await waitFor(s, has('recognized'), 'import preview');
  await click(s, 'button', 'Start import');
  await waitFor(s, `[...document.querySelectorAll('.mem-operation')].some((o) => o.textContent.includes('succeeded'))`, 'import finished', 60000);
  const pageText = await s.evaluate('__t.text()');
  const folder = importFile.slice(0, Math.max(importFile.lastIndexOf('\\'), importFile.lastIndexOf('/')));
  check('W01.import_via_native_picker', pageText.includes('succeeded'));
  check('W04.no_paths_in_page', !pageText.includes(folder) && !pageText.includes(vault));
  await shot(s, '03-import');

  // W02 cancel and resume: a synthetic ChatGPT export of 3000 conversations
  // (60 batches of 50), cancelled at once. A single-file Markdown export is
  // one unit, so it cannot be cancelled midway.
  const big = join(out, 'conversations.json');
  writeFileSync(big, JSON.stringify(Array.from({ length: 3000 }, (_, i) => ({
    title: 'Synthetic conversation', create_time: 1719900000 + i, update_time: 1719900000 + i,
    conversation_id: `conv-${i}`, id: `conv-${i}`, current_node: `m${i}b`,
    mapping: {
      root: { id: 'root', message: null, parent: null, children: [`m${i}a`] },
      [`m${i}a`]: { id: `m${i}a`, parent: 'root', children: [`m${i}b`], message: { id: `m${i}a`, author: { role: 'user', name: null, metadata: {} }, create_time: 1719900000 + i, content: { content_type: 'text', parts: [`Synthetic question ${i}.`] }, metadata: {}, status: 'finished_successfully' } },
      [`m${i}b`]: { id: `m${i}b`, parent: `m${i}a`, children: [], message: { id: `m${i}b`, author: { role: 'assistant', name: null, metadata: {} }, create_time: 1719900001 + i, content: { content_type: 'text', parts: [`Synthetic answer ${i}.`] }, metadata: {}, status: 'finished_successfully' } },
    },
  }))));
  // A fresh Import panel, so only the new operation's progress is shown.
  await rail(s, 'Current memories');
  await rail(s, 'Import');
  await click(s, 'button', 'Choose file');
  fillDialog(app.pid, big);
  await waitFor(s, has('conversations.json'), 'large preview');
  await click(s, 'button', 'Start import');
  const cancelClick = await s.evaluate(`(async () => {
    for (let i = 0; i < 3000; i++) {
      const op = document.querySelector('.mem-operation');
      if (op) {
        const b = [...op.querySelectorAll('button')].find((x) => x.textContent.includes('Cancel') && !x.disabled);
        if (b) { b.click(); return 'clicked'; }
        if (/succeeded|failed|cancelled/.test(op.textContent)) return 'ended before cancel';
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    return 'timeout';
  })()`);
  await waitFor(s, `[...document.querySelectorAll('.mem-operation')].some((o) => /cancelled|succeeded|failed/.test(o.textContent))`, 'large import ended', 120000);
  const cancelled = await s.evaluate(`[...document.querySelectorAll('.mem-operation')].some((o) => o.textContent.includes('cancelled'))`);
  check('W02.cancel_is_cancelled', cancelled, cancelClick);
  if (cancelled) {
    await waitFor(s, "!!__t.byText('button', 'Resume')", 'resumable import listed');
    // Choosing the interrupted file again points to Resume; Start stays off.
    await click(s, 'button', 'Choose file');
    fillDialog(app.pid, big);
    await waitFor(s, has('which was interrupted'), 'interrupted duplicate preview');
    check('W02.reimport_points_to_resume', await s.evaluate("__t.byText('button', 'Start import').disabled"));
    await click(s, 'button', 'Resume');
    await waitFor(s, `[...document.querySelectorAll('.mem-operation')].some((o) => o.textContent.includes('import_resume') && o.textContent.includes('succeeded'))`, 'resumed import', 180000);
    check('W02.resume_completes', true);
  }

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
  check('W05.focus_follows_inspect', await s.evaluate("document.activeElement?.id === 'mem-context-title'"));
  await click(s, 'button', 'Show the actual request');
  await waitFor(s, has('re-rendered from the saved records'), 'actual request verified');
  check('W01.inspect_actual_request', true);
  await shot(s, '05-context');
  await set(s, '#mem-cq', 'sketchbook');
  await click(s, 'form button', 'Preview');
  await waitFor(s, has('Preview only'), 'preview');
  check('C.preview_not_sent', true);

  // Quick search: its own window, scoped to memory_search.
  const quick = await connect(MAIN_PORT, true);
  await quick.evaluate("__t.set('#mem-q', 'sketchbook')");
  await quick.evaluate("document.querySelector('form').requestSubmit()");
  await waitFor(quick, has('paper sketchbook'), 'quick search result');
  check('W04.quick_search_finds', true);
  const pendingBefore = (await statusOf(s)).pendingCandidates;
  for (const command of ['remember', 'review_confirm', 'forget_plan', 'vault_lock']) {
    const denied = await quick.evaluate(`__t.invoke('memory_call', { request: { ...__t.request(${JSON.stringify(command)}, { text: 'Synthetic denied', claimKey: 'note.denied' }, 'smoke-denied-' + crypto.randomUUID()), window: 'main' } })`);
    check(`W04.quick_search_denies_${command}`, denied.err === 'permission_denied', JSON.stringify(denied));
  }
  check('W04.quick_search_denials_do_not_write', (await statusOf(s)).pendingCandidates === pendingBefore);
  for (const [command, args] of [['memory_pick', { kind: 'vault_root' }], ['exit_app', {}], ['startup_set', { enabled: true }]]) {
    const denied = await quick.evaluate(`__t.invoke(${JSON.stringify(command)}, ${JSON.stringify(args)})`);
    check(`W04.quick_search_denies_${command}`, String(denied.err).includes('not allowed'), JSON.stringify(denied));
  }

  // The real hotkey shows quick search, which comes up empty; Escape hides
  // it even after a click moved focus off the input.
  const QUICK_TITLE = 'Enouia Runtime · Quick search';
  const registered = (await statusOf(s)).companion?.hotkey?.state === 'registered';
  if (registered && windowState(app.pid, QUICK_TITLE) === 'hidden') {
    pressHotkey(HOTKEY);
    check('W05.hotkey_opens_quick_search', await until(() => windowState(app.pid, QUICK_TITLE) === 'visible'));
    await waitFor(quick, "document.querySelector('#mem-q').value === '' && document.querySelectorAll('.mem-quick-results li').length === 0", 'quick search cleared on show');
    check('W05.quick_search_shows_empty', true);
    await quick.evaluate("__t.set('#mem-q', 'sketchbook')");
    await quick.evaluate("document.querySelector('form').requestSubmit()");
    await waitFor(quick, has('paper sketchbook'), 'quick search result again');
    await quick.evaluate('document.activeElement.blur()');
    await quick.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await quick.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    const hidden = await until(() => windowState(app.pid, QUICK_TITLE) === 'hidden');
    const cleared = await quick.evaluate("document.querySelectorAll('.mem-quick-results li').length === 0 && document.querySelector('#mem-q').value === ''");
    check('W05.escape_hides_and_clears', hidden && cleared, `hidden ${hidden}, cleared ${cleared}`);
  } else {
    check('W05.hotkey_opens_quick_search', false, registered ? 'quick search already visible' : 'hotkey not registered; no key sent');
  }

  // Long work and the lock (the lock also clears quick search).
  await nav(s, 'Memory');
  await rail(s, 'Vault & recovery');
  await click(s, 'button', 'Rebuild index');
  await waitFor(s, `[...document.querySelectorAll('.mem-operation')].some((o) => o.textContent.includes('index_rebuild') && o.textContent.includes('succeeded'))`, 'rebuild', 60000);
  check('W02.rebuild_operation', true);
  await click(s, 'button', 'Lock Vault');
  await waitFor(s, has('Memory · Vault locked'), 'locked');
  const refused = await s.evaluate("__t.memory('memory_list', { includeInactive: false, cursor: null, limit: 5 })");
  check('W03.lock_refuses', refused.error?.code === 'vault_locked', JSON.stringify(refused.error));
  await quick.evaluate("__t.set('#mem-q', 'sketchbook')");
  await quick.evaluate("document.querySelector('form').requestSubmit()");
  await waitFor(quick, "document.querySelectorAll('.mem-quick-results li').length === 0 && document.body.innerText.includes('locked')", 'quick search refused while locked');
  check('W03.quick_search_refused_while_locked', true);
  quick.close();

  // W01 folder picker: create a second Vault, then reopen the first.
  const created = join(out, 'created-vault');
  mkdirSync(created, { recursive: true });
  await set(s, '#mem-create-phrase', 'create new vault');
  await click(s, 'button', 'Create Vault');
  fillDialog(app.pid, created);
  await waitFor(s, has('Memory · Vault open'), 'created vault open');
  check('W01.create_via_folder_picker', (await statusOf(s)).vault.rootName === 'created-vault');
  await rail(s, 'Vault & recovery');
  await click(s, 'button', 'Lock Vault');
  await waitFor(s, has('Memory · Vault locked'), 'created locked');
  await click(s, 'button', 'Open an existing Vault');
  fillDialog(app.pid, vault);
  await waitFor(s, `${has('Memory · Vault open')}`, 'original reopened');
  check('W01.open_via_folder_picker', (await statusOf(s)).vault.rootName === vault.split(/[\\/]/).pop());

  // Capability and contract denials from the main page.
  const fs = await s.evaluate("__t.invoke('plugin:fs|read_text_file', { path: 'C:\\\\Windows\\\\win.ini' })");
  check('W04.no_fs_plugin', Boolean(fs.err), fs.err ?? '');
  const shell = await s.evaluate("__t.invoke('plugin:shell|execute', { program: 'cmd' })");
  check('W04.no_shell_plugin', Boolean(shell.err), shell.err ?? '');
  const path = await s.evaluate(`__t.memory('vault_open', { rootToken: ${JSON.stringify(vault)} })`);
  check('W04.path_refused_as_token', path.error?.rules?.includes('workspace.token'), JSON.stringify(path.error));
  const kind = await s.evaluate("__t.invoke('memory_pick', { kind: 'vault' })");
  check('W04.unknown_pick_kind', kind.ok?.error?.rules?.includes('workspace.pick_kind'), JSON.stringify(kind));
  const remote = await s.evaluate("fetch('https://example.com/').then(() => 'fetched', () => 'blocked')");
  check('W04.remote_fetch_blocked', remote === 'blocked', remote);

  // Settings: hotkey, login startup (Runtime's own Run value), labels.
  await nav(s, 'Settings');
  await waitFor(s, has('Window and startup'), 'settings');
  check('W05.hotkey_registered', await s.evaluate(`${has(`Ctrl+Alt+${HOTKEY}`)} && ${has('ready')}`));
  check('S.settings_vault_status', await s.evaluate(`${has('Vault open')} && ${has('Components')}`));
  const startupBefore = runValue();
  if (startupBefore === null) {
    ownRunValue = true;
    await click(s, 'button[role=switch][aria-labelledby=mem-startup-label]', '');
    await waitFor(s, has('Runtime will start in the tray'), 'startup on');
    const value = runValue();
    check('W05.startup_writes_only_its_value', value === `"${exe}" --autostart`, value ?? 'missing');
    await click(s, 'button[role=switch][aria-labelledby=mem-startup-label]', '');
    await waitFor(s, has('Runtime will not start at sign-in'), 'startup off');
    check('W05.startup_removes_its_value', runValue() === null);
  } else {
    check('W05.startup_writes_only_its_value', false, 'a Run value already exists; left untouched');
  }
  await shot(s, '06-settings');
  await nav(s, 'Activity');
  check('A.activity_still_demo', await s.evaluate(has('Fictional')));
  await nav(s, 'Runtime');
  check('A.inspector_labelled_fictional', await s.evaluate(has('Fictional · frozen Runtime-local design')));

  // A second process: login-startup style, the same Vault and hotkey.
  const second = launch(SECOND_PORT, ['--autostart', '--memory-vault', vault, '--hotkey-key', HOTKEY], 'webview2-second');
  const s2 = await connect(SECOND_PORT);
  await sleep(1500);
  check('W05.autostart_initially_hidden', windowState(second.pid, 'Enouia Runtime') === 'hidden');
  const secondStatus = await statusOf(s2);
  check('W03.one_core_per_vault', secondStatus.vault.state === 'none', secondStatus.vault.state);
  check('W05.hotkey_conflict_reported', secondStatus.companion?.hotkey?.state === 'conflict', JSON.stringify(secondStatus.companion?.hotkey));
  // Quick search's "Open Enouia Runtime" is the in-page path to the window.
  const quick2 = await connect(SECOND_PORT, true);
  await quick2.evaluate("__t.click('button', 'Open Enouia Runtime')");
  await sleep(800);
  check('W05.tray_start_can_show', windowState(second.pid, 'Enouia Runtime') === 'visible');
  const mainCannotShow = await s2.evaluate("__t.invoke('show_main')");
  check('W04.main_has_no_show_grant', String(mainCannotShow.err).includes('not allowed'), JSON.stringify(mainCannotShow));
  quick2.close();
  s2.close();
  second.kill();
  await second.exited;

  // W03: closing hides; Memory keeps running; Exit ends the process.
  await s.evaluate("document.querySelector('button[aria-label=\"Close\"]').click()");
  await sleep(800);
  const alive = (await statusOf(s)).vault.state;
  check('W03.close_hides_core_keeps_running', windowState(app.pid, 'Enouia Runtime') === 'hidden' && alive === 'open', alive);
  void s.evaluate("__t.invoke('exit_app')").catch(() => 0);
  const code = await Promise.race([app.exited, sleep(20000).then(() => 'timeout')]);
  check('W03.exit_ends_process', code !== 'timeout', `exit ${code}`);
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
  app = launch(MAIN_PORT, ['--memory-vault', vault, '--hotkey-key', HOTKEY]);
  s = await connect(MAIN_PORT);
  await waitFor(s, has('Memory · Vault open'), 'reopened');
  await nav(s, 'Memory');
  await rail(s, 'Current memories');
  await click(s, 'button', 'Load more');
  await waitFor(s, has('paper sketchbook'), 'memory after restart');
  await nav(s, 'Sessions');
  await waitFor(s, "document.querySelectorAll('.mem-session-row').length > 0", 'session after restart');
  check('W01.persists_after_restart', true);
  void s.evaluate("__t.invoke('exit_app')").catch(() => 0);
  await Promise.race([app.exited, sleep(20000)]);
  s.close();
}

try {
  await main();
} catch (err) {
  check('run', false, String(err.message ?? err));
} finally {
  for (const child of children) child.kill();
  // Never leave this run's login-startup value behind.
  removeOwnRunValue();
  const passed = report.checks.filter((c) => c.ok).length;
  report.summary = `${passed}/${report.checks.length}`;
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`checks ${report.summary}`);
  process.exitCode = passed === report.checks.length ? 0 : 1;
}
