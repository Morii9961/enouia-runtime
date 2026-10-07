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
// package choice (%APPDATA%\com.enouia.runtime\activity-install.json) is
// backed up first and restored afterwards. No task is registered, no account
// is collected and nothing leaves 127.0.0.1. Synthetic data only.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const [exe, pkg, out] = process.argv.slice(2);
if (!out || !isAbsolute(exe) || !isAbsolute(pkg)) {
  throw new Error('usage: activity-smoke.mjs <absolute exe> <package-root> <out-dir>');
}
mkdirSync(out, { recursive: true });
const PORT = 9351;
const report = { checks: [], screenshots: [] };
const children = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (id, ok, detail = '') => {
  report.checks.push({ id, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${detail}`);
};
const settings = join(process.env.APPDATA, 'com.enouia.runtime', 'activity-install.json');
const saved = existsSync(settings) ? readFileSync(settings) : null;

function launch() {
  const child = spawn(exe, [], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT} --remote-debugging-address=127.0.0.1`,
      WEBVIEW2_USER_DATA_FOLDER: join(out, 'webview2'),
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
      for (const page of targets.filter((t) => t.type === 'page' && t.url.startsWith('http://tauri.localhost/') && !t.url.includes('view=overlay'))) {
        const s = session(page.webSocketDebuggerUrl);
        await waitFor(s, "document.readyState === 'complete' && !!document.querySelector('#root > *')", 'page');
        if ((await s.evaluate('window.__TAURI_INTERNALS__.metadata.currentWindow.label')) === 'main') return s;
        s.close();
      }
    } catch { /* not up yet */ }
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
const press = (s, text) => s.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === ${JSON.stringify(text)}); if (!b || b.disabled) throw new Error('unavailable ${text}'); b.click(); return true; })()`);
const disabled = (s, text) => s.evaluate(`[...document.querySelectorAll('button')].find((e) => e.textContent.trim() === ${JSON.stringify(text)})?.disabled === true`);

function powershell(script) {
  return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
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
  check('C.task_not_registered_reported', o.schedule.task?.registered === false && o.health.some((h) => h.id === 'activity_scheduler' && h.state === 'unavailable'));
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
  await main();
} catch (err) {
  check('run', false, String(err.message ?? err));
} finally {
  for (const child of children) child.kill();
  if (saved) { mkdirSync(join(process.env.APPDATA, 'com.enouia.runtime'), { recursive: true }); writeFileSync(settings, saved); } else rmSync(settings, { force: true });
  const passed = report.checks.filter((c) => c.ok).length;
  report.summary = `${passed}/${report.checks.length}`;
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`checks ${report.summary}`);
  process.exitCode = passed === report.checks.length ? 0 : 1;
}
