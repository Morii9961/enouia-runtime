// Focused owned-browser layout diagnostics. Cold CDP startup has taken 52.7s on this host; commands are bounded to 60s, with no automatic retry.
// node e2e/quick-search-preview-diagnostics.mjs <Edge executable> <directory under ./target>
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
// This project has no PostCSS config. Keep owned layout checks independent of parent-config discovery.
const server = await createServer({ css: { postcss: { plugins: [] } }, server: { host: '127.0.0.1', port: 0, strictPort: true }, logLevel: 'error' });
let browser, ws, nextId = 0;
const pending = new Map();
const pageErrors = [];
const navigationTimings = [];
const networkEvents = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) { const result = await test(); if (result) return result; await sleep(100); }
  throw Error('Diagnostic setup timed out: '+JSON.stringify(pageErrors)+' ' + await evaluate('JSON.stringify({body:document.body.innerHTML.slice(0,1200),overlay:document.querySelector("vite-error-overlay")?.shadowRoot?.textContent?.slice(0,1500)})'));
}
function send(method, params = {}) {
  const id = ++nextId; const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 60000);
    pending.set(id, { resolve, reject, timer, method, started });
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
  const warming=Date.now();
  await fetch(origin+'/');
  await server.environments.client.warmupRequest('/src/main.tsx');
  await server.environments.client.waitForRequestsIdle();
  console.log(JSON.stringify({serverPreparedMs:Date.now()-warming}));
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
    if(waiter.method==='Page.navigate'){const ms=Date.now()-waiter.started;navigationTimings.push(ms);console.log(JSON.stringify({navigationMs:ms}));}
    if (packet.error) waiter.reject(Error(packet.error.message)); else waiter.resolve(packet.result);
  };
  ws.onclose = () => {
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(Error('Owned browser closed')); }
    pending.clear();
  };
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  await send('Runtime.enable');
  await send('Network.enable');
  const response=await fetch(origin+'/');console.log(JSON.stringify({origin,httpStatus:response.status,htmlBytes:(await response.text()).length}));
  await send('Page.enable');
  const initial = await send('Page.navigate', {url: origin + '/?auto-dataset=original&auto-workspace=recall&auto-view=suggestions'});
  if (initial.errorText) throw Error(initial.errorText);
  await until(()=>evaluate(`Boolean(document.querySelector('.am-head'))`));
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });





  const rows=[];
  await send('Emulation.setDeviceMetricsOverride',{width:560,height:420,deviceScaleFactor:1,mobile:false});
  for(const language of ['en','zh-Hans','ja'])for(const theme of ['dark','light'])for(const state of ['empty','results','no-results','error']){
    await evaluate(`localStorage.setItem('enouia.lang',${JSON.stringify(language)})`);
    await send('Page.navigate',{url:origin+`/e2e/quick-search-preview.html?theme=${theme}&state=${state}`});await send('Page.bringToFront');await until(()=>evaluate(`document.documentElement.dataset.fixtureReady==='true'`));await evaluate('document.fonts.ready.then(()=>true)');
    const snapshot=async action=>{
      const row=await evaluate(`(()=>{const w=document.querySelector('[data-fixture-watermark]'),b=w.getBoundingClientRect(),boxes=[...document.querySelectorAll('.quick-search header,.quick-search form,.quick-search footer')].map(e=>e.getBoundingClientRect());return {action:${JSON.stringify(action)},state:${JSON.stringify(state)},language:document.documentElement.lang,theme:document.documentElement.dataset.theme,watermark:w.textContent,watermarkVisible:b.left>=0&&b.top>=0&&b.right<=innerWidth&&b.bottom<=innerHeight,watermarkOverlapsControls:boxes.some(r=>b.left<r.right&&b.right>r.left&&b.top<r.bottom&&b.bottom>r.top),overflow:document.documentElement.scrollWidth>innerWidth,searches:Number(document.documentElement.dataset.fixtureSearches),hostActions:Number(document.documentElement.dataset.fixtureHostActions),query:document.querySelector('#quick-query').value,items:[...document.querySelectorAll('.quick-results li p')].map(e=>e.textContent),errors:document.querySelectorAll('.mem-error').length};})()`);
      if(!row.watermarkVisible||row.watermarkOverlapsControls||row.overflow||row.searches!==(state==='empty'?0:1)||row.hostActions!==0||state==='results'&&row.items.length!==1||state!=='results'&&row.items.length!==0||state==='error'&&row.errors!==1)throw Error('Invalid fictional overlay '+JSON.stringify(row));rows.push(row);return row;
    };
    const initial=await snapshot('initial');if(initial.language!==language)throw Error('Wrong initial language');console.log(JSON.stringify({state,language,theme,searches:initial.searches}));
    const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,`${state}-${language}-${theme}.png`),Buffer.from(shot.data,'base64'));
    if(state==='results'||state==='error'){
      await evaluate(`(()=>{window.fixtureInput=document.querySelector('#quick-query');window.fixtureResult=document.querySelector('.quick-results li');})()`);
      for(const next of ['zh-Hans','ja','en']){
        await evaluate(`(()=>{localStorage.setItem('enouia.lang',${JSON.stringify(next)});window.dispatchEvent(new StorageEvent('storage',{key:'enouia.lang',newValue:${JSON.stringify(next)},storageArea:localStorage}));})()`);await until(()=>evaluate(`document.documentElement.lang==='${next}'`));
        const row=await snapshot('language');
        const retained=await evaluate(`document.querySelector('#quick-query')===fixtureInput&&document.activeElement===fixtureInput&&document.querySelector('.quick-results li')===fixtureResult`);
        if(!retained||row.query!==initial.query||JSON.stringify(row.items)!==JSON.stringify(initial.items))throw Error('Language replayed or discarded search');
      }
    }
  }
  writeFileSync(join(out,'report.json'),JSON.stringify({browser:version.Browser,scope:'Fictional Quick Search fixture only, SDK and Memory transport mocked. No native connection, real Vault or Provider.',rows,pageErrors,navigationTimings},null,2));
  if(pageErrors.length)throw Error('Page errors '+JSON.stringify(pageErrors));
} finally {
  writeFileSync(join(out,'startup-diagnostics.json'),JSON.stringify({pageErrors,networkEvents},null,2));
  if (ws?.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => undefined);
  ws?.close(); browser?.kill(); await server.close(); closeSync(log);
}
