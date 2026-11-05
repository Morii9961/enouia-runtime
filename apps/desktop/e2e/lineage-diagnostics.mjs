// Focused owned-browser layout diagnostics. Cold CDP startup has taken 52.7s on this host; commands are bounded to 60s, with no automatic retry.
// node e2e/lineage-diagnostics.mjs <Edge executable> <directory under ./target>
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
  const initial = await send('Page.navigate', {url: origin + '/?auto-dataset=original&auto-workspace=relations&auto-view=replacement'});
  if (initial.errorText) throw Error(initial.errorText);
  await until(()=>evaluate(`Boolean(document.querySelector('.am-head'))`));
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });




  const rows=[];
  for(const [width,height,language,theme] of [[1100,700,'zh-Hans','dark'],[1100,700,'ja','light'],[1440,900,'en','light']]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    for(const [dataset,view] of (process.argv.includes('--layout-only') ? [['original','replacement'],['original','evidence'],['source-missing','evidence']] : [['original','replacement'],['original','evidence'],['source-missing','evidence'],['unknown-result','evidence']])){
      const navigation=await send('Page.navigate',{url:origin+`/?lang=${language}&theme=${theme}&auto-dataset=${dataset}&auto-workspace=relations&auto-view=${view}`});
      if(navigation.errorText)throw Error(navigation.errorText);
      await until(()=>evaluate(`Boolean(document.querySelector('[data-lineage-mode="${view}"]'))`));
      if(dataset==='original'&&view==='evidence'){
        await evaluate(`(()=>{const picker=document.querySelector('[data-lineage-select]');picker.value='am_01';picker.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        await until(()=>evaluate(`Boolean(document.querySelector('[data-lineage-selected="am_01"]'))`));
      }
      await evaluate('document.fonts.ready.then(()=>true)');
      const row=await evaluate(`(()=>{const lineage=document.querySelector('.am-lineage');return {
        dataset:${JSON.stringify(dataset)},view:${JSON.stringify(view)},width:innerWidth,language:document.documentElement.lang,theme:document.documentElement.dataset.theme,
        overflow:document.documentElement.scrollWidth>innerWidth,mainOverflow:document.querySelector('.am-main').scrollWidth>document.querySelector('.am-main').clientWidth,
        lineageOverflow:lineage.scrollWidth>lineage.clientWidth,workspace:document.querySelector('[data-memory-workspace][aria-current="page"]').dataset.memoryWorkspace,
        selected:document.querySelector('[data-lineage-selected]').dataset.lineageSelected,edges:[...document.querySelectorAll('[data-lineage-edge]')].map(e=>e.dataset.lineageEdge),
        excerpts:document.querySelectorAll('[data-lineage-excerpt]').length,dependencies:document.querySelectorAll('[data-lineage-dependency]').length,
        statement:document.querySelector('.am-statement').textContent,inspector:document.querySelector('.am-i-title').textContent,
        unknownKey:document.querySelector('.am-unknown-result code')?.textContent??null,unknownPacket:document.querySelector('.am-unknown-result pre')?.textContent??null,
        demoHref:document.querySelector('.am-demo-states a').href,firstEdgeVisible:(()=>{const edge=document.querySelector('[data-lineage-edge]');if(!edge)return null;const main=document.querySelector('.am-main').getBoundingClientRect(),box=edge.getBoundingClientRect();return box.top>=main.top&&box.bottom<=main.bottom;})()};})()`);
      if(row.overflow||row.mainOverflow||row.lineageOverflow||row.workspace!=='relations'||dataset==='original'&&view==='replacement'&&row.edges.join()!=='am_05:am_06'||dataset==='original'&&view==='evidence'&&(row.edges.join()!=='am_01:am_03,am_03:am_08'||row.excerpts!==2||row.dependencies!==1)||dataset==='source-missing'&&(row.excerpts!==0||row.edges.length)||dataset==='unknown-result'&&(row.unknownKey!=='demo-only-unknown-0001'||!row.unknownPacket?.includes('Result: unknown')))throw Error('Invalid lineage '+JSON.stringify(row));
      if(view==='replacement'&&!row.firstEdgeVisible)throw Error('Replacement link below fold '+JSON.stringify(row));
      if(new URL(row.demoHref).searchParams.get('auto-view')!==view)throw Error('Sample link lost chain view');
      rows.push(row);console.log(JSON.stringify(row));
      await evaluate(`document.querySelector('.am-lineage').scrollIntoView({block:'start'});document.querySelector('.am-unknown-result')?.setAttribute('open','')`);
      const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,`${dataset}-${view}-${width}-${language}-${theme}.png`),Buffer.from(shot.data,'base64'));
      if(dataset==='source-missing'&&!process.argv.includes('--layout-only')){
        const href=await evaluate(`[...document.querySelectorAll('.am-demo-states a')].find(a=>new URL(a.href).searchParams.get('auto-dataset')==='original').href`);
        const navigation=await send('Page.navigate',{url:href});if(navigation.errorText)throw Error(navigation.errorText);
        await until(()=>evaluate(`Boolean(document.querySelector('[data-lineage-mode="evidence"][aria-label]'))`));rows.push({width,language,action:'follow-sample-link',view:'evidence',workspace:'relations'});
      }
    }
    if(process.argv.includes('--layout-only'))continue;
    const navigation=await send('Page.navigate',{url:origin+`/?lang=${language}&theme=${theme}&auto-dataset=original&auto-workspace=relations&auto-view=unknown-view`});if(navigation.errorText)throw Error(navigation.errorText);
    await until(()=>evaluate(`Boolean(document.querySelector('.am[data-view="stars"]'))`));rows.push({width,language,action:'unknown-view-falls-back',view:'stars'});
  }
  writeFileSync(join(out,'report.json'),JSON.stringify({browser:version.Browser,scope:'Owned synthetic browser/profile only. No native or human acceptance.',rows,pageErrors,navigationTimings},null,2));
  if(pageErrors.length)throw Error('Page errors '+JSON.stringify(pageErrors));
} finally {
  writeFileSync(join(out,'startup-diagnostics.json'),JSON.stringify({pageErrors,networkEvents},null,2));
  if (ws?.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => undefined);
  ws?.close(); browser?.kill(); await server.close(); closeSync(log);
}
