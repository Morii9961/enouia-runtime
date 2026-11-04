// Whole-Vault fictional browser state/layout diagnostics; owned profile only.
// node e2e/vault-demo-diagnostics.mjs <Edge executable> <directory under ./target>
import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'vite';

const [edgeInput, outputInput] = process.argv.slice(2);
if (!edgeInput || !outputInput) throw Error('Expected Edge executable and output directory');
const edge = resolve(edgeInput), out = resolve(outputInput);
if (!out.startsWith(resolve('target') + sep)) throw Error('Diagnostics must stay under the desktop target directory');
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(join(out, 'profile-'));
const log = openSync(join(profile, 'edge.log'), 'a');
const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: true }, logLevel: 'error' });
let browser, ws, nextId = 0;
const pending = new Map();
const pageErrors = [];
const networkEvents = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) { const result = await test(); if (result) return result; await sleep(100); }
  throw Error('Diagnostic setup timed out: '+JSON.stringify(pageErrors)+' ' + await evaluate('JSON.stringify({body:document.body.innerHTML.slice(0,1200),overlay:document.querySelector("vite-error-overlay")?.shadowRoot?.textContent?.slice(0,1500)})'));
}
function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? 'Browser evaluation failed');
  return result.result?.value;
}
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = spawn(edge, ['--headless=new', '--no-first-run', '--disable-extensions', '--disable-default-apps',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
  { windowsHide: true, stdio: ['ignore', log, log] });
  const portFile = join(profile, 'DevToolsActivePort');
  await until(() => existsSync(portFile));
  const port = Number(readFileSync(portFile, 'utf8').split('\n')[0]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid owned browser port');
  const endpoint = `http://127.0.0.1:${port}`;
  const version = await (await fetch(endpoint + '/json/version')).json();
  const targets = await (await fetch(endpoint + '/json/list')).json();
  const target = targets.find(target => target.type === 'page' && target.url === 'about:blank');
  if (!target?.webSocketDebuggerUrl?.startsWith(`ws://127.0.0.1:${port}/`)) throw Error('Owned blank page unavailable');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.onmessage = event => {
    const packet = JSON.parse(event.data), waiter = pending.get(packet.id);
    if(packet.method==='Network.loadingFailed'||packet.method==='Network.responseReceived')networkEvents.push({method:packet.method,params:packet.params});
    if(packet.method==='Runtime.exceptionThrown')pageErrors.push(packet.params.exceptionDetails.exception?.description??packet.params.exceptionDetails.text);
    if(packet.method==='Runtime.consoleAPICalled'&&packet.params.type==='error')pageErrors.push(packet.params.args.map(a=>a.value??a.description).join(' '));
    if (!waiter) return;
    pending.delete(packet.id); clearTimeout(waiter.timer);
    if (packet.error) waiter.reject(Error(packet.error.message)); else waiter.resolve(packet.result);
  };
  ws.onclose = () => {
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(Error('Owned browser closed')); }
    pending.clear();
  };
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  await send('Runtime.enable');await send('Network.enable');await send('Page.enable');
  const response=await fetch(origin+'/');if(response.status!==200)throw Error('Owned Vite entry unavailable');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  const rows=[];
  for(const [width,height,language,theme] of [[1100,700,'zh-Hans','dark'],[1440,900,'ja','light']]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    for(const dataset of ['empty','candidates']){
      const navigation=await send('Page.navigate',{url:origin+`/?vault-dataset=${dataset}&lang=${language}&theme=${theme}`});
      if(navigation.errorText)throw Error(navigation.errorText);
      await until(()=>evaluate(`Boolean(document.querySelector('.qr89'))`));
      if(await evaluate('Boolean(globalThis.isTauri||window.__TAURI_INTERNALS__)'))throw Error('Browser demo unexpectedly has a native bridge');
      for(const page of ['home','memory','context','sessions']){
        await evaluate(`document.querySelector('[data-runtime-page="${page}"]').click()`);
        await until(()=>evaluate(`document.querySelector('[data-runtime-page="${page}"]')?.getAttribute('aria-current')==='page'`));
        await evaluate('document.fonts.ready.then(()=>true)');
        const row=await evaluate(`(()=>{
          const name=${JSON.stringify(page)},restore=document.querySelector('a[href*="vault-dataset=original"]');
          return {dataset:${JSON.stringify(dataset)},page:name,width:innerWidth,height:innerHeight,language:document.documentElement.lang,theme:document.documentElement.dataset.theme,
            overflow:document.documentElement.scrollWidth>innerWidth,invalidTime:/NaN|Invalid Date/.test(document.body.textContent),
            records:document.querySelectorAll('.qr43').length,sessions:document.querySelectorAll('.qr134').length,
            capsule:!!document.querySelector('.qr127'),checkpointEnabled:document.querySelectorAll('.bg-notes button')[3]?.disabled===false,
            restore:!!restore,restoreVisible:restore?(()=>{const r=restore.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})():false};
        })()`);
        if(row.overflow||row.invalidTime||row.records||row.sessions||row.capsule||row.checkpointEnabled||!row.restore||!row.restoreVisible)throw Error('Invalid empty Vault '+JSON.stringify(row));
        rows.push(row);console.log(JSON.stringify(row));
        const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,`${dataset}-${page}-${width}-${language}-${theme}.png`),Buffer.from(shot.data,'base64'));
      }
      await evaluate(`document.querySelector('[data-runtime-page="memory"]').click()`);await until(()=>evaluate('Boolean(document.querySelector(".qr89"))'));
      if(dataset==='candidates'){
        await evaluate(`document.querySelector('.qr26').click()`);await until(()=>evaluate(`document.querySelectorAll('.qr43[data-status=candidate]').length===2`));
        rows.push({dataset,page:'inbox',width,language,candidates:2});
        const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,`${dataset}-inbox-${width}-${language}-${theme}.png`),Buffer.from(shot.data,'base64'));
        await evaluate(`document.querySelector('[data-memory-view="vault"]').click();document.querySelectorAll('.qr26')[1].click()`);
        await until(()=>evaluate(`Boolean(document.querySelector('a[href*="vault-dataset=original"]'))`));
      }
      await evaluate(`document.querySelector('a[href*="vault-dataset=original"]').click()`);
      await until(()=>evaluate("document.querySelectorAll('.qr43').length===9"));
      const restored=await evaluate(`({page:document.querySelector('[data-runtime-page][aria-current="page"]')?.getAttribute('data-runtime-page'),dataset:new URLSearchParams(location.search).get('vault-dataset'),language:document.documentElement.lang,theme:document.documentElement.dataset.theme,records:document.querySelectorAll('.qr43').length})`);
      if(restored.page!=='memory'||restored.dataset!=='original'||restored.language!==language||restored.theme!==theme)throw Error('Restore failed '+JSON.stringify(restored));
      rows.push({phase:'restore',fromDataset:dataset,width,...restored});console.log(JSON.stringify({restored}));
    }
  }
  writeFileSync(join(out,'report.json'),JSON.stringify({browser:version.Browser,scope:'Owned headless browser/profile. Browser-only empty/candidate Vault fixtures; no native bridge. Four surfaces, imported inbox and actual original-sample reloads. Not Core, native or human acceptance.',rows},null,2));
} finally {
  writeFileSync(join(out,'startup-diagnostics.json'),JSON.stringify({pageErrors,networkEvents},null,2));
  if (ws?.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => undefined);
  ws?.close(); browser?.kill(); await server.close(); closeSync(log);
}
