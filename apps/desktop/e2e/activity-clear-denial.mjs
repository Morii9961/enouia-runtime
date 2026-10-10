import { spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function clearDenialMain(ctx) {
  const { settings, out, pkg, manifest, fixtureTree, launch, connect, check,
    press, fillDialog, waitFor, has, overview } = ctx;
  if (existsSync(settings)) throw Error('Clear-denial drill requires fresh owned settings');
  const store = fixtureTree(manifest.dataRoot), manifestBytes = readFileSync(join(pkg, 'install.json'));
  const release = join(dirname(out), 'release-choice-clear-denial');
  if (existsSync(release)) throw Error('Clear-denial release marker is not fresh');
  let app, s, holder;
  let holderOutput = '', holderError = '';
  const releaseDenial = async () => {
    if (!holder) return;
    writeFileSync(release, 'release');
    const code = await holder.exited; holder = null;
    if (code !== 0 || !holderOutput.includes('exact_owned_descriptors_and_bytes_restored=true')) throw Error('Owned denial did not restore exactly: ' + holderError);
  };
  try {
    app = launch(); s = await connect();
    await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
    await waitFor(s, has('Connect the installed Activity producer'), 'clear-denial gate');
    await press(s, 'Choose installed package…'); fillDialog(app.pid, pkg);
    await waitFor(s, "document.querySelectorAll('.act-source').length===3", 'clear-denial selection');
    if (realpathSync(settings) !== join(realpathSync(out), 'activity-install.json')) throw Error('Choice escaped owned output');
    const saved = readFileSync(settings), sources = (await overview(s)).sources;
    check('CD.actual_selection_saves_owned_choice', saved.length > 0);
    await s.evaluate(`(() => {
      const real=window.fetch,url=window.__TAURI_INTERNALS__.convertFileSrc('activity_setup','ipc');window.__clearDenialReplies=[];
      window.fetch=async(u,o)=>{const response=await real(u,o);if(u===url)window.__clearDenialReplies.push({action:JSON.parse(o.body).action,reply:await response.clone().json()});return response;};return true;
    })()`);
    const script = fileURLToPath(new URL('../src-tauri/tests/fixtures/choice-clear-denial.ps1', import.meta.url));
    holder = spawn('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Directory', out, '-ReleasePath', release], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    holder.exited = new Promise(resolve => holder.once('exit', resolve));
    holder.stdout.on('data', bytes => { holderOutput += bytes.toString(); });
    holder.stderr.on('data', bytes => { holderError += bytes.toString(); });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Owned denial not ready')), 10000);
      holder.stdout.on('data', () => { if (holderOutput.includes('denied')) { clearTimeout(timer); resolve(); } });
      holder.once('exit', () => { clearTimeout(timer); reject(Error('Owned denial exited before clear')); });
    });
    check('CD.real_acl_denial_hides_choice_existence', !existsSync(settings));
    await press(s, 'Change package'); await waitFor(s, has('Connect the installed Activity producer'), 'clear-denial disconnected');
    check('CD.native_clear_reports_saved_false', await s.evaluate("window.__clearDenialReplies.some(e=>e.action==='clear'&&e.reply.configured===false&&e.reply.saved===false)"));
    check('CD.refusal_explains_reconnect_and_retry', await s.evaluate(has('It may reconnect after restarting')) && await s.evaluate(has('Retry forgetting package')));
    const deniedStatus = await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'status'})");
    check('CD.native_status_retains_failed_clear', deniedStatus.configured === false && deniedStatus.saved === false);
    check('CD.denial_never_changes_activity_store', fixtureTree(manifest.dataRoot) === store);
    await releaseDenial();
    check('CD.exact_owned_descriptors_and_bytes_restored', holderOutput.includes('exact_owned_descriptors_and_bytes_restored=true'));
    check('CD.failed_clear_preserves_exact_choice_bytes', readFileSync(settings).equals(saved));
    check('CD.package_manifest_and_store_remain_exact', readFileSync(join(pkg, 'install.json')).equals(manifestBytes) && fixtureTree(manifest.dataRoot) === store);
    await s.evaluate("document.querySelector('nav button[aria-label=\"Home\"]').click()");
    await waitFor(s, "!document.querySelector('.act-surface')", 'clear-denial unmount');
    await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
    await waitFor(s, has('Connect the installed Activity producer'), 'clear-denial remount');
    check('CD.remount_keeps_failed_clear_feedback', await s.evaluate(has('Retry forgetting package')));
    s.close(); s = null; app.kill(); await app.exited; app = null;
    app = launch(); s = await connect();
    await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
    await waitFor(s, "document.querySelectorAll('.act-source').length===3", 'retained choice restart');
    check('CD.restart_reconnects_retained_choice', JSON.stringify((await overview(s)).sources) === JSON.stringify(sources));
    const status = await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'status'})");
    check('CD.restart_verifies_retained_choice_saved', status.configured === true && status.saved === true);
    const cleared = await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'clear'})");
    check('CD.recovery_clear_reports_saved_true', cleared.configured === false && cleared.saved === true);
    check('CD.recovery_clear_removes_owned_file', !existsSync(settings));
    const empty = await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'status'})");
    check('CD.recovery_status_retains_success', empty.configured === false && empty.saved === true);
    s.close(); s = null; app.kill(); await app.exited; app = null;
    app = launch(); s = await connect();
    await s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
    await waitFor(s, has('Connect the installed Activity producer'), 'clear success restart');
    check('CD.successful_clear_stays_forgotten_after_restart', !existsSync(settings) && !(await s.evaluate(has('Retry forgetting package'))));
    check('CD.complete_store_and_manifest_remain_exact', fixtureTree(manifest.dataRoot) === store && readFileSync(join(pkg, 'install.json')).equals(manifestBytes));
  } finally {
    await releaseDenial();
    if (s) s.close(); if (app) { app.kill(); await app.exited; }
  }
}
