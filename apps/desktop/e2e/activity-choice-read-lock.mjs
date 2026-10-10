import { spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Actual FileShare.None on a fresh choice made by the owned native picker.
// No modeled IPC, ACL changes, producer writes or personal configuration.
export async function savedChoiceReadLockMain(ctx) {
  const { settings, out, pkg, manifest, fixtureTree, launch, connect, check,
    press, fillDialog, waitFor, has, overview, sleep, children, shot } = ctx;
  if (existsSync(settings) ||
      realpathSync(manifest.dataRoot).toLowerCase() !== join(realpathSync(pkg + '/..'), 'data').toLowerCase()) {
    throw Error('Choice-read acceptance requires fresh contained synthetic settings/data');
  }
  const tree = fixtureTree(manifest.dataRoot);
  let app = launch(), s = await connect();
  const activity = async () => {
    await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
  };
  const status = () => s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'status'})");
  const stopApp = async () => { s.close(); app.kill(); await app.exited; };
  await activity();
  await waitFor(s, has('Connect the installed Activity producer'), 'fresh choice gate');
  await press(s, 'Choose installed package…'); fillDialog(app.pid, pkg);
  await waitFor(s, "document.querySelectorAll('.act-source').length===3", 'actual choice');
  if (realpathSync(settings) !== join(realpathSync(out), 'activity-install.json')) throw Error('Choice escaped owned output');
  const saved = readFileSync(settings);
  check('CR.real_picker_saves_verified_choice', (await status()).saved === true);
  const expected = await overview(s);
  const holder = spawn('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command',
      `$ErrorActionPreference='Stop';$f=[IO.File]::Open('${settings.replace(/'/g, "''")}','Open','Read','None');try{'locked';Start-Sleep -Seconds 120}finally{$f.Dispose()}`],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(holder);
  holder.exited = new Promise(r => holder.once('exit', code => { children.delete(holder); r(code); }));
  try {
    await new Promise((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => reject(Error('Choice-read holder not ready')), 10000);
      holder.stdout.on('data', bytes => { text += bytes; if (text.includes('locked')) { clearTimeout(timer); resolve(); } });
      holder.once('error', error => { clearTimeout(timer); reject(error); });
      holder.once('exit', () => { clearTimeout(timer); reject(Error('Choice-read holder exited')); });
    });
    check('CR.owned_finite_holder_is_ready', holder.pid > 0 && holder.exitCode === null);
    let refused = false;
    try { readFileSync(settings); } catch (error) { refused = ['EBUSY', 'EACCES', 'EPERM'].includes(error.code); }
    check('CR.actual_settings_read_is_refused', refused);
    const cached = await status();
    check('CR.cached_status_retains_connection_but_saved_false', cached.configured === true && cached.saved === false);
    check('CR.cached_three_histories_remain_exact', JSON.stringify((await overview(s)).sources) === JSON.stringify(expected.sources));
    await s.evaluate("document.querySelector('nav button[aria-label=\"Home\"]').click()");
    await activity();
    await waitFor(s, has('Package connected for this window'), 'actual failed-read remount warning');
    check('CR.cached_remount_explains_unverified_choice', await s.evaluate(has('Package connected for this window')));
    check('CR.cached_remount_retains_three_histories', await s.evaluate("document.querySelectorAll('.act-source').length===3"));
  } finally { holder.kill(); await holder.exited; }
  check('CR.release_restores_exact_choice_bytes', readFileSync(settings).equals(saved));
  const restored = await status();
  check('CR.same_host_reverifies_saved_choice_after_release', restored.configured === true && restored.saved === true);
  await s.evaluate("document.querySelector('nav button[aria-label=\"Home\"]').click()");
  await activity(); await waitFor(s, "document.querySelectorAll('.act-source').length===3", 'verified remount');
  check('CR.recovered_remount_clears_unverified_warning', !(await s.evaluate(has('Package connected for this window'))));
  check('CR.cached_fault_preserves_complete_store', fixtureTree(manifest.dataRoot) === tree);
  await stopApp();

  // A new host must refuse the same saved choice while its file is unreadable.
  const startupHolder = spawn('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command',
      `$ErrorActionPreference='Stop';$f=[IO.File]::Open('${settings.replace(/'/g, "''")}','Open','Read','None');try{'locked';Start-Sleep -Seconds 120}finally{$f.Dispose()}`],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(startupHolder);
  startupHolder.exited = new Promise(r => startupHolder.once('exit', code => { children.delete(startupHolder); r(code); }));
  try {
    await new Promise((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => reject(Error('Startup choice-read holder not ready')), 10000);
      startupHolder.stdout.on('data', bytes => { text += bytes; if (text.includes('locked')) { clearTimeout(timer); resolve(); } });
      startupHolder.once('error', error => { clearTimeout(timer); reject(error); });
      startupHolder.once('exit', () => { clearTimeout(timer); reject(Error('Startup holder exited')); });
    });
    let refused = false;
    try { readFileSync(settings); } catch (error) { refused = ['EBUSY', 'EACCES', 'EPERM'].includes(error.code); }
    check('CR.startup_actual_settings_read_is_refused', refused);
    app = launch(); s = await connect(); await activity();
    await waitFor(s, has('Connect the installed Activity producer'), 'unreadable startup gate');
    const unconfigured = await status(), read = await overview(s);
    check('CR.startup_status_refuses_without_invented_saved_outcome', unconfigured.configured === false && !Object.hasOwn(unconfigured, 'saved'));
    check('CR.startup_overview_refuses_unconfigured', read.kind === 'activity_error' && read.error?.code === 'unconfigured');
    check('CR.startup_page_has_gate_without_history', await s.evaluate("document.querySelectorAll('.act-source').length===0"));
    check('CR.startup_has_no_invented_save_or_clear_failure', !(await s.evaluate(has('Package connected for this window'))) && !(await s.evaluate(has('Retry forgetting package'))));
    check('CR.startup_fault_preserves_complete_store', fixtureTree(manifest.dataRoot) === tree);
  } finally { startupHolder.kill(); await startupHolder.exited; }
  check('CR.startup_release_restores_exact_choice_bytes', readFileSync(settings).equals(saved));
  // Explicit picker recovery is the existing contract; no automatic reload claim.
  await press(s, 'Choose installed package…'); fillDialog(app.pid, pkg);
  await waitFor(s, "document.querySelectorAll('.act-source').length===3", 'explicit released choice recovery');
  check('CR.actual_picker_recovers_verified_saved_choice', (await status()).saved === true);
  check('CR.reselection_retains_exact_choice_bytes', readFileSync(settings).equals(saved));
  check('CR.recovery_restores_exact_three_histories', JSON.stringify((await overview(s)).sources) === JSON.stringify(expected.sources));
  await stopApp(); app = launch(); s = await connect(); await activity();
  await waitFor(s, "document.querySelectorAll('.act-source').length===3", 'released choice restart');
  check('CR.restart_reconnects_verified_saved_choice', (await status()).saved === true);
  check('CR.all_read_faults_leave_complete_store_exact', fixtureTree(manifest.dataRoot) === tree);
  const clear = await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'clear'})");
  check('CR.final_clear_removes_only_owned_choice', clear.configured === false && clear.saved === true && !existsSync(settings));
  await shot(s, '01-choice-read-recovered'); await stopApp();
}
