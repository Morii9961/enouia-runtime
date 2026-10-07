// Real-app check of Runtime's Memory integration (ADR-025) and companion
// shell (ADR-026) on synthetic Vaults.
//
// Starts the built desktop shell with WebView2 remote debugging on a loopback
// port, drives the real pages over the Chrome DevTools Protocol (real Tauri
// IPC, real pinned Memory Core), fills the native Open/folder dialogs of
// that process through UI Automation, and writes screenshots plus
// report.json.
//
//   node apps/desktop/e2e/memory-smoke.mjs <absolute exe> <vault-root> <import-file> <out-dir> [focused-mode]
//
// The Vault root must already exist (for example `enouia-memory init <dir>
// --confirm-new-vault` from the pinned Memory revision). The out directory
// must not sit under a Git working tree: a second Vault is created there.
// Login startup is inspected without changing the owner's Run value.
// Ctrl+Alt+Q is sent only while the spawned Runtime is foreground.
// Restart Manager registers only the spawned process identity (PID and
// creation time), never a shared executable path.
// Synthetic data only. The debug ports exist only for this test process.
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
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
const HOTKEY = 'Q';
const report = { checks: [], screenshots: [] };
const children = new Set();
const processesByPort = new Map();
const sessions = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForExit(app, ms) {
  let timer;
  try {
    return await Promise.race([app.exited, new Promise(resolve => { timer = setTimeout(() => resolve('timeout'), ms); })]);
  } finally { clearTimeout(timer); }
}
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

// Physical sizing touches only the main HWND of our own live child. The
// helper thread's DPI context is restored; system display settings stay put.
function ownedWindowMetrics(app, size = null, state = null) {
  if (!children.has(app) || app.exitCode !== null) throw new Error('test host is not running');
  if (state !== null && !['maximize','restore'].includes(state)) throw new Error('invalid owned window state');
  const script = `$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Add-Type -TypeDefinition @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class OwnedWindow {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window,out uint process);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr window,StringBuilder title,int count);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window,out Rect rect);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr window,out Rect rect);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window,int command);
}
'@
$process=Get-Process -Id ${app.pid}
$window=${app.windowHandle ? `[IntPtr]([long]'${app.windowHandle}')` : '$process.MainWindowHandle'}
[uint32]$owner=0
[OwnedWindow]::GetWindowThreadProcessId($window,[ref]$owner) | Out-Null
$title=New-Object System.Text.StringBuilder 256
[OwnedWindow]::GetWindowText($window,$title,256) | Out-Null
if($window -eq [IntPtr]::Zero -or $owner -ne ${app.pid} -or $title.ToString() -ne 'Enouia Runtime') { throw 'main window ownership mismatch' }
$previousContext=[OwnedWindow]::SetThreadDpiAwarenessContext([IntPtr](-4))
if($previousContext -eq [IntPtr]::Zero) { throw 'DPI context unavailable' }
try {
  ${state ? `[OwnedWindow]::ShowWindow($window,${state === 'maximize' ? 3 : 9}) | Out-Null
  Start-Sleep -Milliseconds 200` : ''}
  $dpi=[OwnedWindow]::GetDpiForWindow($window)
  if($dpi -eq 0) { throw 'window DPI unavailable' }
  $outer=New-Object OwnedWindow+Rect; $client=New-Object OwnedWindow+Rect
  if(-not [OwnedWindow]::GetWindowRect($window,[ref]$outer) -or -not [OwnedWindow]::GetClientRect($window,[ref]$client)) { throw 'window bounds unavailable' }
  ${size ? `$width=[int][Math]::Round(${size.width}*$dpi/96)+($outer.Right-$outer.Left-$client.Right)
  $height=[int][Math]::Round(${size.height}*$dpi/96)+($outer.Bottom-$outer.Top-$client.Bottom)
  if(-not [OwnedWindow]::SetWindowPos($window,[IntPtr]::Zero,0,0,$width,$height,0x16)) { throw 'owned resize failed' }
  Start-Sleep -Milliseconds 200
  if(-not [OwnedWindow]::GetClientRect($window,[ref]$client)) { throw 'resized bounds unavailable' }` : ''}
  @{window=$window.ToInt64().ToString();dpi=$dpi;width=$client.Right;height=$client.Bottom;maximized=[OwnedWindow]::IsZoomed($window);minimized=[OwnedWindow]::IsIconic($window)} | ConvertTo-Json -Compress
} finally { [OwnedWindow]::SetThreadDpiAwarenessContext($previousContext) | Out-Null }`;
  const result=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:15000,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim());
  app.windowHandle=result.window;
  return result;
}

// Read UI Automation only beneath the HWND of our exact live child. This
// observes the native provider; it does not start Narrator or change settings.
function ownedAccessibility(app) {
  if (!children.has(app) || app.exitCode !== null) throw new Error('accessibility target is not an owned live child');
  const script = `$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
Add-Type -TypeDefinition @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class A11yOwner {
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
[DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,StringBuilder title,int count);
}
'@
$process=Get-Process -Id ${app.pid}
$window=$process.MainWindowHandle
[uint32]$owner=0
[A11yOwner]::GetWindowThreadProcessId($window,[ref]$owner) | Out-Null
$title=New-Object Text.StringBuilder 256
[A11yOwner]::GetWindowText($window,$title,256) | Out-Null
if($window -eq [IntPtr]::Zero -or $owner -ne ${app.pid} -or $title.ToString() -ne 'Enouia Runtime'){throw 'accessibility window ownership mismatch'}
$root=[System.Windows.Automation.AutomationElement]::FromHandle($window)
if($root.Current.ProcessId -ne ${app.pid}){throw 'UI Automation root ownership mismatch'}
$elements=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
$rows=foreach($element in $elements){
  $value=$element.Current
  [pscustomobject]@{Type=$value.ControlType.ProgrammaticName;Name=$value.Name;Help=$value.HelpText;Id=$value.AutomationId;Focusable=$value.IsKeyboardFocusable;Focused=$value.HasKeyboardFocus;Enabled=$value.IsEnabled;Offscreen=$value.IsOffscreen}
}
ConvertTo-Json -InputObject @($rows) -Depth 3 -Compress`;
  return JSON.parse(powershell(script, { timeout:30000 }));
}

