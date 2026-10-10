import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Actual write or replacement sharing refusal on an owned saved choice while
// the real native picker saves a new one. The holder still shares reads. No
// modeled IPC, ACL change, producer write or personal configuration.
export async function savedChoiceWriteLockMain(ctx) {
  const { settings, out, pkg, manifest, fixtureTree, launch, connect,
    fillDialog, waitFor, has, overview, shot, children } = ctx;
  const replacementOnly = ctx.replacementOnly === true;
  const check = (id, ok, detail) => ctx.check(replacementOnly ? id.replace(/^CW\./, 'AR.') : id, ok, detail);
  const noStaging = () => !readdirSync(out).some(name => name.startsWith('.activity-install.json.') && name.endsWith('.tmp'));
  if (existsSync(settings) ||
      realpathSync(manifest.dataRoot).toLowerCase() !== join(realpathSync(pkg + '/..'), 'data').toLowerCase()) {
    throw Error('Choice-write acceptance requires fresh contained synthetic settings/data');
  }
  const tree = fixtureTree(manifest.dataRoot);
  // A valid earlier choice in plain absolute form; the picker stores the
  // verbatim canonical form, so a replaced file would have different bytes.
  const prior = Buffer.from(`${JSON.stringify({ installRoot: realpathSync(pkg) })}\n`);
  writeFileSync(settings, prior, { flag: 'wx' });
  if (realpathSync(settings) !== join(realpathSync(out), 'activity-install.json')) throw Error('Choice escaped owned output');
  check('CW.owned_prior_choice_is_written', readFileSync(settings).equals(prior));

  let app = launch(), s = await connect();
  const activity = () => s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
  const status = () => s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'status'})");
  const select = async () => {
    await s.evaluate("window.__choiceWrite=null;window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'select'}).then(r=>window.__choiceWrite=r,e=>window.__choiceWrite={error:String(e)});true");
    fillDialog(app.pid, pkg);
    await waitFor(s, 'window.__choiceWrite!==null', 'actual picker reply');
    return s.evaluate('window.__choiceWrite');
  };
  const stopApp = async () => { s.close(); app.kill(); await app.exited; };
  await activity();
  await waitFor(s, "document.querySelectorAll('.act-source').length===3", 'prior choice startup');
  const initial = await status();
  check('CW.startup_connects_prior_choice', initial.configured === true);
  const expected = await overview(s);

  const holder = spawn('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command',
      `$ErrorActionPreference='Stop';$f=[IO.File]::Open('${settings.replace(/'/g, "''")}','Open','Read','${replacementOnly ? 'ReadWrite' : 'Read'}');try{'locked';Start-Sleep -Seconds 120}finally{$f.Dispose()}`],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(holder);
  holder.exited = new Promise(r => holder.once('exit', code => { children.delete(holder); r(code); }));
  let refusedReply;
  try {
    await new Promise((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => reject(Error('Choice-write holder not ready')), 10000);
      holder.stdout.on('data', bytes => { text += bytes; if (text.includes('locked')) { clearTimeout(timer); resolve(); } });
      holder.once('error', error => { clearTimeout(timer); reject(error); });
      holder.once('exit', () => { clearTimeout(timer); reject(Error('Choice-write holder exited')); });
    });
    check('CW.owned_finite_holder_is_ready', holder.pid > 0 && holder.exitCode === null);
    let refused = false, opened = false;
    try { closeSync(openSync(settings, 'r+')); opened = true; } catch (error) { refused = ['EBUSY', 'EACCES', 'EPERM'].includes(error.code); }
    check(replacementOnly ? 'CW.actual_write_open_remains_available' : 'CW.actual_settings_write_is_refused', replacementOnly ? opened : refused);
    check('CW.settings_remain_readable_during_hold', readFileSync(settings).equals(prior));
    refusedReply = await select();
    check('CW.actual_picker_save_reports_saved_false', refusedReply.configured === true && refusedReply.saved === false, JSON.stringify(refusedReply));
    check('CW.refused_save_keeps_exact_prior_bytes', readFileSync(settings).equals(prior));
    if (replacementOnly) check('CW.refused_replacement_removes_only_own_staging_file', noStaging());
    await waitFor(s, "document.querySelectorAll('.act-source').length===3", 'connection after refused save');
    check('CW.refused_save_keeps_three_exact_histories', JSON.stringify((await overview(s)).sources) === JSON.stringify(expected.sources));
    const held = await status();
    check('CW.status_stays_configured_during_hold', held.configured === true, JSON.stringify(held));
    check('CW.refused_save_preserves_complete_store', fixtureTree(manifest.dataRoot) === tree);
  } finally { holder.kill(); await holder.exited; }
  check('CW.release_keeps_exact_prior_bytes', readFileSync(settings).equals(prior));

  const recovered = await select();
  const canonical = readFileSync(settings);
  check('CW.released_picker_saves_verified_choice', recovered.configured === true && recovered.saved === true && (await status()).saved === true, JSON.stringify(recovered));
  check('CW.released_save_replaces_prior_with_canonical_choice', !canonical.equals(prior) &&
    JSON.parse(canonical).installRoot.replace(/^\\\\\?\\/, '').toLowerCase() === realpathSync(pkg).toLowerCase());
  if (replacementOnly) check('CW.successful_replacement_leaves_no_staging_file', noStaging());
  await stopApp(); app = launch(); s = await connect(); await activity();
  await waitFor(s, "document.querySelectorAll('.act-source').length===3", 'recovered choice restart');
  check('CW.restart_reconnects_saved_choice', (await status()).saved === true && readFileSync(settings).equals(canonical));
  check('CW.all_write_faults_leave_complete_store_exact', fixtureTree(manifest.dataRoot) === tree);
  const clear = await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'clear'})");
  check('CW.final_clear_removes_only_owned_choice', clear.configured === false && clear.saved === true && !existsSync(settings));
  await shot(s, '01-choice-write-recovered'); await stopApp();
}
