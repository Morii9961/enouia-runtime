import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Only the freshly prepared synthetic package's manifest is edited. Its exact
// original bytes are restored even if the owned native drill fails.
export async function manifestBoundaryMain(ctx) {
  const { settings, out, pkg, manifest, fixtureTree, launch, connect, check,
    fillDialog, waitFor, has, overview, shot } = ctx;
  if (existsSync(settings) || realpathSync(manifest.dataRoot).toLowerCase() !==
      join(realpathSync(dirname(pkg)), 'data').toLowerCase()) {
    throw Error('Manifest boundary requires fresh contained settings/data');
  }
  const path = join(pkg, 'install.json');
  if (realpathSync(path) !== join(realpathSync(pkg), 'install.json')) throw Error('Manifest escaped owned package');
  const original = readFileSync(path), store = fixtureTree(manifest.dataRoot);
  const padded = Buffer.alloc(64 * 1024, 32);
  if (original.length >= padded.length) throw Error('Fixture manifest exceeds boundary');
  original.copy(padded);
  writeFileSync(settings, JSON.stringify({ installRoot:realpathSync(pkg) })+'\n', { flag:'wx' });
  const saved = readFileSync(settings);
  let app, s;
  const activity = () => s.evaluate("document.querySelector('nav button[aria-label=\"Activity\"]').click()");
  const status = () => s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'status'})");
  const stop = async () => { if(s) s.close(); if(app) { app.kill(); await app.exited; } s=null; app=null; };
  const select = async () => {
    await s.evaluate("window.__manifestReply=null;window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'select'}).then(r=>window.__manifestReply=r,e=>window.__manifestReply={error:String(e)});true");
    fillDialog(app.pid, pkg);
    await waitFor(s, 'window.__manifestReply!==null', 'manifest picker reply');
    return s.evaluate('window.__manifestReply');
  };
  try {
    for (const [name, bytes] of [
      ['probe_byte',Buffer.concat([padded,Buffer.from(' ')])],
      ['large',Buffer.concat([padded,Buffer.alloc(3 * padded.length,32)])],
      ['malformed',Buffer.from('{"schemaVersion":')],
    ]) {
      writeFileSync(path,bytes);
      app=launch(); s=await connect(); await activity();
      await waitFor(s,has('Connect the installed Activity producer'),'manifest startup refusal');
      const startup=await status();
      check(`MB.${name}_startup_refuses_package`,startup.configured===false && !('saved' in startup));
      check(`MB.${name}_startup_retains_settings`,readFileSync(settings).equals(saved));
      const reply=await select();
      check(`MB.${name}_real_picker_refuses_manifest`,reply.configured===false && reply.error==='not_a_package');
      check(`MB.${name}_refusal_keeps_exact_manifest`,readFileSync(path).equals(bytes));
      check(`MB.${name}_refusal_keeps_exact_settings_and_store`,readFileSync(settings).equals(saved) && fixtureTree(manifest.dataRoot)===store);
      await stop();
    }
    writeFileSync(path,padded);
    app=launch(); s=await connect(); await activity();
    await waitFor(s,"document.querySelectorAll('.act-source').length===3",'exact-limit manifest startup');
    check('MB.exact_limit_startup_connects',(await status()).configured===true && (await status()).saved===true);
    const expected=(await overview(s)).sources;
    const accepted=await select();
    check('MB.exact_limit_real_picker_accepts',accepted.configured===true && accepted.saved===true);
    check('MB.exact_limit_keeps_manifest_and_histories',readFileSync(path).equals(padded) && JSON.stringify((await overview(s)).sources)===JSON.stringify(expected));
    await stop();
    writeFileSync(path,original);
    app=launch(); s=await connect(); await activity();
    await waitFor(s,"document.querySelectorAll('.act-source').length===3",'restored manifest restart');
    check('MB.restored_manifest_restarts_verified',(await status()).saved===true);
    check('MB.all_refusals_preserve_complete_store',fixtureTree(manifest.dataRoot)===store);
    const clear=await s.evaluate("window.__TAURI_INTERNALS__.invoke('activity_setup',{action:'clear'})");
    check('MB.clear_removes_only_owned_choice',clear.saved===true && !existsSync(settings));
    await shot(s,'01-manifest-boundary');
  } finally {
    try { await stop(); } finally {
      writeFileSync(path,original);
      if (!readFileSync(path).equals(original)) throw Error('Synthetic manifest restoration failed');
    }
  }
}