function session(url) {
  const ws = new WebSocket(url);
  sessions.add(ws);
  let id = 0;
  const pending = new Map();
  const observers = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method) observers.get(msg.method)?.(msg.params);
  };
  const CLOSED = { result: { exceptionDetails: { exception: { description: 'DevTools connection closed' } } } };
  let closed = false;
  let opened;
  const ready = new Promise((r) => (opened = r));
  ws.onopen = () => opened();
  // A page that goes away answers every pending and every later request
  // with an error, so an unexpected exit fails the run instead of hanging
  // it. WebSocket.send on a closed socket is silently ignored.
  ws.onclose = () => {
    sessions.delete(ws);
    closed = true;
    opened();
    for (const reply of pending.values()) reply(CLOSED);
    pending.clear();
  };
  const send = async (method, params = {}) => {
    await ready;
    if (closed || ws.readyState !== WebSocket.OPEN) return CLOSED;
    const n = ++id;
    ws.send(JSON.stringify({ id: n, method, params }));
    return new Promise((r) => pending.set(n, r));
  };
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed');
    return r.result?.result?.value;
  };
  return { send, evaluate, observe: (method, callback) => observers.set(method, callback), close: () => ws.close() };
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
      const want = overlay ? 'overlay' : 'main';
      // The URL picks the candidate, so no extra DevTools client attaches to
      // the other window; the native label then confirms it.
      const candidates = targets.filter((t) => t.type === 'page' && t.url.startsWith('http://tauri.localhost/') &&
        t.url.includes('view=overlay') === overlay);
      for (const page of candidates) {
        assertDebugOwner(port);
        const s = session(page.webSocketDebuggerUrl);
        await waitFor(s, "document.readyState === 'complete' && !!document.querySelector('#root > *')", 'page initialized');
        // The native window label, not the URL, identifies the window.
        if ((await s.evaluate('window.__TAURI_INTERNALS__.metadata.currentWindow.label')) === want) {
          await s.evaluate(HELPERS);
          return s;
        }
        s.close();
      }
    } catch (error) {
      if (error.message === 'debug listener does not belong to test process' || error.message === 'test host is not running') throw error;
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error(`no ${overlay ? 'quick-search' : 'main'} page on ${port}`);
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
  await overlay.evaluate(`(async()=>{
    window.__focusTrace = []; ['focus','blur'].forEach(name => window.addEventListener(name, () => window.__focusTrace.push({name, query:document.querySelector('#quick-query').value, at:Date.now()})));
    const handler=window.__TAURI_INTERNALS__.transformCallback(()=>window.__focusTrace.push({name:'overlay-clear',query:document.querySelector('#quick-query').value,at:Date.now()}));
    await window.__TAURI_INTERNALS__.invoke('plugin:event|listen',{event:'overlay-clear',target:{kind:'Any'},handler});
  })()`);
  check('Q.os_hotkey_opens_search', await overlay.evaluate("document.activeElement?.id === 'quick-query'"));
  const search = async (text) => {
    await overlay.evaluate("window.__focusTrace.push({name:'before-set', focused:document.hasFocus(), at:Date.now()})");
    await set(overlay, '#quick-query', text);
    await overlay.evaluate("window.__focusTrace.push({name:'after-set', query:document.querySelector('#quick-query').value, focused:document.hasFocus(), at:Date.now()})");
    await overlay.evaluate("document.querySelector('form').requestSubmit()");
    await overlay.evaluate("window.__focusTrace.push({name:'after-submit', query:document.querySelector('#quick-query').value, focused:document.hasFocus(), at:Date.now()})");
  };
  // Native command completion does not mean the WebView has consumed its
  // clear/focus events. Observe those real prerequisites before test input.
  const reopen = async () => {
    const clears=await overlay.evaluate("window.__focusTrace.filter(e=>e.name==='overlay-clear').length");
    await main.evaluate("window.__TAURI_INTERNALS__.invoke('shell_search')");
    await waitFor(overlay, `window.__focusTrace.filter(e=>e.name==='overlay-clear').length>${clears} && document.hasFocus() && document.activeElement?.id==='quick-query' && document.querySelector('#quick-query').value===''`, 'reopened overlay consumed clear and focused input');
    await waitFor(main, "window.__TAURI_INTERNALS__.invoke('shell_status').then(s=>s.overlayVisible)", 'reopened overlay visible');
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
  for(let cycle=0;cycle<3;cycle++) {
    await reopen();
    check(`Q.reopen_${cycle}_cleared_and_focused`, await overlay.evaluate("document.hasFocus() && document.querySelector('#quick-query').value==='' && !document.querySelector('.quick-results li')"));
    await search('paper sketchbook');
    try { await waitFor(overlay, "[...document.querySelectorAll('.quick-results li')].some(row => row.textContent.includes('paper sketchbook'))", 'search after reopening'); }
    catch(error) {
      check('Q.reopened_search_diagnostic',false,JSON.stringify(await overlay.evaluate("({query:document.querySelector('#quick-query').value,focused:document.hasFocus(),busy:document.querySelector('main').getAttribute('aria-busy'),trace:window.__focusTrace})")));
      throw error;
    }
    check(`Q.reopen_${cycle}_real_result`, await overlay.evaluate("document.querySelector('#quick-query').value==='paper sketchbook' && document.querySelectorAll('.quick-results li').length===1"));
    if(cycle<2) {
      await overlay.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      await waitFor(main,"window.__TAURI_INTERNALS__.invoke('shell_status').then(s=>!s.overlayVisible)",'cycle escape hides');
      await waitFor(overlay,"document.querySelector('#quick-query').value==='' && !document.querySelector('.quick-results li')",'cycle hidden state cleared');
      check(`Q.reopen_${cycle}_hide_clears`,true);
    }
  }
  await main.evaluate("__t.invoke('memory_call', {request:__t.request('vault_lock',{})})");
  await waitFor(main, "window.__TAURI_INTERNALS__.invoke('shell_status').then(s => !s.overlayVisible)", 'lock hides');
  check('Q.lock_clears_text', await overlay.evaluate("document.querySelector('#quick-query').value === '' && !document.querySelector('.quick-results li')"));
  await reopen();
  await search('paper sketchbook');
  try { await waitFor(overlay, has('The Vault is not open, or it is locked'), 'locked search refusal'); }
  catch(error) {
    check('Q.locked_search_diagnostic',false,JSON.stringify(await overlay.evaluate("({query:document.querySelector('#quick-query').value,focused:document.hasFocus(),busy:document.querySelector('main').getAttribute('aria-busy'),trace:window.__focusTrace})")));
    check('Q.locked_window_diagnostic',false,JSON.stringify(await main.evaluate("window.__TAURI_INTERNALS__.invoke('shell_status')")));
    throw error;
  }
  check('Q.locked_error_visible', true,JSON.stringify(await overlay.evaluate('window.__focusTrace')));
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
  void other.evaluate("window.__TAURI_INTERNALS__.invoke('shell_exit')").catch(() => 0);
  const exit = await Promise.race([rival.exited, sleep(20000).then(() => 'timeout')]);
  check('Q.conflict_process_exits', exit === 0);
  other.close();
  await main.evaluate("window.__TAURI_INTERNALS__.invoke('shell_show')");
}

// Fill this process's native dialog through UI Automation. File-name edit
// 1148 and folder-name edit 1152 differ; button 1 confirms either dialog.
function fillOpenDialog(pid, path, folder = false, cancel = false) {
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
$open = $all | Where-Object { $_.Current.ClassName -eq 'Button' -and $_.Current.AutomationId -eq '${cancel ? '2' : '1'}' } | Select-Object -First 1
if ((-not $edit -and ${cancel ? '$false' : '$true'}) -or -not $open) {
  $controls = $all | Where-Object { $_.Current.ClassName -in @('Edit','Button') } | ForEach-Object { $_.Current.ClassName + ':' + $_.Current.AutomationId + ':' + $_.Current.Name }
  throw ('dialog controls not found: ' + ($controls -join ' | '))
}
${cancel ? '' : `[E2E.User32]::SendMessage([System.IntPtr]$edit.Current.NativeWindowHandle, 0x000C, [System.IntPtr]::Zero, '${path.replace(/'/g, "''")}') | Out-Null`}
[E2E.User32]::SendMessage([System.IntPtr]$open.Current.NativeWindowHandle, 0x00F5, [System.IntPtr]::Zero, $null) | Out-Null`;
  try {
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true, timeout: 30000 });
  } catch (error) {
    throw new Error(`native ${folder ? 'folder' : 'file'} picker (${error.code ?? error.status}): ${String(error.stderr).slice(-1600)}`);
  }
}

function powershell(script, opts = {}) {
  return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding:'utf8', windowsHide:true, timeout:30000, stdio:['ignore','pipe','pipe'], ...opts }).trim();
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

// A cancelled session end, as Windows sends it when sign-out or shutdown is
// cancelled: WM_QUERYENDSESSION, then WM_ENDSESSION(FALSE), to every
// top-level window of the process (ADR-027).
function cancelSessionEnd(pid) {
  if (![...children].some(child => child.pid === pid)) throw new Error('session-end target is not an owned child');
  return powershell(`Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SessionEnd {
public delegate bool EnumProc(IntPtr h, IntPtr p);
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc e, IntPtr p);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
[DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint f, uint t, out IntPtr r);
public static int Cancel(uint pid) {
int count = 0;
EnumWindows((h,p)=> { uint id; GetWindowThreadProcessId(h,out id); if(id==pid) {
IntPtr r; SendMessageTimeout(h,0x11,IntPtr.Zero,IntPtr.Zero,2,10000,out r);
SendMessageTimeout(h,0x16,IntPtr.Zero,IntPtr.Zero,2,10000,out r);
count++;
} return true; },IntPtr.Zero);
return count;
}}
'@
[SessionEnd]::Cancel(${pid})`);
}

// Exercise Restart Manager's session-end path on one owned process identity.
function restartManagerClose(pid) {
  if (![...children].some(child => child.pid === pid)) throw new Error('Restart Manager target is not an owned child');
  return powershell(`Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class Rm {
[StructLayout(LayoutKind.Sequential)] public struct FileTime { public uint low; public uint high; }
[StructLayout(LayoutKind.Sequential)] public struct UniqueProcess { public uint pid; public FileTime started; }
[DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)] static extern int RmStartSession(out uint h, int flags, StringBuilder key);
[DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)] static extern int RmRegisterResources(uint h, uint nFiles, string[] files, uint nApps, UniqueProcess[] apps, uint nServices, string[] services);
[DllImport("rstrtmgr.dll")] static extern int RmShutdown(uint h, uint flags, IntPtr callback);
[DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint h);
public static string Close(uint pid) {
long created = System.Diagnostics.Process.GetProcessById((int)pid).StartTime.ToFileTimeUtc();
var app = new UniqueProcess { pid = pid, started = new FileTime { low = (uint)created, high = (uint)(created >> 32) } };
uint h; var key = new StringBuilder(64);
int r = RmStartSession(out h, 0, key); if (r != 0) return "start " + r;
try {
r = RmRegisterResources(h, 0, null, 1, new[] { app }, 0, null); if (r != 0) return "register " + r;
return "shutdown " + RmShutdown(h, 1, IntPtr.Zero);
} finally { RmEndSession(h); }
}}
'@
[Rm]::Close(${pid})`);
}

// Prepare registration before work starts, so PowerShell/C# startup cannot
// consume the real worker lifetime. The helper waits for one explicit signal.
// Flags 0 request cooperative shutdown; there is no forced-kill fallback.
async function prepareRestartManager(app) {
  if (!children.has(app) || app.exitCode !== null) throw new Error('Restart Manager target is not an owned live child');
  const script = `$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class PreparedRm {
[StructLayout(LayoutKind.Sequential)] public struct FileTime { public uint low; public uint high; }
[StructLayout(LayoutKind.Sequential)] public struct UniqueProcess { public uint pid; public FileTime started; }
[DllImport("rstrtmgr.dll",CharSet=CharSet.Unicode)] static extern int RmStartSession(out uint h,int flags,StringBuilder key);
[DllImport("rstrtmgr.dll",CharSet=CharSet.Unicode)] static extern int RmRegisterResources(uint h,uint nFiles,string[] files,uint nApps,UniqueProcess[] apps,uint nServices,string[] services);
[DllImport("rstrtmgr.dll")] static extern int RmShutdown(uint h,uint flags,IntPtr callback);
[DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint h);
static uint handle;
public static void Prepare(uint pid) {
long created=System.Diagnostics.Process.GetProcessById((int)pid).StartTime.ToFileTimeUtc();
var app=new UniqueProcess {pid=pid,started=new FileTime {low=(uint)created,high=(uint)(created>>32)}};
int r=RmStartSession(out handle,0,new StringBuilder(64)); if(r!=0) throw new Exception("start "+r);
r=RmRegisterResources(handle,0,null,1,new[]{app},0,null);
if(r!=0){RmEndSession(handle);throw new Exception("register "+r);}
}
public static int Shutdown(){return RmShutdown(handle,0,IntPtr.Zero);}
public static void End(){RmEndSession(handle);}
}
'@
[PreparedRm]::Prepare(${app.pid})
try {
  [Console]::WriteLine('ready'); [Console]::Out.Flush()
  if([Console]::ReadLine() -ne 'shutdown'){throw 'missing shutdown signal'}
  [Console]::WriteLine('shutdown '+[PreparedRm]::Shutdown())
} finally {[PreparedRm]::End()}`;
  const helper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  children.add(helper);
  let output = '', errors = '', ready;
  const prepared = new Promise(resolve => { ready = resolve; });
  helper.stdout.on('data', chunk => { output += chunk; if (output.includes('ready')) ready(true); });
  helper.stderr.on('data', chunk => { errors += chunk; });
  helper.exited = new Promise(resolve => helper.once('exit', code => { children.delete(helper); ready(false); resolve(code); }));
  helper.once('error', error => { errors += error.message; ready(false); });
  let timer;
  try {
    if (!await Promise.race([prepared, new Promise(resolve => { timer = setTimeout(() => resolve(false), 15000); })])) throw new Error('Restart Manager preparation failed: '+errors);
  } finally { clearTimeout(timer); }
  return {
    shutdown: async () => {
      if (!children.has(app) || app.exitCode !== null) throw new Error('prepared shutdown target has exited');
      helper.stdin.end('shutdown\n');
      const code = await waitForExit(helper, 120000);
      if (code !== 0 || !output.includes('shutdown 0')) throw new Error(`cooperative Restart Manager shutdown failed: ${code} ${output} ${errors}`);
      return output.trim();
    },
  };
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

process.on('SIGINT', () => {
  for (const child of children) child.kill();
  process.exit(130);
});

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

// Hold one real operation observation in Tauri's debug callback map. This
// controls delivery only; cancellation and completion still run in Core.
async function holdOperationObservation(s, memoryPage = false) {
  const matches = memoryPage === true ? 'Array.isArray(value?.result?.items)'
    : memoryPage === 'preview' ? "typeof value?.result?.recognized === 'boolean'"
    : memoryPage === 'restore' ? 'value?.result?.valid === true'
    : memoryPage === 'confirm' ? 'typeof value?.result?.commitId === "string" && Array.isArray(value.result.reviewIds)'
    : memoryPage === 'compile' ? 'value?.result?.state === "saved_preview" && typeof value.result.capsuleId === "string"'
    : memoryPage === 'context' ? 'typeof value?.result?.delivery === "string" && !!value.result.capsule'
    : memoryPage === 'dispatch' ? 'typeof value?.result?.verified === "boolean" && Array.isArray(value.result.messages)'
    : memoryPage === 'session' ? 'Array.isArray(value?.result?.transcript)'
    : memoryPage === 'ask' ? 'Array.isArray(value?.result?.statements) && Array.isArray(value.result.sources) && typeof value.result.capsuleId === "string"'
    : memoryPage === 'new-session' ? 'typeof value?.result?.sessionId === "string" && typeof value.result.branchId === "string"'
    : memoryPage === 'checkpoint' ? 'typeof value?.result?.checkpointId === "string"'
    : memoryPage === 'source' ? 'typeof value?.result?.excerpt === "string" && typeof value.result.byteStart === "number"'
    : memoryPage === 'window-state' ? 'typeof value === "boolean"'
    : memoryPage === 'forget-plan' ? 'typeof value?.result?.planId === "string" && typeof value.result.purge === "boolean"'
    : "value?.result?.operationId && typeof value.result.state === 'string'";
  await s.evaluate(`(() => {
    window.__operationHeld = false;
    const callbacks = window.__TAURI_INTERNALS__.callbacks;
    const originalSet = callbacks.set;
    callbacks.set = function(id, callback) {
      return originalSet.call(this, id, value => {
        if (!window.__operationHeld && ${matches}) {
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

async function pickerChecks(s, app) {
  const second = join(out, 'second-selected.md');
  const secondText = '# Second selected synthetic file\n\nThis input belongs to the confirmed second preview.\n';
  writeFileSync(second, secondText);
  const backup = join(out, 'backup');
  const empty = join(out, 'empty');
  mkdirSync(backup); mkdirSync(empty);
  await nav(s, 'Memory');
  await rail(s, 'Import');
  await click(s, 'button', 'Choose file');
  fillOpenDialog(app.pid, importFile);
  await waitFor(s, has(basename(importFile)), 'first preview visible');
  check('W01.first_file_preview', true);
  await click(s, 'button', 'Choose file');
  fillOpenDialog(app.pid, '', false, true);
  await waitFor(s, "!![...document.querySelectorAll('button')].find(button => button.textContent === 'Start import' && !button.disabled)", 'cancelled choice settled');
  check('W01.cancel_keeps_valid_import_preview', (await s.evaluate('__t.text()')).includes(basename(importFile)));
  await holdOperationObservation(s, 'preview');
  await click(s, 'button', 'Choose file');
  fillOpenDialog(app.pid, second);
  await waitFor(s, 'window.__operationHeld', 'second preview deferred');
  check('W01.new_file_clears_old_preview', !(await s.evaluate('__t.text()')).includes(basename(importFile)));
  await s.evaluate(`window.__releaseOperation({kind:'memory_error',result:null,
    error:{code:'invalid_request',retryable:false,rules:['fixture.import_preview']}})`);
  await waitFor(s, has('fixture.import_preview'), 'second preview failure visible');
  check('W01.failed_preview_cannot_start_import', await s.evaluate("![...document.querySelectorAll('button')].some(button => button.textContent === 'Start import' && !button.disabled)"));
  check('W01.failed_preview_does_not_show_old_file', !(await s.evaluate('__t.text()')).includes(basename(importFile)));
  await click(s, 'button', 'Choose file');
  fillOpenDialog(app.pid, second);
  await waitFor(s, has('second-selected.md'), 'new preview recovered');
  await click(s, 'button', 'Start import');
  await waitFor(s, "!!document.querySelector('.mem-state-succeeded')", 'selected import committed', 60000);
  const imported = await s.evaluate("__t.invoke('memory_call',{request:__t.request('import_list',{})})");
  check('W01.import_matches_selected_preview', imported.ok?.result?.items?.length === 1 && imported.ok.result.items[0].inputSizeBytes === Buffer.byteLength(secondText) && imported.ok.result.items[0].status === 'completed');

  await rail(s, 'Vault & recovery');
  await click(s, 'button', 'Verify Vault');
  await waitFor(s,"[...document.querySelectorAll('.mem-operation')].some(row=>row.textContent.includes('vault_verify') && row.textContent.includes('succeeded'))",'real verification completed',60000);
  const operations=await s.evaluate("__t.invoke('memory_call',{request:__t.request('operation_list',{})})");
  const verified=operations.ok?.result?.items?.find(op=>op.kind==='vault_verify');
  check('W01.actual_verify_is_clean',verified?.result?.clean===true && verified.result.recordsChecked>0 && verified.result.objectsChecked>0);
  check('W02.verify_shows_integrity_result',await s.evaluate(`document.querySelector('.mem-operation').textContent.includes('Verification passed') && document.querySelector('.mem-operation').textContent.includes(${JSON.stringify(`${verified?.result?.recordsChecked} records`)} ) && document.querySelector('.mem-operation').textContent.includes(${JSON.stringify(`${verified?.result?.objectsChecked} objects`)})`));
  await click(s, 'button', 'Back up to an empty folder');
  fillOpenDialog(app.pid, backup, true);
  await waitFor(s, "[...document.querySelectorAll('.mem-operation')].some(row=>row.textContent.includes('backup_export') && row.textContent.includes('succeeded'))", 'real backup exported', 60000);
  const exported = await s.evaluate("__t.invoke('memory_call',{request:__t.request('operation_list',{})})");
  const result = exported.ok?.result?.items?.find(op => op.kind === 'backup_export');
  check('W01.backup_export_succeeds', result?.state === 'succeeded' && result.result.files > 0);
  check('W02.backup_shows_exact_export_result',await s.evaluate(`document.querySelector('.mem-operation').textContent.includes(${JSON.stringify(`Backup saved: commit #${result?.result?.sequence}`)}) && document.querySelector('.mem-operation').textContent.includes(${JSON.stringify(`${result?.result?.files} files`)}) && document.querySelector('.mem-operation').textContent.includes('backup')`));
  await holdOperationObservation(s, 'restore');
  await click(s, 'button', 'Preview a restore');
  fillOpenDialog(app.pid, backup, true);
  await waitFor(s, 'window.__operationHeld', 'actual restore preview held');
  const preview = await s.evaluate('window.__operationObserved');
  check('W01.restore_preview_matches_backup', preview.commitId === result?.result?.commitId && preview.sameVaultAsOpen === true && preview.valid === true);
  await s.evaluate('window.__releaseOperation()');
  await waitFor(s, has('Backup is valid:'), 'valid restore preview shown');
  await click(s, 'button', 'Preview a restore');
  fillOpenDialog(app.pid, empty, true);
  await waitFor(s, "!!document.querySelector('[role=alert]')", 'empty backup rejected by Core');
  check('W01.rejected_restore_clears_previous_preview', !(await s.evaluate('__t.text()')).includes('Backup is valid:'));
  await click(s, 'button', 'Preview a restore');
  fillOpenDialog(app.pid, backup, true);
  await waitFor(s, has('Backup is valid:'), 'valid backup reselected');
  check('W01.restore_preview_recovers', await s.evaluate("!document.querySelector('[role=alert]')"));
  await click(s, 'button', 'Preview a restore');
  fillOpenDialog(app.pid, '', true, true);
  await waitFor(s, "!![...document.querySelectorAll('button')].find(button => button.textContent.includes('Preview a restore') && !button.disabled)", 'cancelled restore choice settled');
  check('W01.cancel_keeps_valid_restore_preview', (await s.evaluate('__t.text()')).includes('Backup is valid:'));
  await shot(s, '13-backup-preview');
}

// Browser media emulation checks only: this never changes the owner's
// Windows theme or sends input outside the owned WebView2 debug session.
async function contrastChecks(s) {
  const media = await s.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
  if (media.error) throw new Error(media.error.message);
  check('W05.forced_colors_media_emulated', await s.evaluate("matchMedia('(forced-colors: active)').matches"));
  await click(s, 'button[aria-label]', 'Memory');
  await waitFor(s, "!!document.querySelector('button[aria-pressed=true]')", 'memory collection');
  await s.evaluate('document.activeElement.blur()');
  const selected = await s.evaluate(`(() => {
    const selectors = ['button[aria-current=page]', 'button[aria-pressed=true]'];
    return selectors.map(selector => {
      const el = document.querySelector(selector); const style = getComputedStyle(el);
      return { label: el.getAttribute('aria-label') || el.textContent, style: style.outlineStyle, width: parseFloat(style.outlineWidth), adjustment: style.forcedColorAdjust };
    });
  })()`);
  check('W05.current_navigation_has_selection_cue', selected[0].style !== 'none' && selected[0].width >= 2, JSON.stringify(selected[0]));
  check('W05.current_collection_has_selection_cue', selected[1].style !== 'none' && selected[1].width >= 2, JSON.stringify(selected[1]));
  check('W05.system_colors_remain_enabled', selected.every(item => item.adjustment === 'auto'));
  await shot(s, '14-forced-colors-selected');
  await s.evaluate("document.querySelector('button[aria-label=Home]').focus()");
  for (const type of ['keyDown', 'keyUp']) {
    const key = await s.send('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    if (key.error) throw new Error(key.error.message);
  }
  const focus = await s.evaluate(`(() => {
    const el = document.activeElement; const style = getComputedStyle(el);
    return { label: el.getAttribute('aria-label'), visible: el.matches(':focus-visible'), style: style.outlineStyle, width: parseFloat(style.outlineWidth), offset: parseFloat(style.outlineOffset) };
  })()`);
  check('W05.keyboard_focus_has_separate_cue', focus.label === 'Memory' && focus.visible && focus.style !== 'none' && focus.width >= 2 && focus.offset >= 2, JSON.stringify(focus));
  await shot(s, '15-forced-colors-keyboard');
  const clear = await s.send('Emulation.setEmulatedMedia', { features: [] });
  if (clear.error) throw new Error(clear.error.message);
  check('W05.media_emulation_cleared', !(await s.evaluate("matchMedia('(forced-colors: active)').matches")));
  await s.evaluate('document.activeElement.blur()');
  const ordinary = await s.evaluate("getComputedStyle(document.querySelector('button[aria-current=page]')).outlineStyle");
  check('W05.ordinary_selection_appearance_preserved', ordinary === 'none');
  await shot(s, '16-ordinary-selection');
}

async function main() {
  if (process.argv[6] === '--accessibility-only') {
    const fixture = resolve(out, '..');
    if (!fixture.startsWith(resolve(tmpdir())+sep) || !basename(fixture).startsWith('enouia-runtime-native-accessibility-') || vault !== join(fixture,'vault') || lstatSync(fixture).isSymbolicLink() || lstatSync(vault).isSymbolicLink()) throw new Error('accessibility probe requires its dedicated temporary synthetic fixture');
    const app = launch(['--memory-vault',vault]);
    const s = await connect();
    await waitFor(s,has('Memory · Vault open'),'accessibility fixture open');
    const initial = await s.evaluate("Promise.all([__t.memory('memory_list',{cursor:null,limit:25,includeInactive:false}),__t.memory('session_list',{})]).then(([m,s])=>({memories:m.result.total,sessions:s.result.items.length}))");
    if (initial.memories !== 0 || initial.sessions !== 0) throw new Error('accessibility fixture must start empty');
    const key = async (name,code,keyCode,modifiers=0) => {
      for(const type of ['keyDown','keyUp']) await s.send('Input.dispatchKeyEvent',{type,key:name,code,windowsVirtualKeyCode:keyCode,modifiers});
    };
    const capture = async (name) => {
      let rows;
      for (let attempt=0;attempt<5;attempt++) {
        rows=ownedAccessibility(app);
        if(rows.some(row=>row.Type==='ControlType.Button' && row.Focusable && row.Enabled)) break;
        await sleep(150);
      }
      writeFileSync(join(out,`uia-${name}.json`),JSON.stringify(rows,null,2));
      return rows;
    };
    for (const page of ['Home','Memory','Context','Sessions','Activity','Runtime','Settings']) {
      await nav(s,page);
      await sleep(250);
      const rows = await capture(page.toLowerCase());
      const controls=rows.filter(row=>row.Enabled && row.Focusable && ['ControlType.Button','ControlType.Edit','ControlType.CheckBox','ControlType.ComboBox','ControlType.Hyperlink','ControlType.RadioButton'].includes(row.Type));
      check(`AX.${page}_native_controls_named`,controls.length>0 && controls.every(row=>row.Name.trim().length>0),JSON.stringify(controls.filter(row=>!row.Name.trim())));
      const name={Home:'Home',Memory:'Memory Vault',Context:'Context Surface',Sessions:'Sessions',Activity:'Activity',Runtime:'Runtime Inspector',Settings:'Settings'}[page]+' content';
      check(`AX.${page}_named_main_landmark`,rows.some(row=>row.Name===name) && await s.evaluate(`document.querySelector('main')?.getAttribute('aria-label')===${JSON.stringify(name)}`));
    }
    await nav(s,'Home');
    await s.evaluate('document.activeElement.blur()');
    await key('Tab','Tab',9);
    const first = await s.evaluate('({tag:document.activeElement.tagName,text:document.activeElement.textContent.trim(),href:document.activeElement.getAttribute("href")})');
    check('AX.first_tab_bypasses_shell',first.tag==='A' && first.href==='#runtime-content',JSON.stringify(first));
    if (first.href==='#runtime-content') {
      check('AX.skip_link_visible_with_keyboard_focus',await s.evaluate("(()=>{const e=document.activeElement;const r=e.getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight && r.left>=0 && r.right<=innerWidth && getComputedStyle(e).outlineStyle!=='none';})()"));
      const linkTree=await capture('skip-link');
      check('AX.native_skip_link_has_focus_and_name',linkTree.some(row=>row.Type==='ControlType.Hyperlink' && row.Name==='Skip to current surface' && row.Focused && !row.Offscreen));
      await shot(s,'accessibility-skip-link');
      await key('Enter','Enter',13);
      check('AX.skip_enters_current_surface',await s.evaluate("document.activeElement.id==='runtime-content' && document.activeElement.getAttribute('aria-label')==='Home content'"));
      await key('Tab','Tab',9);
      check('AX.next_tab_enters_surface_control',await s.evaluate("document.querySelector('main').contains(document.activeElement) && document.activeElement.tagName==='BUTTON'"));
      const rows=await capture('skip-focus');
      check('AX.native_focus_matches_surface_control',rows.some(row=>row.Focused && row.Type==='ControlType.Button' && row.Name.includes('Memory Vault')));
      await shot(s,'accessibility-skip-focus');
    }
    const created = await s.evaluate("(async()=>{const rows=[];for(let i=0;i<2;i++){const r=await __t.memory('session_new',{},'ui-'+crypto.randomUUID());if(r.kind==='memory_error') throw new Error('session fixture: '+r.error.code);rows.push(r.result);}return rows;})()");
    await nav(s,'Sessions');
    await waitFor(s,"document.querySelectorAll('.mem-session-row').length===2",'two actual sessions');
    const sessionTree=await capture('session-rows');
    const branchRows=sessionTree.filter(row=>row.Type==='ControlType.Button' && created.some(item=>row.Help.includes(item.branchId)));
    check('AX.native_session_rows_have_distinct_names',branchRows.length===2 && new Set(branchRows.map(row=>row.Name)).size===2,JSON.stringify(branchRows.map(row=>({name:row.Name,help:row.Help}))));
    check('AX.native_session_rows_identify_saved_branch',branchRows.length===2 && branchRows.every(row=>row.Name.includes('Session ') && row.Name.includes('branch ')));
    await s.evaluate("document.querySelector('.mem-session-row').click()");
    await waitFor(s,"!!document.querySelector('#mem-ask')",'actual session detail');
    const detailTree=await capture('session-inputs');
    check('AX.native_question_and_checkpoint_labels',detailTree.some(row=>row.Type==='ControlType.Edit' && row.Name.startsWith('Ask (local Mock')) && detailTree.some(row=>row.Type==='ControlType.Edit' && row.Name==='Checkpoint summary'));
    await nav(s,'Context');
    const contextTree=await capture('context-input');
    check('AX.native_context_input_label',contextTree.some(row=>row.Type==='ControlType.Edit' && row.Name==='Compile preview'));
    await nav(s,'Memory'); await rail(s,'Candidate inbox');
    const memoryTree=await capture('memory-inputs');
    check('AX.native_memory_inputs_named',memoryTree.filter(row=>row.Type==='ControlType.Edit').length>=3 && memoryTree.filter(row=>row.Type==='ControlType.Edit').every(row=>row.Name.trim()));
    await s.evaluate("__t.memory('remember',{text:'Synthetic accessibility review fixture',claimKey:'fixture.accessibility'},'ui-'+crypto.randomUUID())");
    await nav(s,'Home'); await nav(s,'Memory'); await rail(s,'Candidate inbox');
    await waitFor(s,"!!document.querySelector('article.mem-candidate button')",'actual review candidate');
    await click(s,'article.mem-candidate button','Accept');
    await waitFor(s,"!!document.querySelector('dialog[open]')",'actual review modal');
    const modalTree=await capture('review-modal');
    check('AX.native_confirmation_named',modalTree.some(row=>row.Type==='ControlType.Button' && /^Confirm \([a-f0-9]{8}\)$/.test(row.Name)) && modalTree.some(row=>row.Name.startsWith('Confirm write')));
    check('AX.modal_withholds_background_skip_link',!modalTree.some(row=>row.Type==='ControlType.Hyperlink' && row.Name==='Skip to current surface' && row.Focusable && row.Enabled));
    await key('Escape','Escape',27); await waitFor(s,dialogClosed,'review cancellation');
    const saved = await s.evaluate("__t.memory('memory_list',{cursor:null,limit:25,includeInactive:false}).then(r=>r.result.total)");
    check('AX.keyboard_review_cancellation_does_not_approve',saved===0);
    void s.evaluate("__t.invoke('shell_exit')").catch(()=>0);
    check('AX.owned_host_exits',await waitForExit(app,20000)===0);
    s.close(); return;
  }
  if (process.argv[6] === '--long-lifecycle-only') {
    const fixture = resolve(out, '..');
    const size = 512 * 1024 * 1024;
    const pinnedCli = resolve(dirname(exe), '..', 'pinned-cli', 'release', 'enouia-memory.exe');
    if (!existsSync(pinnedCli)) throw new Error('build the pinned release CLI for independent export verification first');
    if (!fixture.startsWith(resolve(tmpdir()) + sep) || !basename(fixture).startsWith('enouia-runtime-long-lifecycle-') || vault !== join(fixture, 'vault') || importFile !== join(fixture, 'synthetic-archive.bin')) {
      throw new Error('long lifecycle requires its dedicated temporary synthetic fixture');
    }
    for (const path of [fixture, vault, importFile]) if (lstatSync(path).isSymbolicLink()) throw new Error('long fixture cannot be a link');
    if (statSync(importFile).size !== size) throw new Error('long fixture must be exactly 512 MiB');
    const marker = Buffer.from('Synthetic Enouia Runtime long-operation acceptance fixture.');
    const prefix = Buffer.alloc(marker.length);
    const fd = openSync(importFile, 'r');
    try { readSync(fd, prefix, 0, prefix.length, 0); } finally { closeSync(fd); }
    if (!prefix.equals(marker)) throw new Error('unexpected long fixture bytes');
    const objects = readdirSync(join(vault, 'vault', 'raw', 'objects'));
    if (objects.length !== 1 || !/^[a-f0-9]{64}$/.test(objects[0]) || statSync(join(vault, 'vault', 'raw', 'objects', objects[0])).size !== size) throw new Error('unexpected archived fixture objects');
    check('L.dedicated_large_synthetic_archive', true, `${size} bytes`);

    for (const kind of ['vault_verify', 'backup_export']) {
      const app = launch(['--memory-vault', vault], { profile: `long-${kind}` });
      const s = await connect();
      await waitFor(s, has('Memory · Vault open'), `${kind} fixture open`);
      await nav(s, 'Memory'); await rail(s, 'Vault & recovery');
      const head = (await s.evaluate("__t.memory('workspace_status', {})")).result.vault;
      // Observe the provider's actual reads without changing receipt delivery
      // or worker timing. Harness requests are excluded by their request IDs.
      await s.evaluate(`(()=>{
        const ids=new Set(); const request=__t.request.bind(__t);
        __t.request=(...args)=>{const r=request(...args);ids.add(r.requestId);return r;};
        const callbacks=window.__TAURI_INTERNALS__.callbacks;
        const originalSet=callbacks.set;
        window.__providerReads=[];
        callbacks.set=function(id,callback){
          return originalSet.call(this,id,value=>{
            if(value?.result?.vault && !ids.has(value.requestId))
              __providerReads.push({at:performance.now(),state:value.result.vault.state});
            callback(value);
          });
        };
      })()`);
      let n = 0;
      const start = async () => {
        n++;
        const before = (await s.evaluate("__t.memory('operation_list', {})")).result.items.map(op => op.operationId);
        if (kind === 'vault_verify') await click(s, 'button', 'Verify Vault');
        else {
          const destination = join(out, `long-backup-${n}`);
          mkdirSync(destination);
          await click(s, 'button', 'Back up to an empty folder');
          fillOpenDialog(app.pid, destination, true);
        }
        await waitFor(s, `__t.memory('operation_list',{}).then(r=>r.result.items.some(op=>op.kind===${JSON.stringify(kind)} && !${JSON.stringify(before)}.includes(op.operationId)))`, 'new real operation');
        const ops = (await s.evaluate("__t.memory('operation_list', {})")).result.items;
        const op = ops.find(op => op.kind === kind && !before.includes(op.operationId));
        await s.evaluate(`window.__longId=${JSON.stringify(op.operationId)}`);
        await waitFor(s, "__t.memory('operation_get',{operationId:__longId}).then(r=>r.result.state==='running')", 'real worker is running', 10000);
        await waitFor(s, "!!document.querySelector('.mem-state-running')", 'real running feedback');
        check(`L.${kind}_no_cancel_${n}`, await s.evaluate("document.querySelector('.mem-operation').textContent.includes('Finishes before locking or exiting') && !document.querySelector('.mem-operation button')"));
        return op.operationId;
      };
      const completed = async () => {
        await waitFor(s, "__t.memory('operation_get',{operationId:__longId}).then(r=>r.result.state==='succeeded')", 'uncancellable worker completed', 120000);
        return (await s.evaluate("__t.memory('operation_get',{operationId:__longId})")).result;
      };
      const intact = op => kind === 'vault_verify' ? op.result.clean === true && op.result.objectsChecked === 1 : op.result.files > 0 && op.result.commitId === head.headCommitId;

      // Closing is exercised through the actual title-bar control.
      await start();
      await s.evaluate("document.querySelector('button[aria-label=\"Close\"]').click()");
      await waitFor(s, "window.__TAURI_INTERNALS__.invoke('shell_status').then(r=>!r.visible)", 'close hides while work continues');
      const hidden = await s.evaluate("Promise.all([__t.memory('operation_get',{operationId:__longId}),window.__TAURI_INTERNALS__.invoke('shell_status'),__t.memory('workspace_status',{})]).then(([op,shell,status])=>({state:op.result.state,visible:shell.visible,closing:shell.closing,vault:status.result.vault.state}))");
      check(`L.${kind}_close_while_running`, hidden.state === 'running' && !hidden.visible && !hidden.closing && hidden.vault === 'open', JSON.stringify(hidden));
      check(`L.${kind}_hidden_work_completes_intact`, intact(await completed()));
      await s.evaluate("__t.invoke('shell_show')");

      // Lock admission must wait while observations remain available.
      const oldPolls = await s.evaluate('__providerReads.length');
      await waitFor(s, `__providerReads.length>${oldPolls} && __providerReads.length>1 && __providerReads.at(-1).at-__providerReads.at(-2).at>=2900`, 'actual periodic provider refresh before lock');
      await sleep(2000);
      await start();
      const pollCount = await s.evaluate('__providerReads.length');
      await s.evaluate("__t.click('button','Lock Vault')");
      const pending = await s.evaluate("Promise.all([__t.memory('operation_get',{operationId:__longId}),__t.memory('workspace_status',{}),__t.invoke('shell_search'),window.__TAURI_INTERNALS__.invoke('shell_status')]).then(([op,status,search,host])=>({state:op.result.state,observed:!!status.result,search:search.err,vaultChanging:host.vaultChanging}))");
      check(`L.${kind}_lock_keeps_observations`, pending.state === 'running' && pending.observed && pending.search === 'runtime_busy' && pending.vaultChanging, JSON.stringify(pending));
      // Observe through a real provider refresh, not just the first paint
      // before its canonical locked state can replace the operation panel.
      const trace = await s.evaluate(`(async()=>{
        const samples=[]; const began=performance.now();
        while(performance.now()-began<4500){
          const op=(await __t.memory('operation_get',{operationId:__longId})).result;
          if(op.state!=='running') break;
          samples.push({at:Math.round(performance.now()-began),providerReads:__providerReads.length,providerState:__providerReads.at(-1)?.state,progressVisible:!!document.querySelector('.mem-operation'),waitingVisible:!!document.querySelector('.mem-operation') || document.body.innerText.includes('Runtime is finishing Memory operations before releasing the Vault'),unlockVisible:!!__t.byText('button','Unlock')});
          await new Promise(r=>setTimeout(r,150));
        }
        return samples;
      })()`);
      check(`L.${kind}_lock_observed_past_status_refresh`, trace.some(sample => sample.providerReads > pollCount && sample.providerState === 'locked'), JSON.stringify(trace));
      check(`L.${kind}_lock_keeps_waiting_feedback`, trace.length > 0 && trace.every(sample => sample.waitingVisible && !sample.unlockVisible), JSON.stringify(trace));
      check(`L.${kind}_lock_rereads_real_progress_after_refresh`, trace.some(sample => sample.providerReads > pollCount && sample.providerState === 'locked' && sample.progressVisible));
      await shot(s, `long-${kind}-locking`);
      check(`L.${kind}_lock_finishes_worker_intact`, intact(await completed()));
      await waitFor(s, has('Memory · Vault locked'), 'lock completed');
      check(`L.${kind}_lock_releases_admission`, await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_status').then(r=>r.vaultChanging===false)"));
      const unlock = await s.evaluate("__t.memory('vault_unlock',{})");
      check(`L.${kind}_unlock_after_work`, unlock.kind !== 'memory_error');
      await nav(s, 'Settings');
      await waitFor(s, has('Available · Show / Lock Memory Vault / Exit'), 'exit controls ready');

      // Starting via actual IPC while Settings is ready avoids navigating
      // away before the short but real worker lifetime can be observed.
      let args = {};
      if (kind === 'backup_export') {
        const destination = join(out, 'long-backup-exit');
        mkdirSync(destination);
        await s.evaluate("window.__longPicked=null; void window.__TAURI_INTERNALS__.invoke('memory_pick',{kind:'backup_destination'}).then(p=>window.__longPicked=p)");
        fillOpenDialog(app.pid, destination, true);
        await waitFor(s, '!!window.__longPicked?.token', 'exit backup folder picked');
        args = { destinationToken: await s.evaluate('window.__longPicked.token') };
      }
      await s.evaluate(`(async()=>{const r=await __t.memory(${JSON.stringify(kind)},${JSON.stringify(args)});window.__longId=r.result.operationId;})()`);
      const active = await s.evaluate("__t.memory('operation_get',{operationId:__longId}).then(r=>r.result.state)");
      check(`L.${kind}_exit_starts_with_running_worker`, active === 'running', active);
      await click(s, '[aria-label="Windows shell"] button', 'Exit Runtime');
      const exiting = await s.evaluate("Promise.all([__t.memory('workspace_status',{}),__t.memory('operation_get',{operationId:__longId}),__t.invoke('memory_call',{request:__t.request('remember',{text:'Refused during exit',claimKey:'fixture.refused'},'ui-'+crypto.randomUUID())})]).then(([status,op,write])=>({exiting:status.result.companion.exiting,state:op.result.state,refused:write.err,ui:document.body.innerText.includes('Finishing Memory operations before exiting')}))");
      check(`L.${kind}_exit_waits_and_refuses_new_work`, exiting.exiting === true && exiting.state === 'running' && exiting.refused === 'runtime_closing' && exiting.ui, JSON.stringify(exiting));
      const exit = await waitForExit(app, 120000);
      check(`L.${kind}_exit_zero`, exit === 0, `exit ${exit}`);
      s.close();
      const reopened = launch(['--memory-vault', vault], { profile: `long-reopen-${kind}` });
      const r = await connect();
      await waitFor(r, has('Memory · Vault open'), 'Vault released after long exit');
      const after = (await r.evaluate("__t.memory('workspace_status',{})")).result.vault;
      check(`L.${kind}_reopens_same_commit`, after.headCommitId === head.headCommitId && after.headSequence === head.headSequence);
      if (kind === 'backup_export') {
        const exported = JSON.parse(readFileSync(join(out, 'long-backup-exit', 'export-manifest.json'), 'utf8'));
        check('L.backup_exit_wrote_complete_manifest', exported.commit_id === head.headCommitId);
        for (const folder of ['long-backup-1', 'long-backup-2', 'long-backup-exit']) {
          const verified = JSON.parse(execFileSync(pinnedCli, ['verify-export', join(out, folder)], { encoding: 'utf8', windowsHide: true, timeout: 120000 }));
          check(`L.${folder}_independently_valid`, verified.valid === true && verified.commit_id === head.headCommitId && verified.files > 0, JSON.stringify(verified));
        }
      }
      // Also exercise the OS session-end route while a real worker is live.
      // Prepare the exact process registration before starting the worker.
      const manager = await prepareRestartManager(reopened);
      let endArgs = {};
      if (kind === 'backup_export') {
        const destination = join(out, 'long-backup-session-end');
        mkdirSync(destination);
        await r.evaluate("window.__endPicked=null; void window.__TAURI_INTERNALS__.invoke('memory_pick',{kind:'backup_destination'}).then(p=>window.__endPicked=p)");
        fillOpenDialog(reopened.pid, destination, true);
        await waitFor(r, '!!window.__endPicked?.token', 'OS exit backup picked');
        endArgs = { destinationToken: await r.evaluate('window.__endPicked.token') };
      }
      await r.evaluate(`(async()=>{const op=await __t.memory(${JSON.stringify(kind)},${JSON.stringify(endArgs)});window.__endId=op.result.operationId;})()`);
      check(`L.${kind}_os_exit_starts_with_running_worker`, await r.evaluate("__t.memory('operation_get',{operationId:__endId}).then(op=>op.result.state==='running')"));
      const shutdown = await manager.shutdown();
      check(`L.${kind}_cooperative_os_exit_zero`, await waitForExit(reopened, 120000) === 0, shutdown);
      r.close();
      const afterEnd = launch(['--memory-vault', vault], { profile: `long-after-os-${kind}` });
      const end = await connect();
      await waitFor(end, has('Memory · Vault open'), 'OS session-end releases Vault');
      const endHead = (await end.evaluate("__t.memory('workspace_status',{})")).result.vault;
      check(`L.${kind}_os_exit_preserves_commit`, endHead.headCommitId === head.headCommitId && endHead.headSequence === head.headSequence);
      if (kind === 'backup_export') {
        const verified = JSON.parse(execFileSync(pinnedCli, ['verify-export', join(out, 'long-backup-session-end')], { encoding:'utf8',windowsHide:true,timeout:120000 }));
        check('L.os_exit_backup_independently_valid', verified.valid === true && verified.commit_id === head.headCommitId && verified.files > 0, JSON.stringify(verified));
      } else {
        const op = await end.evaluate("__t.memory('vault_verify',{}).then(r=>r.result.operationId)");
        await waitFor(end, `__t.memory('operation_get',{operationId:${JSON.stringify(op)}}).then(r=>r.result.state==='succeeded' && r.result.result.clean===true)`, 'clean bytes after OS exit', 120000);
        check('L.os_exit_verify_reopens_clean', true);
      }
      void end.evaluate("__t.invoke('shell_exit')").catch(() => 0);
      check(`L.${kind}_after_os_host_exits`, await waitForExit(afterEnd, 20000) === 0);
      end.close();
    }
    return;
  }
  if (process.argv[6] === '--damaged-verify-only') {
    const fixture=resolve(out,'..');
    if(!fixture.startsWith(resolve(tmpdir())+sep) || !basename(fixture).startsWith('enouia-runtime-damaged-verify-') || vault!==join(fixture,'vault')) throw new Error('damage probe requires its dedicated temporary synthetic fixture');
    const app=launch(['--memory-vault',vault]); await debugOwnerRefusal(app);
    const s=await connect(); await waitFor(s,has('Memory · Vault open'),'damage fixture open');
    await s.evaluate(`(async()=>{
      window.__verifySend=async(command,args,write=false)=>{
        const request=__t.request(command,args); if(write) request.idempotencyKey='ui-'+crypto.randomUUID();
        const reply=await window.__TAURI_INTERNALS__.invoke('memory_call',{request});
        if(reply.kind==='memory_error') throw new Error(command+': '+reply.error.code); return reply.result;
      };
      const list=await __verifySend('candidate_list',{cursor:null,limit:50});
      if(list.total!==0) throw new Error('damage probe requires empty candidate list');
    })()`);
    const inputPath=join(out,'damage-input.md');
    writeFileSync(inputPath,'Synthetic damaged verification fixture');
    await nav(s,'Memory'); await rail(s,'Import'); await click(s,'button','Choose file');
    fillOpenDialog(app.pid,inputPath); await waitFor(s,has('damage-input.md'),'damage input preview');
    await click(s,'button','Start import'); await waitFor(s,"!!document.querySelector('.mem-state-succeeded')",'real damage fixture import',60000);
    const head=await s.evaluate("__verifySend('workspace_status',{})");
    const objectRoot=join(vault,'vault','raw','objects');
    const names=readdirSync(objectRoot);
    if(names.length!==1 || !/^[a-f0-9]{64}$/.test(names[0])) throw new Error('damage fixture must contain exactly its one source object');
    const objectPath=join(objectRoot,names[0]); const original=readFileSync(objectPath);
    if(original.toString('utf8')!=='Synthetic damaged verification fixture') throw new Error('refuse to modify an object not created by this probe');
    await nav(s,'Memory'); await rail(s,'Vault & recovery');
    const verify=async()=>{
      await holdOperationObservation(s); await click(s,'button','Verify Vault');
      await waitFor(s,'window.__operationHeld','actual verification operation receipt held');
      const receipt=await s.evaluate('window.__operationObserved'); await s.evaluate('window.__releaseOperation()');
      await waitFor(s,`__verifySend('operation_get',{operationId:${JSON.stringify(receipt.operationId)}}).then(op=>op.state==='succeeded')`,'verification worker completed');
      return s.evaluate(`__verifySend('operation_get',{operationId:${JSON.stringify(receipt.operationId)}})`);
    };
    try {
      writeFileSync(objectPath,'Synthetic deliberate object-byte corruption');
      const damaged=await verify();
      check('W01.actual_damaged_verify_completes_with_failed_integrity',damaged.result.clean===false && damaged.result.corruptObjects===1 && damaged.result.missingObjects===0);
      await waitFor(s,has('Verification found integrity problems'),'actual damaged verdict shown');
      check('W02.damaged_result_never_announces_passed',await s.evaluate("document.querySelector('.mem-operation').textContent.includes('corrupt objects: 1') && !document.querySelector('.mem-operation').textContent.includes('Verification passed')"));
      await shot(s,'41-damaged-verification');
    } finally { writeFileSync(objectPath,original); }
    const repaired=await verify();
    check('W01.restored_exact_bytes_verify_clean',readFileSync(objectPath).equals(original) && repaired.result.clean===true && repaired.result.corruptObjects===0);
    await waitFor(s,has('Verification passed'),'repaired object verdict shown');
    check('W02.new_clean_verification_replaces_damaged_result',await s.evaluate("!document.querySelector('.mem-operation').textContent.includes('integrity problems')"));
    const after=await s.evaluate("__verifySend('workspace_status',{})");
    check('W01.verification_never_commits_a_memory_change',typeof head.vault.headCommitId==='string' && after.vault.headSequence===head.vault.headSequence && after.vault.headCommitId===head.vault.headCommitId);
    await shot(s,'42-repaired-verification');
    void s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_exit')").catch(() => 0);
    check('W03.damaged_verify_host_exits',await Promise.race([app.exited,sleep(20000).then(()=>'timeout')])===0);
    s.close(); return;
  }
  if (process.argv[6] === '--stale-plan-only') {
    const app=launch(['--memory-vault',vault]);
    await debugOwnerRefusal(app);
    const s=await connect();
    await waitFor(s,has('Memory · Vault open'),'stale plan fixture open');
    const candidate=await s.evaluate(`(async()=>{
      window.__fixtureSend=async(command,args={},write=false)=>{
        const request=__t.request(command,args); if(write) request.idempotencyKey='ui-'+crypto.randomUUID();
        const reply=await window.__TAURI_INTERNALS__.invoke('memory_call',{request});
        if(reply.kind==='memory_error') throw new Error(command+': '+reply.error.code); return reply.result;
      };
      return __fixtureSend('remember',{text:'Synthetic stale plan original',claimKey:'fixture.stale_plan'},true);
    })()`);
    await nav(s,'Memory'); await rail(s,'Candidate inbox');
    await waitFor(s,"document.querySelectorAll('article.mem-candidate').length===1",'stale candidate ready');
    await set(s,'#mem-remember','Synthetic retained draft after stale plan');
    await set(s,'#mem-claim','fixture.retained_stale_draft');
    await s.evaluate("__t.byText('article.mem-candidate button','Accept').focus()");
    await holdOperationObservation(s,'forget-plan');
    await click(s,'article.mem-candidate button','Accept'); await waitFor(s,'window.__operationHeld','old actual plan held');
    const oldPlan=await s.evaluate('window.__operationObserved');
    await s.evaluate('window.__releaseOperation()'); await waitFor(s,"!!document.querySelector('dialog[open]')",'old plan shown');
    const committed=await s.evaluate(`(async()=>{
      const alternate=await __fixtureSend('review_plan',{decisions:[{candidateId:${JSON.stringify(candidate.candidateId)},revision:${candidate.revision},action:'accept',editedContent:null,mergeTarget:null}]});
      return __fixtureSend('review_confirm',{planId:alternate.planId,diffHash:alternate.diffHash},true);
    })()`);
    check('W01.fixture_canonically_changed_before_old_confirm',/^cmt_/.test(committed.commitId));
    await click(s,'dialog button','Confirm');
    await waitFor(s,"!!document.querySelector('dialog[open] [role=alert]') && !document.querySelector('dialog [role=status]')",'actual old plan refusal');
    check('W01.old_plan_error_is_visible',await s.evaluate("document.querySelector('dialog [role=alert]').textContent.includes('fault.revision_mismatch')"));
    check('W01.nonretryable_plan_has_no_retry',await s.evaluate("!document.querySelector('dialog [role=alert] button')"));
    check('W01.unusable_confirm_is_disabled',await s.evaluate("__t.byText('dialog button','Confirm').disabled"));
    check('W02.unusable_plan_explains_return_to_saved_state',await s.evaluate("document.querySelector('dialog').textContent.includes('check the saved state')"));
    const before=await s.evaluate("__fixtureSend('memory_list',{includeInactive:false,cursor:null,limit:25})");
    check('W01.old_confirm_does_not_duplicate_memory',before.total===1&&before.items[0].snippet==='Synthetic stale plan original');
    await shot(s,'39-stale-plan-refusal');
    await click(s,'dialog button','Cancel'); await waitFor(s,dialogClosed,'unusable plan dismissed');
    await sleep(200);
    await waitFor(s,"document.querySelector('.qr45').getAttribute('aria-busy')==='false'",'cancel refresh settled');
    check('W01.cancel_refreshes_resolved_candidate',await s.evaluate("!document.querySelector('article.mem-candidate') && document.body.innerText.includes('Nothing waiting for review.')"));
    check('W05.removed_trigger_returns_focus_to_list_heading',await s.evaluate("document.activeElement.id==='mem-center-title'"));
    check('W02.cancel_keeps_unsent_new_candidate_draft',await s.evaluate("document.querySelector('#mem-remember').value==='Synthetic retained draft after stale plan'&&document.querySelector('#mem-claim').value==='fixture.retained_stale_draft'"));
    await click(s,'form button','Save as candidate');
    await waitFor(s,"document.querySelectorAll('article.mem-candidate').length===1 && !document.querySelector('#mem-remember').value",'new draft submitted');
    await holdOperationObservation(s,'forget-plan');
    await click(s,'article.mem-candidate button','Accept'); await waitFor(s,'window.__operationHeld','new actual plan held');
    const nextPlan=await s.evaluate('window.__operationObserved');
    check('W01.recovery_prepares_a_fresh_plan',nextPlan.planId!==oldPlan.planId&&nextPlan.diffHash!==oldPlan.diffHash&&JSON.stringify(nextPlan.records).includes('Synthetic retained draft after stale plan'));
    await s.evaluate('window.__releaseOperation()'); await waitFor(s,"!!document.querySelector('dialog[open]')",'new plan shown');
    check('W01.new_plan_has_enabled_confirmation',await s.evaluate("!__t.byText('dialog button','Confirm').disabled && !document.querySelector('dialog [role=alert]')"));
    await click(s,'dialog button','Confirm'); await waitFor(s,dialogClosed,'new plan confirmed');
    await waitFor(s,has('Nothing waiting for review.'),'fresh candidate resolved');
    const final=await s.evaluate("__fixtureSend('memory_list',{includeInactive:false,cursor:null,limit:25})");
    check('W01.recovery_preserves_exact_two_real_memories',final.total===2&&new Set(final.items.map(row=>row.snippet)).size===2&&final.items.some(row=>row.snippet==='Synthetic stale plan original')&&final.items.some(row=>row.snippet==='Synthetic retained draft after stale plan'));
    await shot(s,'40-stale-plan-recovered');
    void s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_exit')").catch(() => 0);
    check('W03.stale_plan_host_exits',await Promise.race([app.exited,sleep(20000).then(()=>'timeout')])===0);
    s.close(); return;
  }
  if (process.argv[6] === '--forget-only') {
    const app=launch(['--memory-vault',vault]);
    await debugOwnerRefusal(app);
    const s=await connect();
    await waitFor(s,has('Memory · Vault open'),'forget fixture open');
    await s.evaluate(`window.__fixtureSend=async(command,args={},write=false)=>{
      const request=__t.request(command,args); if(write) request.idempotencyKey='ui-'+crypto.randomUUID();
      const reply=await window.__TAURI_INTERNALS__.invoke('memory_call',{request});
      if(reply.kind==='memory_error') throw new Error(command+': '+reply.error.code); return reply.result;
    };
    (async()=>{
      for(const index of [0,1]) {
        const candidate=await __fixtureSend('remember',{text:'Synthetic forget fixture '+index,claimKey:'fixture.forget_'+index},true);
        const plan=await __fixtureSend('review_plan',{decisions:[{candidateId:candidate.candidateId,revision:candidate.revision,action:'accept',editedContent:null,mergeTarget:null}]});
        await __fixtureSend('review_confirm',{planId:plan.planId,diffHash:plan.diffHash},true);
      }
    })()`);
    await nav(s,'Memory'); await rail(s,'Current memories');
    await waitFor(s,"document.querySelectorAll('button.qr43').length===2",'forget fixture rows');
    await click(s,'button.qr43','Synthetic forget fixture 0');
    await waitFor(s,"!!document.querySelector('#mem-fix')",'forget fixture detail');
    const memories=await s.evaluate("__fixtureSend('memory_list',{includeInactive:false,cursor:null,limit:25})");
    const selected=memories.items.find(row=>row.snippet==='Synthetic forget fixture 0').memoryId;
    const detail=await s.evaluate(`__fixtureSend('memory_read',{memoryId:${JSON.stringify(selected)}})`);
    const source={sourceId:detail.evidence[0].sourceId,sourceRevision:detail.evidence[0].sourceRevision,startByte:null,maxBytes:4096};
    await click(s,'button','Delete impact');
    await waitFor(s,has('A purge removes'),'delete impact observed');
    check('W01.delete_impact_is_preview_only',(await s.evaluate("__fixtureSend('memory_list',{includeInactive:false,cursor:null,limit:25})")).total===2);
    await s.evaluate("__t.byText('button','Purge…').focus()");
    await holdOperationObservation(s,'forget-plan');
    await click(s,'button','Purge…'); await waitFor(s,'window.__operationHeld','actual purge plan held');
    const purgePlan=await s.evaluate('window.__operationObserved');
    check('W02.deletion_plan_wait_explained',await s.evaluate("!document.querySelector('dialog[open]') && !![...document.querySelectorAll('[role=status]')].find(node=>node.textContent.includes('Waiting for Memory to return the requested result'))"));
    check('W01.purge_plan_has_explicit_flag_and_bound_target',purgePlan.purge===true&&JSON.stringify(purgePlan.records).includes(selected));
    await s.evaluate('window.__releaseOperation()');
    await waitFor(s,"!!document.querySelector('dialog[open]')",'purge dialog shown');
    check('W01.purge_dialog_announces_permanence',await s.evaluate(`document.querySelector('dialog h2').textContent.includes('permanent purge') && document.querySelector('dialog pre').textContent.includes(${JSON.stringify(selected)})`));
    await click(s,'dialog button','Cancel'); await waitFor(s,dialogClosed,'purge confirmation cancelled');
    const candidates=await s.evaluate("__fixtureSend('candidate_list',{cursor:null,limit:50})");
    check('W01.cancel_preserves_memory_and_source',(await s.evaluate("__fixtureSend('memory_list',{includeInactive:false,cursor:null,limit:25})")).total===2&&(await s.evaluate(`__fixtureSend('source_excerpt',${JSON.stringify(source)})`)).excerpt==='Synthetic forget fixture 0');
    check('W01.cancelled_plan_leaves_core_proposal',candidates.total===1);
    check('W01.cancel_explains_retained_deletion_candidate',await s.evaluate("!![...document.querySelectorAll('[role=status]')].find(node=>node.textContent.includes('deletion candidate remains'))"));
    check('W05.cancel_returns_to_purge_trigger',await s.evaluate("document.activeElement===__t.byText('button','Purge…')"));
    await waitFor(s,"__t.byText('button.qr26','Candidate inbox')?.querySelector('.qr25')?.textContent==='1'",'retained candidate badge refreshed');
    check('W01.cancel_refreshes_visible_candidate_count',true);
    await shot(s,'37-forget-cancel-feedback');
    await holdOperationObservation(s,'forget-plan');
    await click(s,'button','Forget…'); await waitFor(s,'window.__operationHeld','actual logical forget plan held');
    const forgetPlan=await s.evaluate('window.__operationObserved');
    check('W01.logical_forget_plan_is_not_permanent_purge',forgetPlan.purge===false&&JSON.stringify(forgetPlan.records).includes(selected));
    await s.evaluate('window.__releaseOperation()'); await waitFor(s,"!!document.querySelector('dialog[open]')",'logical forget dialog shown');
    await click(s,'dialog button','Confirm'); await waitFor(s,dialogClosed,'synthetic logical forget confirmed');
    await waitFor(s,"document.querySelectorAll('button.qr43').length===1",'forgotten memory removed from current list');
    check('W01.confirmed_forget_clears_selected_inspector',await s.evaluate("!document.querySelector('#mem-fix') && document.querySelector('aside[aria-label=\"Memory Inspector\"]').textContent.includes('Select a memory')"));
    check('W01.logical_forget_retains_source',(await s.evaluate(`__fixtureSend('source_excerpt',${JSON.stringify(source)})`)).excerpt==='Synthetic forget fixture 0');
    const missing=await s.evaluate(`__t.invoke('memory_call',{request:__t.request('memory_read',{memoryId:${JSON.stringify(selected)}})})`);
    check('W01.forgotten_memory_is_refused_by_core',missing.ok?.error?.code==='not_found');
    await click(s,'button.qr43','Synthetic forget fixture 1'); await waitFor(s,"!!document.querySelector('#mem-fix')",'remaining memory detail');
    check('W01.other_memory_stays_available',await s.evaluate("document.querySelector('aside[aria-label=\"Memory Inspector\"] p.mem-content').textContent==='Synthetic forget fixture 1'"));
    await shot(s,'38-forget-remaining-memory');
    await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_exit')");
    check('W03.forget_host_exits',await Promise.race([app.exited,sleep(20000).then(()=>'timeout')])===0);
    s.close(); return;
  }
  if (process.argv[6] === '--native-window-only') {
    const app=launch(['--memory-vault',vault]);
    await debugOwnerRefusal(app);
    const s=await connect();
    await waitFor(s,has('Memory · Vault open'),'window fixture open');
    const initial=ownedWindowMetrics(app);
    check('N.window_dpi_is_recorded',initial.dpi>0,JSON.stringify(initial));
    await nav(s,'Sessions'); await click(s,'button','New session');
    await waitFor(s,"!!document.querySelector('#mem-ask')&&!document.querySelector('#mem-ask').disabled",'window session ready');
    await set(s,'#mem-ask','Synthetic unsent resize draft');
    for(const [width,height] of [[1100,700],[1440,900]]) {
      const physical=ownedWindowMetrics(app,{width,height});
      await waitFor(s,`innerWidth===${width}&&innerHeight===${height}`,'physical window resize delivered');
      check('N.physical_'+width+'_matches_css',physical.width===Math.round(width*physical.dpi/96)&&physical.height===Math.round(height*physical.dpi/96),JSON.stringify(physical));
      check('N.physical_'+width+'_root_fits',await s.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1&&document.documentElement.scrollHeight<=document.documentElement.clientHeight+1'));
      check('N.physical_'+width+'_keeps_draft',await s.evaluate("document.querySelector('#mem-ask').value==='Synthetic unsent resize draft'"));
      await shot(s,'35-native-size-'+width);
    }
    await click(s,'button[aria-label=Maximize]',''); await sleep(300);
    check('N.maximize_button_changes_native_state',ownedWindowMetrics(app).maximized);
    check('N.maximized_button_offers_restore',await s.evaluate("!!document.querySelector('button[aria-label=Restore]')"));
    await shot(s,'36-native-maximized');
    await s.evaluate("document.querySelectorAll('.window-control')[1].click()"); await sleep(300);
    check('N.restore_returns_native_state',!ownedWindowMetrics(app).maximized);
    check('N.restored_button_offers_maximize',await s.evaluate("!!document.querySelector('button[aria-label=Maximize]')"));
    await holdOperationObservation(s,'window-state');
    await s.evaluate("window.dispatchEvent(new Event('resize'))");
    await waitFor(s,'window.__operationHeld','older actual window-state read held');
    ownedWindowMetrics(app,null,'maximize'); await sleep(300);
    check('N.external_maximize_updates_control',await s.evaluate("!!document.querySelector('button[aria-label=Restore]')"));
    await s.evaluate('window.__releaseOperation()'); await sleep(200);
    check('N.older_window_read_cannot_replace_maximized_state',await s.evaluate("!!document.querySelector('button[aria-label=Restore]')"));
    ownedWindowMetrics(app,null,'restore'); await sleep(300);
    check('N.external_restore_updates_control',await s.evaluate("!!document.querySelector('button[aria-label=Maximize]')"));
    await click(s,'button[aria-label=Minimize]',''); await sleep(300);
    check('N.minimize_button_changes_native_state',ownedWindowMetrics(app).minimized);
    await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_show')"); await sleep(300);
    check('N.show_restores_minimized_window',!ownedWindowMetrics(app).minimized);
    check('N.window_changes_keep_session_draft',await s.evaluate("document.querySelector('#mem-ask').value==='Synthetic unsent resize draft' && !document.querySelector('.mem-event-assistant_completed')"));
    await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_search')");
    const overlay=await connect(true);
    const scope=await overlay.evaluate("__t.invoke('plugin:window|is_maximized',{label:'main'})");
    check('W04.overlay_cannot_query_main_window_state',Boolean(scope.err));
    await overlay.evaluate("__t.click('button','Open main window')"); overlay.close();
    await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_exit')");
    check('N.window_host_exits',await Promise.race([app.exited,sleep(20000).then(()=>'timeout')])===0);
    s.close(); return;
  }
  if (process.argv[6] === '--source-paging-only') {
    const app=launch(['--memory-vault',vault]);
    await debugOwnerRefusal(app);
    const s=await connect();
    await waitFor(s,has('Memory · Vault open'),'source paging fixture open');
    const sourceA='Synthetic source A <img src=x onerror="window.__sourceXss=1"> '+ '前後🌿'.repeat(1100);
    const sourceB='Synthetic source B, a separate literal record.';
    await s.evaluate(`(async()=>{
      const send=async(command,args,write=false)=>{
        const request=__t.request(command,args); if(write) request.idempotencyKey='ui-'+crypto.randomUUID();
        const reply=await window.__TAURI_INTERNALS__.invoke('memory_call',{request});
        if(reply.kind==='memory_error') throw new Error(command+': '+reply.error.code); return reply.result;
      };
      for(const [index,text] of ${JSON.stringify([sourceA,sourceB])}.entries()) {
        const candidate=await send('remember',{text,claimKey:'fixture.source_'+index},true);
        const plan=await send('review_plan',{decisions:[{candidateId:candidate.candidateId,revision:candidate.revision,action:'accept',editedContent:null,mergeTarget:null}]});
        await send('review_confirm',{planId:plan.planId,diffHash:plan.diffHash},true);
      }
    })()`);
    await nav(s,'Memory'); await rail(s,'Current memories');
    await waitFor(s,"document.querySelectorAll('button.qr43').length===2",'source memory rows');
    await click(s,'button.qr43','Synthetic source A');
    await waitFor(s,"!!document.querySelector('#mem-fix')",'source A detail');
    const held=async(text)=>{
      await holdOperationObservation(s,'source');
      await click(s,'button.mem-link',text);
      await waitFor(s,'window.__operationHeld','source excerpt held');
      return s.evaluate('window.__operationObserved');
    };
    const rendered=page=>`document.querySelector('pre.mem-source')?.textContent===${JSON.stringify(page.excerpt)} && document.querySelector('.mem-figure figcaption')?.textContent.includes(${JSON.stringify('bytes '+page.byteStart+'–'+page.byteEnd+' of '+page.totalBytes)})`;
    const first=await held('Show source');
    check('W02.source_wait_is_visible',await s.evaluate("!document.querySelector('.mem-figure') && !![...document.querySelectorAll('[role=status]')].find(node=>node.textContent.includes('Reading the source'))"));
    check('W01.first_excerpt_is_bounded',first.byteStart===0&&first.byteEnd<=4096&&first.byteEnd<first.totalBytes);
    await s.evaluate('window.__releaseOperation()');
    await waitFor(s,rendered(first),'first exact source excerpt');
    check('W01.source_markup_stays_literal',await s.evaluate("!window.__sourceXss && !document.querySelector('.mem-figure img') && document.querySelector('pre.mem-source').textContent.includes('<img')"));
    const second=await held('Next part');
    check('W02.next_part_clears_previous_excerpt',await s.evaluate("!document.querySelector('.mem-figure') && !!document.querySelector('.mem-evidence[aria-busy=true]')"));
    check('W01.next_part_uses_exact_byte_boundary',second.byteStart===first.byteEnd&&second.byteEnd-second.byteStart<=4096);
    await s.evaluate("window.__releaseOperation({kind:'memory_error',result:null,error:{code:'busy',retryable:true,rules:['fixture.source_read']}})");
    await waitFor(s,"!!document.querySelector('[role=alert] button')",'source read error');
    check('W02.failed_source_does_not_claim_excerpt',await s.evaluate("!document.querySelector('.mem-figure') && !document.querySelector('.mem-evidence[aria-busy=true]')"));
    await holdOperationObservation(s,'source');
    await click(s,'[role=alert] button','Retry');
    await waitFor(s,'window.__operationHeld','retried source excerpt held');
    const retried=await s.evaluate('window.__operationObserved');
    check('W02.source_retry_keeps_page_and_revision',JSON.stringify(retried)===JSON.stringify(second));
    await s.evaluate('window.__releaseOperation()');
    await waitFor(s,rendered(second),'source retry exact excerpt');
    const pages=[first,second];
    for(let attempt=0;pages.at(-1).byteEnd<first.totalBytes&&attempt<10;attempt++) {
      const page=await held('Next part'); pages.push(page);
      await s.evaluate('window.__releaseOperation()');
      await waitFor(s,rendered(page),'next exact source excerpt');
    }
    check('W01.all_source_bytes_are_contiguous',pages.every((page,index)=>page.byteStart===(index?pages[index-1].byteEnd:0)&&page.sourceId===first.sourceId&&page.sourceRevision===first.sourceRevision)&&pages.at(-1).byteEnd===first.totalBytes);
    check('W01.multibyte_source_reassembles_exactly',pages.map(page=>page.excerpt).join('')===sourceA);
    check('W01.last_part_has_no_next_button',await s.evaluate("![...document.querySelectorAll('.mem-figure button')].some(node=>node.textContent==='Next part')"));
    await s.evaluate("document.querySelector('pre.mem-source').scrollIntoView({block:'center'})");
    await shot(s,'33-source-last-part');
    await click(s,'button.mem-link','Show source'); await waitFor(s,rendered(first),'source start reset');
    await held('Next part');
    await s.evaluate('window.__olderSourceRelease=window.__releaseOperation');
    await click(s,'button.mem-link','Show source'); await waitFor(s,rendered(first),'newer source restart');
    await s.evaluate("window.__olderSourceRelease({kind:'memory_error',result:null,error:{code:'busy',retryable:true,rules:['fixture.old_source']}})");
    await sleep(200);
    check('W02.older_page_error_cannot_replace_newer_read',await s.evaluate(`(${rendered(first)}) && !document.querySelector('[role=alert]') && !document.querySelector('.mem-evidence[aria-busy=true]')`));
    await held('Next part');
    await s.evaluate('window.__olderSourceRelease=window.__releaseOperation');
    await click(s,'button.qr43','Synthetic source B');
    await waitFor(s,"!!document.querySelector('#mem-fix') && document.querySelector('aside[aria-label=\"Memory Inspector\"] p.mem-content')?.textContent.startsWith('Synthetic source B')",'source B detail');
    check('W02.selection_does_not_carry_old_excerpt',await s.evaluate("!document.querySelector('.mem-figure')"));
    await click(s,'button.mem-link','Show source');
    await waitFor(s,`document.querySelector('pre.mem-source')?.textContent===${JSON.stringify(sourceB)}`,'source B exact excerpt');
    await s.evaluate('window.__olderSourceRelease()'); await sleep(200);
    check('W02.older_selection_reply_cannot_replace_source',await s.evaluate(`document.querySelector('pre.mem-source')?.textContent===${JSON.stringify(sourceB)} && !document.querySelector('[role=alert]')`));
    await shot(s,'34-source-new-selection');
    const list=await s.evaluate("window.__TAURI_INTERNALS__.invoke('memory_call',{request:__t.request('memory_list',{includeInactive:false,cursor:null,limit:25})})");
    check('W01.source_reads_leave_two_approved_memories',list.result?.total===2);
    await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_exit')");
    check('W03.source_host_exits',await Promise.race([app.exited,sleep(20000).then(()=>'timeout')])===0);
    s.close(); return;
  }
  if (process.argv[6] === '--layout-only') {
    const app=launch(['--memory-vault',vault]);
    await debugOwnerRefusal(app);
    const s=await connect();
    await waitFor(s,has('Memory · Vault open'),'layout fixture open');
    const fact='Synthetic layout statement '+ 'x'.repeat(600);
    await s.evaluate(`(async()=>{
      const send=async(command,args,write=false)=>{
        const request=__t.request(command,args); if(write) request.idempotencyKey='ui-'+crypto.randomUUID();
        const reply=await window.__TAURI_INTERNALS__.invoke('memory_call',{request});
        if(reply.kind==='memory_error') throw new Error(command+': '+reply.error.code); return reply.result;
      };
      const candidate=await send('remember',{text:${JSON.stringify(fact)},claimKey:'fixture.layout'},true);
      const plan=await send('review_plan',{decisions:[{candidateId:candidate.candidateId,revision:candidate.revision,action:'accept',editedContent:null,mergeTarget:null}]});
      await send('review_confirm',{planId:plan.planId,diffHash:plan.diffHash},true);
      const operation=await send('index_rebuild',{});
      for(let attempt=0;attempt<300;attempt++) {
        const status=await send('operation_get',{operationId:operation.operationId});
        if(status.state==='succeeded') return;
        if(['failed','cancelled'].includes(status.state)) throw new Error('layout rebuild: '+status.state);
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      throw new Error('layout rebuild timed out');
    })()`);
    const measure=async(label)=>{
      await sleep(150);
      const metrics=await s.evaluate(`({width:innerWidth,height:innerHeight,clientWidth:document.documentElement.clientWidth,clientHeight:document.documentElement.clientHeight,root:document.documentElement.scrollWidth,rootHeight:document.documentElement.scrollHeight,panes:[...document.querySelectorAll('#root,.qr234,.qr233,.qr232,[data-screen-label],.qr79,.qr44,.mem-context-main,.qr28')].filter(node=>node.clientWidth>0).map(node=>({label:node.getAttribute('data-screen-label')||node.getAttribute('aria-label')||node.className||node.id,width:node.clientWidth,content:node.scrollWidth})).filter(node=>node.content>node.width+1)})`);
      check('L.'+label+'_root_fits',metrics.root<=metrics.clientWidth+1&&metrics.rootHeight<=metrics.clientHeight+1,JSON.stringify({width:metrics.width,height:metrics.height,clientWidth:metrics.clientWidth,clientHeight:metrics.clientHeight,root:metrics.root,rootHeight:metrics.rootHeight}));
      check('L.'+label+'_panes_fit',metrics.panes.length===0,JSON.stringify(metrics.panes));
      if(metrics.rootHeight>metrics.clientHeight+1) console.log('LAYOUT '+label+' '+JSON.stringify(await s.evaluate(`({body:[document.body.clientHeight,document.body.scrollHeight],roots:[...document.querySelectorAll('#root,.qr234,.qr233,.qr232,.qr89,.qr79,.mem-sr')].map(node=>({label:node.className||node.id,height:node.clientHeight,scroll:node.scrollHeight,rect:[node.getBoundingClientRect().top,node.getBoundingClientRect().bottom],css:{height:getComputedStyle(node).height,min:getComputedStyle(node).minHeight,max:getComputedStyle(node).maxHeight,overflow:getComputedStyle(node).overflow,position:getComputedStyle(node).position,rows:getComputedStyle(node).gridTemplateRows}}))})`)));
    };
    for(const width of [1100,1600]) {
      const media=await s.send('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false});
      if(media.error) throw new Error(media.error.message);
      check('L.viewport_'+width,await s.evaluate(`innerWidth===${width} && innerHeight===700`));
      await nav(s,'Home');
      await measure(width+'_home');
      await nav(s,'Memory');
      await rail(s,'Current memories');
      await waitFor(s,"document.querySelectorAll('button.qr43').length===1",'layout memory loaded');
      await click(s,'button.qr43','Synthetic layout statement');
      await waitFor(s,"!!document.querySelector('#mem-fix')",'layout detail loaded');
      await click(s,'button.mem-link','Show source');
      await waitFor(s,"!!document.querySelector('.mem-figure')",'layout source loaded');
      await measure(width+'_memory_source');
      await shot(s,'30-layout-memory-'+width);
      check('L.'+width+'_correction_label_retained',await s.evaluate(`document.querySelector('#mem-fix').labels?.[0]?.textContent==='Corrected content'`));
      check('L.'+width+'_correction_reachable_inside_inspector',await s.evaluate(`(()=>{
        const input=document.querySelector('#mem-fix'),pane=input.closest('.qr79');
        input.scrollIntoView({block:'nearest'});
        const field=input.getBoundingClientRect(),bounds=pane.getBoundingClientRect(),root=document.documentElement;
        return pane.scrollTop>0&&field.top>=bounds.top&&field.bottom<=bounds.bottom&&root.scrollHeight<=root.clientHeight+1&&root.scrollWidth<=root.clientWidth+1;
      })()`));
      await nav(s,'Sessions');
      await click(s,'button','New session');
      const editable="!!document.querySelector('#mem-ask')&&!document.querySelector('#mem-ask').disabled";
      await waitFor(s,editable,'layout session ready');
      await set(s,'#mem-ask','layout');
      await click(s,'form button','Send');
      await waitFor(s,`${editable}&&${has('Answer ·')}`,'layout turn saved');
      await measure(width+'_sessions');
      await click(s,'button','Inspect the context behind this answer');
      await waitFor(s,has('Dispatched'),'layout capsule inspected');
      await click(s,'button','Show the actual request');
      await waitFor(s,has('re-rendered from the saved records'),'layout actual request inspected');
      await measure(width+'_context');
      await shot(s,'31-layout-context-'+width);
      await nav(s,'Settings');
      await waitFor(s,has('Windows shell'),'layout settings ready');
      await measure(width+'_settings');
      await shot(s,'32-layout-settings-'+width);
      await nav(s,'Activity'); await measure(width+'_activity');
      await nav(s,'Runtime'); await measure(width+'_runtime');
    }
    const clear=await s.send('Emulation.clearDeviceMetricsOverride');
    if(clear.error) throw new Error(clear.error.message);
    check('L.viewport_emulation_cleared',await s.evaluate('innerWidth!==1600||innerHeight!==700'));
    await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_exit')");
    check('L.layout_host_exits',await Promise.race([app.exited,sleep(20000).then(()=>'timeout')])===0);
    s.close();
    return;
  }
  if (process.argv[6] === '--transcript-only') {
    let app = launch(['--memory-vault', vault]);
    await debugOwnerRefusal(app);
    let s = await connect();
    await waitFor(s, has('Memory · Vault open'), 'transcript fixture open');
    await nav(s, 'Sessions');
    await click(s, 'button', 'New session');
    const editable = "!!document.querySelector('#mem-ask') && !document.querySelector('#mem-ask').disabled";
    await waitFor(s, editable, 'transcript session ready');
    await set(s, '#mem-ask', 'Synthetic empty-evidence question');
    await click(s, 'form button', 'Send');
    await waitFor(s, `${editable} && ${has('Answer ·')}`, 'empty-evidence turn observed');
    check('W01.empty_evidence_response_is_readable', await s.evaluate("document.querySelector('.mem-event-assistant_completed .mem-response-status')?.textContent.includes('No approved evidence') === true"));
    check('W01.empty_response_does_not_invent_statements', await s.evaluate("document.querySelectorAll('.mem-event-assistant_completed p.mem-content').length === 0"));
    const fact = '<img src=x onerror="window.__transcriptXss=1"> Synthetic Lantern statement';
    await s.evaluate(`(async () => {
      const send = async (command,args,write=false) => {
        const request=__t.request(command,args); if(write) request.idempotencyKey='ui-'+crypto.randomUUID();
        const reply=await window.__TAURI_INTERNALS__.invoke('memory_call',{request});
        if(reply.kind==='memory_error') throw new Error(command+': '+reply.error.code); return reply.result;
      };
      const candidate=await send('remember',{text:${JSON.stringify(fact)},claimKey:'fixture.transcript'},true);
      const plan=await send('review_plan',{decisions:[{candidateId:candidate.candidateId,revision:candidate.revision,action:'accept',editedContent:null,mergeTarget:null}]});
      await send('review_confirm',{planId:plan.planId,diffHash:plan.diffHash},true);
      const operation=await send('index_rebuild',{});
      for(let attempt=0;attempt<300;attempt++) {
        const status=await send('operation_get',{operationId:operation.operationId});
        if(status.state==='succeeded') return;
        if(['failed','cancelled'].includes(status.state)) throw new Error('fixture rebuild: '+status.state);
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      throw new Error('fixture rebuild timed out');
    })()`);
    await set(s, '#mem-ask', 'Lantern');
    await click(s, 'form button', 'Send');
    await waitFor(s, `${editable} && document.querySelectorAll('.mem-event-assistant_completed').length === 2`, 'supported-evidence turn observed');
    const title=await s.evaluate("document.querySelector('.mem-session-row[aria-pressed=true]').title");
    const [sessionId,branchId]=title.split(' · ');
    const saved=await s.evaluate(`__t.invoke('memory_call',{request:__t.request('session_detail',${JSON.stringify({sessionId,branchId})})})`);
    const completed=saved.ok.result.transcript.filter(event=>event.kind==='assistant_completed');
    const response=JSON.parse(completed[1].text);
    check('W01.saved_mock_contains_supported_statement', response.status==='supported_evidence' && response.statements.includes(fact) && response.sources.length===1);
    check('W01.saved_statement_is_plain_text', await s.evaluate(`[...document.querySelectorAll('.mem-event-assistant_completed p.mem-content')].some(node=>node.textContent===${JSON.stringify(fact)})`));
    check('W04.transcript_markup_stays_inert', await s.evaluate("!document.querySelector('.mem-transcript img') && window.__transcriptXss === undefined"));
    check('W01.saved_source_reference_visible', await s.evaluate(`[...document.querySelectorAll('.mem-response-sources code')].some(node=>node.title===${JSON.stringify(response.sources[0].source_id)})`));
    check('W01.raw_responses_collapsed_initially', await s.evaluate("document.querySelectorAll('.mem-recorded-response').length === 2 && [...document.querySelectorAll('.mem-recorded-response')].every(node=>!node.open)"));
    const summaryPresent = await s.evaluate("!!document.querySelectorAll('.mem-recorded-response')[1]?.querySelector('summary')");
    if (summaryPresent) {
      await s.evaluate("window.__transcriptKeyTrace=[]; ['keydown','keypress','keyup'].forEach(type=>document.addEventListener(type,event=>window.__transcriptKeyTrace.push([event.type,event.key,event.target.tagName]))); document.querySelectorAll('.mem-recorded-response')[1].querySelector('summary').focus()");
      // CDP needs Enter's character text to generate its keypress/default
      // activation; keyDown with omitted text only delivers a raw key.
      await s.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
      await s.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      for (const type of ['keyDown','keyUp']) await s.send('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    }
    check('W05.recorded_response_has_keyboard_access', await s.evaluate("document.activeElement === document.querySelectorAll('.mem-recorded-response')[1]?.querySelector('pre')"), JSON.stringify(await s.evaluate('window.__transcriptKeyTrace ?? []')));
    check('W01.raw_saved_response_preserved_exactly', await s.evaluate(`document.querySelectorAll('.mem-recorded-response')[1]?.open === true && document.querySelectorAll('.mem-recorded-response')[1]?.querySelector('pre').textContent === ${JSON.stringify(completed[1].text)}`));
    await shot(s, '28-session-transcript-record');
    await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_exit')");
    check('W03.transcript_host_exits', await Promise.race([app.exited,sleep(20000).then(()=>'timeout')])===0);
    s.close();
    app=launch(['--memory-vault',vault],{profile:'webview2-restart'});
    s=await connect();
    await waitFor(s,has('Memory · Vault open'),'transcript Vault reopened');
    await nav(s,'Sessions');
    await click(s,'.mem-session-row','events');
    await waitFor(s,editable,'persisted transcript reopened');
    check('W01.readable_responses_survive_restart', await s.evaluate("document.querySelectorAll('.mem-response-status').length === 2 && document.querySelectorAll('.mem-recorded-response').length === 2"));
    check('W01.saved_statement_survives_restart', await s.evaluate(`[...document.querySelectorAll('.mem-event-assistant_completed p.mem-content')].some(node=>node.textContent===${JSON.stringify(fact)})`));
    await shot(s,'29-session-transcript-reopened');
    await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_exit')");
    check('W03.transcript_reopened_host_exits', await Promise.race([app.exited,sleep(20000).then(()=>'timeout')])===0);
    s.close();
    return;
  }
  if (process.argv[6] === '--explorer-keyboard-only') {
    const app = launch(['--memory-vault', vault]);
    await debugOwnerRefusal(app);
    const s = await connect();
    await waitFor(s, has('Memory · Vault open'), 'explorer keyboard fixture open');
    await s.evaluate(`(async () => {
      const send = async (command, args, write = false) => {
        const request = __t.request(command, args);
        if (write) request.idempotencyKey = 'ui-' + crypto.randomUUID();
        const reply = await window.__TAURI_INTERNALS__.invoke('memory_call', {request});
        if (reply.kind === 'memory_error') throw new Error(command + ': ' + reply.error.code);
        return reply.result;
      };
      for (let index = 0; index < 3; index++) {
        const candidate = await send('remember', {text:'Synthetic keyboard memory ' + index,claimKey:'fixture.keyboard_' + index}, true);
        const plan = await send('review_plan', {decisions:[{candidateId:candidate.candidateId,revision:candidate.revision,action:'accept',editedContent:null,mergeTarget:null}]});
        await send('review_confirm', {planId:plan.planId,diffHash:plan.diffHash}, true);
      }
    })()`);
    await nav(s, 'Memory');
    await rail(s, 'Current memories');
    await waitFor(s, "document.querySelectorAll('button.qr43').length === 3", 'keyboard memory list');
    const key = async (name, code, windowsVirtualKeyCode) => {
      for (const type of ['keyDown', 'keyUp']) {
        const result = await s.send('Input.dispatchKeyEvent', {type,key:name,code,windowsVirtualKeyCode});
        if (result.error) throw new Error(result.error.message);
      }
    };
    const row = index => `document.querySelectorAll('button.qr43')[${index}]`;
    const selected = index => `${row(index)}.getAttribute('aria-pressed') === 'true'`;
    const focused = index => `document.activeElement === ${row(index)}`;
    const focusAndSelect = index => s.evaluate(`${row(index)}.focus(); ${row(index)}.click()`);
    await focusAndSelect(0);
    await key('ArrowDown','ArrowDown',40);
    check('W05.arrow_selects_next_memory', await s.evaluate(selected(1)));
    check('W05.arrow_moves_focus_to_selection', await s.evaluate(focused(1)));
    await key(' ','Space',32);
    check('W05.space_keeps_arrow_selected_memory', await s.evaluate(selected(1)));
    await focusAndSelect(0);
    await key('Tab','Tab',9);
    check('W05.tab_can_focus_another_memory', await s.evaluate(focused(1)));
    await key('ArrowDown','ArrowDown',40);
    check('W05.arrow_starts_from_focused_memory', await s.evaluate(`${selected(2)} && ${focused(2)}`));
    await key('ArrowDown','ArrowDown',40);
    check('W05.last_memory_is_keyboard_boundary', await s.evaluate(`${selected(2)} && ${focused(2)}`));
    await key('ArrowUp','ArrowUp',38);
    check('W05.reverse_arrow_moves_selection_and_focus', await s.evaluate(`${selected(1)} && ${focused(1)}`));
    await focusAndSelect(0);
    await key('ArrowUp','ArrowUp',38);
    check('W05.first_memory_is_keyboard_boundary', await s.evaluate(`${selected(0)} && ${focused(0)}`));
    await s.evaluate("document.querySelector('[aria-label=\"Search memories\"]').focus()");
    await key('ArrowDown','ArrowDown',40);
    check('W05.search_arrow_does_not_move_memory', await s.evaluate(`${selected(0)} && document.activeElement.getAttribute('aria-label') === 'Search memories'`));
    await s.evaluate("__t.byText('button','Refresh results').focus()");
    await key('ArrowDown','ArrowDown',40);
    check('W05.toolbar_arrow_does_not_move_memory', await s.evaluate(`${selected(0)} && document.activeElement.textContent === 'Refresh results'`));
    await focusAndSelect(0);
    await key('ArrowDown','ArrowDown',40);
    const expected = await s.evaluate(`${row(1)}.querySelector('.qr39').textContent`);
    await waitFor(s, `document.querySelector('aside[aria-label="Memory Inspector"] .mem-content')?.textContent === ${JSON.stringify(expected)}`, 'arrow-selected actual memory detail');
    check('W01.keyboard_inspector_matches_selected_memory', true);
    await shot(s, '27-explorer-keyboard-selection');
    await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_exit')");
    const exit = await Promise.race([app.exited, sleep(20000).then(() => 'timeout')]);
    check('W05.explorer_keyboard_host_exits', exit === 0);
    s.close();
    return;
  }
  if (process.argv[6] === '--session-writes-only') {
    const app = launch(['--memory-vault', vault]);
    await debugOwnerRefusal(app);
    const s = await connect();
    await waitFor(s, has('Memory · Vault open'), 'session write fixture open');
    await nav(s, 'Sessions');
    const waiting = "[...document.querySelectorAll('[role=status]')].some(node => node.textContent.includes('Waiting for Memory to return the session result'))";
    const editable = "!!document.querySelector('#mem-ask') && !document.querySelector('#mem-ask').disabled";
    await holdOperationObservation(s, 'new-session');
    await click(s, 'button', 'New session');
    await waitFor(s, 'window.__operationHeld', 'new session receipt held');
    check('W02.session_creation_wait_explained', await s.evaluate(waiting));
    await s.evaluate('window.__releaseOperation()');
    await waitFor(s, editable, 'created session ready');
    const title = await s.evaluate("document.querySelector('.mem-session-row[aria-pressed=true]').title");
    const [sessionId, branchId] = title.split(' · ');
    const selected = {sessionId, branchId};
    await set(s, '#mem-ask', 'Synthetic first question');
    await click(s, 'form button', 'Send');
    await waitFor(s, `${editable} && ${has('Answer ·')}`, 'first actual answer visible');
    check('W01.first_session_answer_observed', true);
    const submissions = [];
    s.observe('Network.requestWillBeSent', ({request}) => {
      if (request.url !== 'http://ipc.localhost/memory_call' || !request.postData) return;
      const payload = JSON.parse(request.postData).request;
      if (payload?.command === 'session_ask') submissions.push(payload);
    });
    const network = await s.send('Network.enable', {maxPostDataSize:4096});
    if (network.error) throw new Error(network.error.message);
    await set(s, '#mem-ask', 'Synthetic second question');
    await set(s, '#mem-cp', 'Unsent checkpoint draft');
    await holdOperationObservation(s, 'ask');
    await click(s, 'form button', 'Send');
    await waitFor(s, 'window.__operationHeld', 'second actual answer receipt held');
    const second = await s.evaluate('window.__operationObserved');
    check('W02.session_answer_wait_explained', await s.evaluate(waiting));
    check('W02.new_question_clears_previous_answer', !(await s.evaluate('__t.text()')).includes('Answer ·'));
    check('W02.pending_question_stays_visible', await s.evaluate("document.querySelector('#mem-ask').value === 'Synthetic second question' && document.querySelector('#mem-ask').disabled"));
    await shot(s, '25-session-write-pending');
    await s.evaluate("window.__releaseOperation({kind:'memory_error',result:null,error:{code:'busy',retryable:true,rules:['fixture.session_receipt']}})");
    await waitFor(s, "!!document.querySelector('[role=alert] button')", 'controlled session delivery error');
    check('W02.failed_delivery_keeps_submitted_draft', await s.evaluate("document.querySelector('#mem-ask').value === 'Synthetic second question' && !document.querySelector('#mem-ask').disabled"));
    check('W02.failed_delivery_does_not_show_old_answer', !(await s.evaluate('__t.text()')).includes('Answer ·'));
    check('W02.failed_delivery_has_no_pending_status', !(await s.evaluate(waiting)));
    await set(s, '#mem-ask', 'New unsent draft after delivery error');
    await set(s, '#mem-cp', 'Edited checkpoint after delivery error');
    await holdOperationObservation(s, 'ask');
    await click(s, '[role=alert] button', 'Retry');
    await waitFor(s, 'window.__operationHeld', 'same real answer replay held');
    check('W02.session_retry_reuses_receipt', await s.evaluate(`window.__operationObserved.capsuleId === ${JSON.stringify(second.capsuleId)}`));
    check('W02.session_retry_reuses_payload_and_key', submissions.length === 2 && submissions[0].idempotencyKey === submissions[1].idempotencyKey && JSON.stringify(submissions[0].arguments) === JSON.stringify(submissions[1].arguments), `observed requests: ${submissions.length}`);
    check('W02.session_retry_wait_explained', await s.evaluate(waiting));
    await s.evaluate('window.__releaseOperation()');
    await waitFor(s, `${editable} && ${has('Answer ·')}`, 'replayed answer acknowledged');
    check('W02.acknowledgement_preserves_edited_drafts', await s.evaluate("document.querySelector('#mem-ask').value === 'New unsent draft after delivery error' && document.querySelector('#mem-cp').value === 'Edited checkpoint after delivery error'"));
    const detail = await s.evaluate(`__t.invoke('memory_call',{request:__t.request('session_detail',${JSON.stringify(selected)})})`);
    check('W01.retry_does_not_duplicate_turn', detail.ok?.result?.turns?.length === 2 && detail.ok.result.transcript.filter(event => event.text === 'Synthetic second question').length === 1 && !detail.ok.result.transcript.some(event => event.text === 'New unsent draft after delivery error'));
    const capsule = await s.evaluate(`__t.invoke('memory_call',{request:__t.request('context_inspect',{capsuleId:${JSON.stringify(second.capsuleId)}})})`);
    check('W01.replayed_answer_uses_submitted_question', capsule.ok?.result?.capsule?.query === 'Synthetic second question');
    await holdOperationObservation(s, 'checkpoint');
    await click(s, 'form button', 'Save checkpoint');
    await waitFor(s, 'window.__operationHeld', 'actual checkpoint receipt held');
    check('W02.checkpoint_wait_explained', await s.evaluate(waiting));
    check('W02.checkpoint_draft_waits_for_receipt', await s.evaluate("document.querySelector('#mem-cp').value === 'Edited checkpoint after delivery error' && document.querySelector('#mem-cp').disabled"));
    await s.evaluate('window.__releaseOperation()');
    await waitFor(s, `${editable} && document.querySelector('#mem-cp').value === ''`, 'checkpoint acknowledged');
    check('W02.checkpoint_does_not_clear_question_draft', await s.evaluate("document.querySelector('#mem-ask').value === 'New unsent draft after delivery error'"));
    const memories = await s.evaluate("__t.invoke('memory_call',{request:__t.request('memory_list',{cursor:null,limit:25,includeInactive:false})})");
    check('W01.session_writes_do_not_approve_memories', memories.ok?.result?.total === 0);
    await shot(s, '26-session-write-recovered');
    await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_exit')");
    const exit = await Promise.race([app.exited, sleep(20000).then(() => 'timeout')]);
    check('W02.session_write_host_exits', exit === 0);
    s.close();
    return;
  }
  if (process.argv[6] === '--sessions-only') {
    const app = launch(['--memory-vault', vault]);
    await debugOwnerRefusal(app);
    const s = await connect();
    await waitFor(s, has('Memory · Vault open'), 'session timing fixture open');
    await nav(s, 'Sessions');
    const active = "document.querySelector('.mem-session-row[aria-pressed=true]')?.title";
    const editable = "!!document.querySelector('#mem-ask') && !document.querySelector('#mem-ask').disabled";
    const drafts = "({text:document.querySelector('#mem-ask')?.value,summary:document.querySelector('#mem-cp')?.value})";
    await click(s, 'button', 'New session');
    await waitFor(s, editable, 'first session ready');
    const a = await s.evaluate(active);
    const branch = title => { const [sessionId, branchId] = title.split(' · '); return {sessionId, branchId}; };
    const select = title => s.evaluate(`[...document.querySelectorAll('.mem-session-row')].find(row => row.title === ${JSON.stringify(title)}).click()`);
    const detail = title => s.evaluate(`__t.invoke('memory_call',{request:__t.request('session_detail',${JSON.stringify(branch(title))})})`);
    await set(s, '#mem-ask', 'Unsent question in session A');
    await set(s, '#mem-cp', 'Unsent checkpoint in session A');
    await click(s, 'button', 'New session');
    await waitFor(s, `${editable} && ${active} !== ${JSON.stringify(a)}`, 'second session ready');
    const b = await s.evaluate(active);
    check('W02.new_session_has_own_drafts', await s.evaluate("document.querySelector('#mem-ask').value === '' && document.querySelector('#mem-cp').value === ''"));
    await set(s, '#mem-ask', 'Synthetic question in session B');
    await set(s, '#mem-cp', 'Synthetic checkpoint in session B');

    await holdOperationObservation(s, 'session');
    await select(a);
    await waitFor(s, 'window.__operationHeld', 'older session A detail held');
    await s.evaluate('window.__releaseOlderSession = window.__releaseOperation');
    check('W02.pending_selection_keeps_observed_branch', await s.evaluate(`${active} === ${JSON.stringify(b)}`));
    check('W02.pending_detail_preserves_current_drafts', JSON.stringify(await s.evaluate(drafts)) === JSON.stringify({text:'Synthetic question in session B',summary:'Synthetic checkpoint in session B'}));
    check('W02.pending_detail_explained', await s.evaluate("document.querySelector('[aria-label=\"Session transcript\"] [role=status]')?.textContent.includes('Reading the session') === true"));
    await select(b);
    await waitFor(s, editable, 'newer session B detail delivered');
    await s.evaluate('window.__releaseOlderSession()');
    await sleep(300);
    check('W02.older_detail_cannot_replace_selection', await s.evaluate(`${active} === ${JSON.stringify(b)} && ${editable}`));
    check('W02.older_detail_cannot_replace_drafts', JSON.stringify(await s.evaluate(drafts)) === JSON.stringify({text:'Synthetic question in session B',summary:'Synthetic checkpoint in session B'}));

    await holdOperationObservation(s, 'ask');
    await click(s, 'form button', 'Send');
    await waitFor(s, 'window.__operationHeld', 'real session B answer receipt held');
    const answered = await s.evaluate('window.__operationObserved');
    check('W02.pending_answer_blocks_branch_switch', await s.evaluate("[...document.querySelectorAll('.mem-session-row')].every(row => row.disabled)"));
    await select(a); // A disabled native button does not dispatch its click.
    check('W02.pending_answer_keeps_branch', await s.evaluate(`${active} === ${JSON.stringify(b)}`));
    check('W02.pending_answer_preserves_drafts', JSON.stringify(await s.evaluate(drafts)) === JSON.stringify({text:'Synthetic question in session B',summary:'Synthetic checkpoint in session B'}));
    check('W02.pending_answer_blocks_composers', await s.evaluate("document.querySelector('#mem-ask').disabled && document.querySelector('#mem-cp').disabled"));
    await shot(s, '23-session-answer-pending');
    await s.evaluate('window.__releaseOperation()');
    await waitFor(s, `${editable} && document.querySelector('#mem-ask').value === ''`, 'session B acknowledged and refreshed');
    check('W02.answer_clears_only_submitted_field', await s.evaluate("document.querySelector('#mem-cp').value === 'Synthetic checkpoint in session B'"));
    check('W01.actual_local_mock_answer_visible', answered.status && await s.evaluate(has(`Answer · ${answered.status}`)));
    const afterAskA = await detail(a);
    const afterAskB = await detail(b);
    check('W01.answer_is_saved_in_requested_branch', afterAskA.ok?.result?.transcript?.length === 0 && afterAskB.ok?.result?.transcript?.some(event => event.text === 'Synthetic question in session B'));
    await click(s, 'form button', 'Save checkpoint');
    await waitFor(s, `${editable} && document.querySelector('#mem-cp').value === ''`, 'session B checkpoint acknowledged');
    const afterCheckpointB = await detail(b);
    const memories = await s.evaluate("__t.invoke('memory_call',{request:__t.request('memory_list',{cursor:null,limit:25,includeInactive:false})})");
    check('W01.checkpoint_stays_provisional', afterCheckpointB.ok?.result?.checkpoints?.length === 1 && afterCheckpointB.ok.result.checkpoints[0].status === 'provisional' && memories.ok?.result?.total === 0);
    await select(a);
    await waitFor(s, `${editable} && ${active} === ${JSON.stringify(a)}`, 'session A selected again');
    check('W02.return_restores_branch_drafts', JSON.stringify(await s.evaluate(drafts)) === JSON.stringify({text:'Unsent question in session A',summary:'Unsent checkpoint in session A'}));
    check('W02.return_clears_other_branch_answer', !(await s.evaluate('__t.text()')).includes('Answer ·'));
    const afterCheckpointA = await detail(a);
    check('W01.unsent_branch_remains_unwritten', afterCheckpointA.ok?.result?.transcript?.length === 0 && afterCheckpointA.ok.result.checkpoints?.length === 0);
    await shot(s, '24-session-restored-drafts');
    await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_exit')");
    const exit = await Promise.race([app.exited, sleep(20000).then(() => 'timeout')]);
    check('W02.session_timing_host_exits', exit === 0);
    s.close();
    return;
  }
  if (process.argv[6] === '--context-only') {
    const app = launch(['--memory-vault', vault]);
    await debugOwnerRefusal(app);
    const s = await connect();
    await waitFor(s, has('Memory · Vault open'), 'context fixture open');
    await nav(s, 'Context');
    await waitFor(s, "!!document.querySelector('#mem-cq')", 'context surface');
    check('C.no_capsule_initially', (await s.evaluate('__t.text()')).includes('No capsule selected.'));
    await set(s, '#mem-cq', 'Synthetic preview question');
    await holdOperationObservation(s, 'compile');
    await click(s, 'form button', 'Preview');
    await waitFor(s, 'window.__operationHeld', 'real preview receipt held');
    check('W02.preview_wait_explained', await s.evaluate("!![...document.querySelectorAll('[role=status]')].find(node => node.textContent.includes('Preparing preview'))"));
    await set(s, '#mem-cq', 'Edited draft while preview is pending');
    await holdOperationObservation(s, 'context');
    await s.evaluate('window.__releaseOperation()');
    await waitFor(s, 'window.__operationHeld', 'saved capsule read held');
    const inspection = await s.evaluate('window.__operationObserved');
    check('W02.capsule_wait_not_unselected', !(await s.evaluate('__t.text()')).includes('No capsule selected.'));
    await s.evaluate("window.__releaseOperation({kind:'memory_error',result:null,error:{code:'busy',retryable:true,rules:['fixture.context_read']}})");
    await waitFor(s, "!!document.querySelector('[role=alert] button')", 'capsule read error');
    check('W02.failed_capsule_not_unselected', await s.evaluate("document.querySelector('aside[aria-label=Dispatches]').textContent.includes('Capsule unavailable') && !__t.text().includes('No capsule selected.')"));
    await click(s, '[role=alert] button', 'Retry');
    await waitFor(s, has('Preview only'), 'actual preview inspected');
    check('C.preview_never_dispatched', inspection.delivery === 'preview_not_sent' && inspection.dispatches.length === 0 && (await s.evaluate('__t.text()')).includes('This capsule was never sent.'));
    check('C.saved_query_distinct_from_pending_draft', await s.evaluate("document.querySelector('.mem-saved-query')?.textContent === 'Synthetic preview question' && document.querySelector('#mem-cq').value === 'Edited draft while preview is pending'"));

    await s.evaluate(`(async () => {
      const send = async (command, args, write=false) => {
        const request = __t.request(command,args); if (write) request.idempotencyKey='ui-'+crypto.randomUUID();
        const response = await window.__TAURI_INTERNALS__.invoke('memory_call',{request});
        if (response.kind === 'memory_error') throw new Error(response.error.code); return response.result;
      };
      const candidate = await send('remember',{text:'Synthetic owner prefers paper notes for Lantern ideas.',claimKey:'fixture.context_notes'},true);
      const plan = await send('review_plan',{decisions:[{candidateId:candidate.candidateId,revision:candidate.revision,action:'accept',editedContent:null,mergeTarget:null}]});
      await send('review_confirm',{planId:plan.planId,diffHash:plan.diffHash},true);
      const operation = await send('index_rebuild',{});
      for (let attempt = 0; attempt < 300; attempt++) {
        const status = await send('operation_get',{operationId:operation.operationId});
        if (status.state === 'succeeded') return;
        if (['failed','cancelled'].includes(status.state)) throw new Error('fixture index rebuild: '+status.state);
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      throw new Error('fixture index rebuild timed out');
    })()`);
    await nav(s, 'Sessions');
    await click(s, 'button', 'New session');
    await waitFor(s, "!!document.querySelector('#mem-ask') && !document.querySelector('#mem-ask').disabled", 'context session opened');
    await set(s, '#mem-ask', 'Lantern');
    await click(s, 'form button', 'Send');
    await waitFor(s, has('Answer ·'), 'local Mock dispatched');
    await click(s, 'button', 'Inspect the context behind this answer');
    await waitFor(s, has('Dispatched'), 'actual dispatched capsule');
    const capsule = await s.evaluate("document.querySelector('.mem-state-line code').title");
    check('C.dispatched_saved_query_shown', await s.evaluate("document.querySelector('.mem-saved-query')?.textContent === 'Lantern'"));
    check('C.dispatch_does_not_claim_unread_request', !(await s.evaluate('__t.text()')).includes('the actual request is below') && await s.evaluate("!document.querySelector('aside[aria-label=Dispatches] pre')"));
    await holdOperationObservation(s, 'dispatch');
    await click(s, 'button', 'Show the actual request');
    await waitFor(s, 'window.__operationHeld', 'actual request inspection held');
    const actual = await s.evaluate('window.__operationObserved');
    check('C.actual_request_bound_to_capsule', actual.capsuleId === capsule && actual.verified === true && actual.messages.some(message => message.text.includes('Synthetic owner prefers paper notes')), JSON.stringify({ capsuleMatches:actual.capsuleId === capsule,verified:actual.verified,fixtureIncluded:actual.messages.some(message=>message.text.includes('Synthetic owner prefers paper notes')) }));
    await s.evaluate("window.__releaseOperation({kind:'memory_error',result:null,error:{code:'busy',retryable:true,rules:['fixture.dispatch_read']}})");
    await waitFor(s, "!!document.querySelector('[role=alert] button')", 'actual request read error');
    check('C.failed_request_is_not_verified', !(await s.evaluate('__t.text()')).includes('hash-checked') && await s.evaluate("!document.querySelector('aside[aria-label=Dispatches] pre')"));
    await click(s, '[role=alert] button', 'Retry');
    await waitFor(s, has('re-rendered from the saved records'), 'actual request retry verified');
    check('W02.request_read_retry_recovers', await s.evaluate("!document.querySelector('[role=alert]') && !!document.querySelector('aside[aria-label=Dispatches] pre')"));
    const replacementQuery = 'Synthetic replacement preview <img src=x onerror="window.__queryXss=1">';
    await set(s, '#mem-cq', replacementQuery);
    await holdOperationObservation(s, 'compile');
    await click(s, 'form button', 'Preview');
    await waitFor(s, 'window.__operationHeld', 'replacement preview receipt held');
    const replacement = await s.evaluate('window.__operationObserved');
    check('C.new_preview_clears_previous_request', await s.evaluate("!document.querySelector('aside[aria-label=Dispatches] pre') && !__t.text().includes('hash-checked') && !__t.text().includes('Dispatched')"));
    await s.evaluate("window.__releaseOperation({kind:'memory_error',result:null,error:{code:'busy',retryable:true,rules:['fixture.preview_delivery']}})");
    await waitFor(s, "!!document.querySelector('[role=alert] button')", 'preview delivery error');
    check('W02.failed_preview_has_no_phantom_read', await s.evaluate("!__t.text().includes('Reading capsule') && !__t.text().includes('Reading the saved capsule') && document.querySelector('.mem-context').getAttribute('aria-busy') === 'false'"));
    check('W02.failed_preview_preserves_query', await s.evaluate(`document.querySelector('#mem-cq').value === ${JSON.stringify(replacementQuery)}`));
    await holdOperationObservation(s, 'compile');
    await click(s, '[role=alert] button', 'Retry');
    await waitFor(s, 'window.__operationHeld', 'same preview replayed');
    check('W02.preview_retry_reuses_capsule', await s.evaluate(`window.__operationObserved.capsuleId === ${JSON.stringify(replacement.capsuleId)}`));
    await s.evaluate('window.__releaseOperation()');
    await waitFor(s, has('Preview only'), 'replacement preview inspected');
    check('C.replacement_preview_remains_unsent', await s.evaluate("__t.text().includes('This capsule was never sent.') && !document.querySelector('aside[aria-label=Dispatches] pre')"));
    check('C.saved_query_renders_as_text', await s.evaluate(`document.querySelector('.mem-saved-query')?.textContent === ${JSON.stringify(replacementQuery)} && !document.querySelector('.mem-context img') && window.__queryXss === undefined`));
    await shot(s, '20-context-read-recovery');
    await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_exit')");
    const exit = await Promise.race([app.exited,sleep(20000).then(()=> 'timeout')]);
    check('W02.context_host_exits', exit === 0);
    s.close();
    return;
  }
  if (process.argv[6] === '--lists-only') {
    const app = launch(['--memory-vault', vault]);
    await debugOwnerRefusal(app);
    const s = await connect();
    await waitFor(s, has('Memory · Vault open'), 'list fixture open');
    await holdOperationObservation(s, true);
    await nav(s, 'Sessions');
    await waitFor(s, 'window.__operationHeld', 'initial session list held');
    check('W02.session_list_wait_explained', await s.evaluate("document.querySelector('aside[aria-label=Sessions] [role=status]')?.textContent.includes('Reading sessions') === true"));
    check('W02.pending_sessions_not_empty', !(await s.evaluate('__t.text()')).includes('No sessions yet.'));
    await s.evaluate("window.__releaseOperation({kind:'memory_error',result:null,error:{code:'busy',retryable:true,rules:['fixture.session_list_read']}})");
    await waitFor(s, "!!document.querySelector('aside[aria-label=Sessions] [role=alert]')", 'session read error');
    check('W02.failed_sessions_not_empty', !(await s.evaluate('__t.text()')).includes('No sessions yet.'));
    await click(s, 'aside[aria-label=Sessions] [role=alert] button', 'Retry');
    await waitFor(s, has('No sessions yet.'), 'observed empty session list');
    check('W02.observed_empty_sessions', await s.evaluate("!document.querySelector('aside[aria-label=Sessions] [role=alert]')"));
    await click(s, 'button', 'New session');
    await waitFor(s, "!!document.querySelector('#mem-ask') && !document.querySelector('#mem-ask').disabled", 'real session created');
    check('W01.new_session_after_list_retry', await s.evaluate("document.querySelectorAll('aside[aria-label=Sessions] button[aria-pressed]').length === 1 && !__t.text().includes('No sessions yet.')"));

    await nav(s, 'Memory');
    await waitFor(s, has('No approved memories here yet.'), 'initial memory page settled');
    const saved = await s.evaluate("__t.invoke('memory_call',{request:{...__t.request('remember',{text:'Synthetic list read recovery candidate',claimKey:'fixture.list_read'}),idempotencyKey:'ui-'+crypto.randomUUID()}})");
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    await holdOperationObservation(s, true);
    await rail(s, 'Candidate inbox');
    await waitFor(s, 'window.__operationHeld', 'candidate page held');
    check('W02.pending_candidate_count_unknown', await s.evaluate("document.querySelector('.qr31')?.textContent.includes('Waiting for candidates') === true && !document.querySelector('.qr31')?.textContent.includes('0 waiting')"));
    await set(s, '#mem-remember', 'Unsent recovery draft');
    await set(s, '#mem-claim', 'fixture.unsent');
    await s.evaluate("window.__releaseOperation({kind:'memory_error',result:null,error:{code:'busy',retryable:true,rules:['fixture.candidate_list_read']}})");
    await waitFor(s, "!!document.querySelector('[aria-label=\"Candidate inbox\"] [role=alert]') || !!document.querySelector('.qr45 [role=alert]')", 'candidate read error');
    check('W02.failed_candidates_not_empty', !(await s.evaluate('__t.text()')).includes('Nothing waiting for review.'));
    check('W02.failed_candidate_count_unknown', await s.evaluate("document.querySelector('.qr31')?.textContent.includes('Candidates unavailable') === true && !document.querySelector('.qr31')?.textContent.includes('0 waiting')"));
    await click(s, '.qr45 [role=alert] button', 'Retry');
    await waitFor(s, "[...document.querySelectorAll('article.mem-candidate textarea')].some(field => field.value === 'Synthetic list read recovery candidate')", 'candidate recovered');
    check('W02.candidate_list_retry_recovers', await s.evaluate("document.querySelectorAll('article.mem-candidate').length === 1 && document.querySelector('.qr31')?.textContent.includes('1 waiting')"));
    check('W02.list_retry_preserves_unsent_draft', await s.evaluate("document.querySelector('#mem-remember').value === 'Unsent recovery draft' && document.querySelector('#mem-claim').value === 'fixture.unsent'"));
    await acceptFirstCandidate(s, 'Synthetic list read recovery candidate');
    await waitFor(s, has('Nothing waiting for review.'), 'observed empty candidate list');
    check('W01.observed_empty_candidates', await s.evaluate("document.querySelector('.qr31')?.textContent.includes('0 waiting') === true && !document.querySelector('.qr45 [role=alert]')"));
    await shot(s, '19-list-read-recovery');
    await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_exit')");
    const exit = await Promise.race([app.exited, sleep(20000).then(() => 'timeout')]);
    check('W02.list_host_exits', exit === 0);
    s.close();
    return;
  }
  if (process.argv[6] === '--confirm-only') {
    const app = launch(['--memory-vault', vault]);
    await debugOwnerRefusal(app);
    const s = await connect();
    await waitFor(s, has('Memory · Vault open'), 'confirm fixture open');
    const saved = await s.evaluate("__t.invoke('memory_call',{request:{...__t.request('remember',{text:'Synthetic pending confirmation fixture',claimKey:'fixture.confirm_timing'}),idempotencyKey:'ui-'+crypto.randomUUID()}})");
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    await nav(s, 'Memory');
    await rail(s, 'Candidate inbox');
    await waitFor(s, "!!document.querySelector('article.mem-candidate button')", 'confirm candidate ready');
    await s.evaluate("__t.byText('article.mem-candidate button','Accept').focus()");
    await click(s, 'article.mem-candidate button', 'Accept');
    await waitFor(s, "!!document.querySelector('dialog[open]')", 'confirm plan ready');
    const plannedId = await s.evaluate("JSON.parse(document.querySelector('dialog[open] pre').textContent)[0].record_id");
    // Observe request bodies in this owned debug session. Tauri's invoke
    // property stays immutable; never replace the application's transport.
    const confirmations = [];
    s.observe('Network.requestWillBeSent', ({ request }) => {
      if (request.url !== 'http://ipc.localhost/memory_call' || !request.postData) return;
      const payload = JSON.parse(request.postData).request;
      if (payload?.command === 'review_confirm') confirmations.push(payload);
    });
    const network = await s.send('Network.enable', { maxPostDataSize: 4096 });
    if (network.error) throw new Error(network.error.message);
    await holdOperationObservation(s, 'confirm');
    await click(s, 'dialog[open] button', 'Confirm');
    await waitFor(s, 'window.__operationHeld', 'real commit result delivery held');
    check('W02.pending_confirm_disables_actions', await s.evaluate("[...document.querySelectorAll('dialog[open] button')].every(button => button.disabled)"));
    check('W02.pending_confirm_explained', await s.evaluate("document.querySelector('dialog[open] [role=status]')?.textContent.includes('Waiting for Memory') === true"));
    check('W05.pending_confirm_refuses_platform_close', await s.evaluate("document.querySelector('dialog[open]').getAttribute('closedby') === 'none'"));
    for (let count = 0; count < 2; count++) {
      for (const type of ['keyDown', 'keyUp']) await s.send('Input.dispatchKeyEvent', {type, key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    }
    const afterEscape = await s.evaluate("({open:!!document.querySelector('dialog[open]'),mounted:!!document.querySelector('dialog'),waiting:!!document.querySelector('dialog [role=status]')})");
    check('W05.pending_confirm_survives_escape', afterEscape.open, JSON.stringify(afterEscape));
    await waitFor(s, "!!document.querySelector('dialog[open]')", 'pending plan remains or reopens after Escape');
    // Disable the attribute in the test page to exercise the keydown
    // fallback independently; this does not emulate an older WebView.
    await s.evaluate("document.querySelector('dialog[open]').removeAttribute('closedby')");
    for (let count = 0; count < 2; count++) {
      for (const type of ['keyDown', 'keyUp']) await s.send('Input.dispatchKeyEvent', {type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    }
    check('W05.pending_confirm_keyboard_fallback', await s.evaluate("!!document.querySelector('dialog[open]')"));
    await s.evaluate("document.querySelector('dialog[open]').setAttribute('closedby','none')");
    // Exercise the platform close-event fallback deterministically too.
    await s.evaluate("document.querySelector('dialog[open]').close()");
    await waitFor(s, "!!document.querySelector('dialog[open]')", 'pending plan reopened after close event');
    check('W05.pending_confirm_survives_close_event', true);
    for (const type of ['keyDown', 'keyUp']) await s.send('Input.dispatchKeyEvent', {type,key:'4',code:'Digit4',modifiers:2,windowsVirtualKeyCode:52});
    check('W05.pending_confirm_blocks_navigation', await s.evaluate("!!document.querySelector('dialog[open]') && !!document.querySelector('[data-screen-label=\"Memory Vault\"]')"));
    await shot(s, '18-confirmation-waiting');
    const committed = await s.evaluate('window.__operationObserved');
    check('W01.actual_confirmation_receipt', /^cmt_/.test(committed.commitId) && committed.reviewIds.length === 1);
    // The Core already committed; this retryable delivery error is a
    // controlled UI fixture, not a failed or cancelled canonical commit.
    await s.evaluate("window.__releaseOperation({kind:'memory_error',result:null,error:{code:'busy',retryable:true,rules:['fixture.confirm_delivery']}})");
    await waitFor(s, "!!document.querySelector('dialog[open] [role=alert] button')", 'confirm delivery error visible');
    check('W02.confirm_error_keeps_plan', await s.evaluate("!!document.querySelector('dialog[open] pre') && !document.querySelector('dialog[open] [role=status]')"));
    check('W05.confirm_error_restores_close_request', await s.evaluate("document.querySelector('dialog[open]').getAttribute('closedby') === 'closerequest'"));
    await holdOperationObservation(s, 'confirm');
    await click(s, 'dialog[open] [role=alert] button', 'Retry');
    await waitFor(s, 'window.__operationHeld', 'replayed confirmation receipt held');
    check('W02.confirm_retry_reuses_receipt', await s.evaluate(`window.__operationObserved.commitId === ${JSON.stringify(committed.commitId)}`));
    check('W02.confirm_retry_reuses_payload_and_key', confirmations.length === 2 && confirmations[0].idempotencyKey === confirmations[1].idempotencyKey && JSON.stringify(confirmations[0].arguments) === JSON.stringify(confirmations[1].arguments), `observed requests: ${confirmations.length}`);
    check('W02.confirm_retry_explained', await s.evaluate("document.querySelector('dialog[open] [role=status]')?.textContent.includes('Waiting for Memory') === true"));
    await s.evaluate('window.__releaseOperation()');
    await waitFor(s, dialogClosed, 'real confirmation receipt presented');
    await waitFor(s, has('Nothing waiting for review.'), 'confirmed candidate refreshed');
    check('W05.confirmed_list_has_focus', await s.evaluate("document.activeElement.id === 'mem-center-title'"));
    const memories = await s.evaluate("__t.invoke('memory_call',{request:__t.request('memory_list',{cursor:null,limit:25,includeInactive:false})})");
    check('W01.confirmed_once_in_core', memories.ok?.result?.total === 1 && memories.ok.result.items[0].memoryId === plannedId && memories.ok.result.items[0].snippet === 'Synthetic pending confirmation fixture');
    void s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_exit')").catch(() => 0);
    const exit = await Promise.race([app.exited, sleep(20000).then(() => 'timeout')]);
    check('W05.confirm_host_exits', exit === 0);
    s.close();
    return;
  }
  if (process.argv[6] === '--plan-keyboard-only') {
    const app = launch(['--memory-vault', vault]);
    await debugOwnerRefusal(app);
    const s = await connect();
    await waitFor(s, has('Memory · Vault open'), 'keyboard fixture open');
    const saved = await s.evaluate("__t.invoke('memory_call',{request:{...__t.request('remember',{text:'Synthetic keyboard review fixture',claimKey:'fixture.keyboard_review'}),idempotencyKey:'ui_'+crypto.randomUUID()}})");
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    await nav(s, 'Memory');
    await rail(s, 'Candidate inbox');
    await waitFor(s, "!!document.querySelector('article.mem-candidate button')", 'keyboard candidate ready');
    await s.evaluate("__t.byText('article.mem-candidate button','Accept').focus()");
    await click(s, 'article.mem-candidate button', 'Accept');
    await waitFor(s, "!!document.querySelector('dialog[open]')", 'keyboard review plan');
    check('W05.plan_initial_focus', await s.evaluate("document.activeElement.id === 'mem-plan-title'"));
    check('W05.plan_accessible_description', await s.evaluate("document.querySelector('dialog').getAttribute('aria-labelledby') === 'mem-plan-title' && document.querySelector('dialog').getAttribute('aria-describedby') === 'mem-plan-description'"));
    const key = async (name, code, keyCode, modifiers = 0) => {
      for (const type of ['keyDown', 'keyUp']) {
        const r = await s.send('Input.dispatchKeyEvent', { type, key: name, code, windowsVirtualKeyCode: keyCode, modifiers });
        if (r.error) throw new Error(r.error.message);
      }
    };
    await key('Tab', 'Tab', 9, 8);
    check('W05.plan_reverse_tab_stays_inside', await s.evaluate("document.activeElement === __t.byText('dialog[open] button','Confirm')"));
    await key('Tab', 'Tab', 9);
    check('W05.plan_forward_tab_wraps', await s.evaluate("document.activeElement === document.querySelector('dialog[open] pre')"));
    await key('4', 'Digit4', 52, 2);
    check('W05.plan_shortcut_stays_inert', await s.evaluate("!!document.querySelector('dialog[open]') && !!document.querySelector('[data-screen-label=\"Memory Vault\"]')"));
    await shot(s, '17-review-plan-keyboard');
    await key('Escape', 'Escape', 27);
    await waitFor(s, dialogClosed, 'keyboard review cancelled');
    await waitFor(s,"document.querySelector('.qr45').getAttribute('aria-busy')==='false' && !__t.byText('article.mem-candidate button','Accept').disabled",'cancelled candidate refresh settled');
    check('W05.cancel_restores_trigger_focus', await s.evaluate("document.activeElement === __t.byText('article.mem-candidate button','Accept')"));
    const memories = await s.evaluate("__t.invoke('memory_call',{request:__t.request('memory_list',{cursor:null,limit:25,includeInactive:false})})");
    const candidates = await s.evaluate("__t.invoke('memory_call',{request:__t.request('candidate_list',{cursor:null,limit:25})})");
    check('W01.keyboard_cancel_does_not_commit', memories.ok?.result?.total === 0 && candidates.ok?.result?.total === 1, JSON.stringify({ memories: memories.ok?.result?.total ?? memories.err, candidates: candidates.ok?.result?.total ?? candidates.err }));
    await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_exit')");
    const exit = await Promise.race([app.exited, sleep(20000).then(() => 'timeout')]);
    check('W05.keyboard_host_exits', exit === 0);
    s.close();
    return;
  }
  if (process.argv[6] === '--contrast-only') {
    const app = launch(['--memory-vault', vault]);
    await debugOwnerRefusal(app);
    const s = await connect();
    await waitFor(s, has('Memory · Vault open'), 'contrast fixture open');
    await contrastChecks(s);
    await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_exit')");
    const code = await Promise.race([app.exited, sleep(20000).then(() => 'timeout')]);
    check('W05.contrast_host_exits', code === 0);
    s.close();
    return;
  }
  if (process.argv[6] === '--picks-only') {
    const app = launch(['--memory-vault', vault]);
    await debugOwnerRefusal(app);
    const s = await connect();
    await waitFor(s, has('Memory · Vault open'), 'picker fixture open');
    await pickerChecks(s, app);
    void s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_exit')").catch(() => 0);
    const code = await Promise.race([app.exited, sleep(20000).then(() => 'timeout')]);
    check('W01.picker_host_exits', code === 0);
    s.close();
    return;
  }
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
    await waitFor(s, has('Memory · Vault open'), 'quick fixture open');
    await s.evaluate(`(async()=>{
      const send=async(command,args,write=false)=>{
        const request=__t.request(command,args); if(write) request.idempotencyKey='ui-'+crypto.randomUUID();
        const reply=await window.__TAURI_INTERNALS__.invoke('memory_call',{request});
        if(reply.kind==='memory_error') throw new Error(command+': '+reply.error.code); return reply.result;
      };
      const empty=await send('memory_list',{includeInactive:false,cursor:null,limit:1});
      if(empty.total!==0) throw new Error('quick-only requires a fresh empty synthetic Vault');
      for(const [index,text] of ['Synthetic owner keeps a paper sketchbook for Lantern ideas.','<img src=x onerror="window.__xss=1">Synthetic markup note'].entries()) {
        const candidate=await send('remember',{text,claimKey:'fixture.quick_'+index},true);
        const plan=await send('review_plan',{decisions:[{candidateId:candidate.candidateId,revision:candidate.revision,action:'accept',editedContent:null,mergeTarget:null}]});
        await send('review_confirm',{planId:plan.planId,diffHash:plan.diffHash},true);
      }
      const operation=await send('index_rebuild',{});
      for(let attempt=0;attempt<300;attempt++) {
        const status=await send('operation_get',{operationId:operation.operationId});
        if(status.state==='succeeded') return;
        if(['failed','cancelled'].includes(status.state)) throw new Error('quick rebuild: '+status.state);
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      throw new Error('quick rebuild timed out');
    })()`);
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
  fillOpenDialog(app.pid, importFile, false);
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
  fillOpenDialog(app.pid, big, false);
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
    fillOpenDialog(app.pid, big, false);
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
  const quick = await connect(true);
  await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_search')");
  await waitFor(quick, "document.hasFocus() && document.activeElement?.id === 'quick-query' && document.querySelector('#quick-query').value === ''", 'search opening consumed focus and clear');
  await quick.evaluate("__t.set('#quick-query', 'sketchbook')");
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
  const QUICK_TITLE = 'Enouia Runtime · Quick Search';
  await quick.evaluate("__t.invoke('shell_hide')");
  await waitFor(s, "window.__TAURI_INTERNALS__.invoke('shell_status').then(s => !s.overlayVisible)", 'search hidden before hotkey');
  const registered = (await statusOf(s)).companion?.hotkey?.state === 'registered';
  if (registered && windowState(app.pid, QUICK_TITLE) === 'hidden') {
    await s.evaluate("window.__TAURI_INTERNALS__.invoke('shell_show')");
    pressHotkey(app.pid);
    check('W05.hotkey_opens_quick_search', await until(() => windowState(app.pid, QUICK_TITLE) === 'visible'));
    await waitFor(quick, "document.hasFocus() && document.activeElement?.id === 'quick-query' && document.querySelector('#quick-query').value === '' && document.querySelectorAll('.quick-results li').length === 0", 'quick search cleared on show');
    check('W05.quick_search_shows_empty', true);
    await quick.evaluate("__t.set('#quick-query', 'sketchbook')");
    await quick.evaluate("document.querySelector('form').requestSubmit()");
    await waitFor(quick, has('paper sketchbook'), 'quick search result again');
    await quick.evaluate('document.activeElement.blur()');
    await quick.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await quick.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    const hidden = await until(() => windowState(app.pid, QUICK_TITLE) === 'hidden');
    const cleared = await quick.evaluate("document.querySelectorAll('.quick-results li').length === 0 && document.querySelector('#quick-query').value === ''");
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
  await s.evaluate("__t.invoke('shell_search')");
  await waitFor(quick, "document.hasFocus() && document.activeElement?.id === 'quick-query' && document.querySelector('#quick-query').value === ''", 'locked search opening');
  await quick.evaluate("__t.set('#quick-query', 'sketchbook')");
  await quick.evaluate("document.querySelector('form').requestSubmit()");
  await waitFor(quick, "document.querySelectorAll('.quick-results li').length === 0 && document.body.innerText.includes('locked')", 'quick search refused while locked');
  check('W03.quick_search_refused_while_locked', true);
  await quick.evaluate("__t.invoke('shell_show')");
  quick.close();

  // W01 folder picker: create a second Vault, then reopen the first.
  const created = join(out, 'created-vault');
  mkdirSync(created, { recursive: true });
  await set(s, '#mem-create-phrase', 'create new vault');
  await click(s, 'button', 'Create Vault');
  fillOpenDialog(app.pid, created, true);
  await waitFor(s, has('Memory · Vault open'), 'created vault open');
  check('W01.create_via_folder_picker', (await statusOf(s)).vault.rootName === 'created-vault');
  await rail(s, 'Vault & recovery');
  await click(s, 'button', 'Lock Vault');
  await waitFor(s, has('Memory · Vault locked'), 'created locked');
  await click(s, 'button', 'Open an existing Vault');
  fillOpenDialog(app.pid, vault, true);
  await waitFor(s, `${has('Memory · Vault open')}`, 'original reopened');
  check('W01.open_via_folder_picker', (await statusOf(s)).vault.rootName === vault.split(/[\\/]/).pop());

  // Capability and contract denials from the main page.
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

  // Settings: hotkey, login startup (Runtime's own Run value), labels.
  await nav(s, 'Settings');
  await waitFor(s, has('Window and startup'), 'settings');
  check('W05.hotkey_registered', await s.evaluate(`${has(`Ctrl+Alt+${HOTKEY}`)} && ${has('ready')}`));
  check('S.settings_vault_status', await s.evaluate(`${has('Vault open')} && ${has('Components')}`));
  const startupBefore = runValue();
  const startup = await s.evaluate("__t.invoke('startup_status')");
  check('W05.startup_status_readonly', startup.ok?.supported === true && typeof startup.ok?.enabled === 'boolean', JSON.stringify(startup));
  check('W05.startup_value_unchanged', runValue() === startupBefore);
  await shot(s, '06-settings');
  await waitFor(s, has('Available · Show / Lock Memory Vault / Exit'), 'shell settings');
  check('S.shell_status', await s.evaluate(has('Hide to tray · Memory operations keep running')));
  await s.evaluate("document.querySelector('[aria-label=\"Windows shell\"]').scrollIntoView({block:'end'})");
  await shot(s, '07-shell-settings');
  await nav(s, 'Activity');
  check('A.activity_still_demo', await s.evaluate(has('Fictional')));
  await nav(s, 'Runtime');
  check('A.inspector_labelled_fictional', await s.evaluate(has('Fictional · frozen Runtime-local design')));

  // Autostart ignores a supplied Vault and reports an occupied shortcut.
  const secondPort = await unusedPort();
  const second = launch(['--autostart', '--memory-vault', vault], { port: secondPort, profile: 'webview2-autostart' });
  const s2 = await connect(false, secondPort);
  await waitFor(s2, has('No Vault open'), 'autostart has no Vault');
  check('W05.autostart_initially_hidden', windowState(second.pid, 'Enouia Runtime') === 'hidden');
  const secondStatus = await statusOf(s2);
  check('W05.autostart_ignores_vault_argument', secondStatus.vault.state === 'none', secondStatus.vault.state);
  check('W05.hotkey_conflict_reported', secondStatus.companion?.hotkey?.state === 'conflict', JSON.stringify(secondStatus.companion?.hotkey));
  const quick2 = await connect(true, secondPort);
  await quick2.evaluate("__t.click('button', 'Open main window')");
  check('W05.tray_start_can_show', await until(() => windowState(second.pid, 'Enouia Runtime') === 'visible'));
  const compatibilityShow = await s2.evaluate("__t.invoke('show_main')");
  check('W05.compatibility_show_main', !compatibilityShow.err, JSON.stringify(compatibilityShow));
  quick2.close();
  void s2.evaluate("__t.invoke('exit_app')").catch(() => 0);
  const secondExit = await Promise.race([second.exited, sleep(20000).then(() => 'timeout')]);
  check('W05.compatibility_exit', secondExit === 0, `exit ${secondExit}`);
  s2.close();

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
  await click(s, 'button', 'Load more');
  await waitFor(s, has('paper sketchbook'), 'memory after restart');
  await nav(s, 'Sessions');
  await waitFor(s, "document.querySelectorAll('.mem-session-row').length > 0", 'session after restart');
  check('W01.persists_after_restart', true);

  // Session end (ADR-027). A cancelled end changes nothing. A Restart
  // Manager close, as from the installer, reaches tao's WM_ENDSESSION path:
  // RunEvent::Exit runs the Memory shutdown, then the process exits 0. A
  // forced termination would end it with another code.
  const windows = cancelSessionEnd(app.pid);
  await sleep(800);
  check('W03.cancelled_session_end_keeps_running', Number(windows) > 0 && (await statusOf(s)).vault.state === 'open', `${windows} windows`);
  s.close();
  const closed = restartManagerClose(app.pid);
  const ended = await Promise.race([app.exited, sleep(30000).then(() => 'timeout')]);
  check('W03.restart_manager_close_runs_exit', closed === 'shutdown 0' && ended === 0, `${closed}, exit ${ended}`);
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
