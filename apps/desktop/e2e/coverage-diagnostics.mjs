// Focused owned-browser layout diagnostics. Cold CDP startup has taken 52.7s on this host; commands are bounded to 60s, with no automatic retry.
// node e2e/coverage-diagnostics.mjs <Edge executable> <directory under ./target>
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
  const initial = await send('Page.navigate', {url: origin + '/?auto-dataset=original&auto-workspace=time'});
  if (initial.errorText) throw Error(initial.errorText);
  await until(()=>evaluate(`Boolean(document.querySelector('.am-head'))`));
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });


  const rows=[];
  for(const [width,height,language,theme] of [[1100,700,'zh-Hans','dark'],[1100,700,'ja','light'],[1440,900,'en','light']]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    for(const dataset of ['coverage','original']) {
      const navigation=await send('Page.navigate',{url:origin+`/?lang=${language}&theme=${theme}&auto-dataset=${dataset}&auto-workspace=time&auto-time-view=coverage`});
      if(navigation.errorText)throw Error(navigation.errorText);
      await until(()=>evaluate(`Boolean(document.querySelector('.am-coverage'))`));
      await evaluate('document.fonts.ready.then(()=>true)');
      const snapshot=async action=>{
        const row=await evaluate(`(()=>{const table=document.querySelector('.am-coverage-table');const cell=document.querySelector('[data-coverage-day="2026-10-01"]');return {
          dataset:${JSON.stringify(dataset)},action:${JSON.stringify(action)},width:innerWidth,language:document.documentElement.lang,theme:document.documentElement.dataset.theme,
          overflow:document.documentElement.scrollWidth>innerWidth,mainOverflow:document.querySelector('.am-main').scrollWidth>document.querySelector('.am-main').clientWidth,
          table:!!table,columns:table?.querySelectorAll('thead th').length??0,
          material:cell?.dataset.materialCount??null,staged:cell?.dataset.stagedCount??null,adopted:cell?.dataset.adoptedCount??null,
          selectedDay:document.querySelector('[data-coverage-detail]')?.dataset.coverageDetail??null,
          rawKey:document.querySelector('[data-coverage-material] code')?.textContent??null,
          title:document.querySelector('.am-i-title')?.textContent??null,
          unavailableLink:document.querySelector('[data-open-coverage]')?.href??null,layerBands:document.querySelectorAll('[data-band]').length,
          falseNaN:document.body.textContent.includes('NaN')};})()`);
        if(row.overflow||row.mainOverflow||row.falseNaN||dataset==='coverage'&&(!row.table||row.columns!==7)||dataset==='original'&&(row.table||!row.unavailableLink?.includes('auto-time-view=coverage')))throw Error('Invalid coverage '+JSON.stringify(row));
        rows.push(row);console.log(JSON.stringify(row));return row;
      };
      const row=await snapshot('initial');
      if(dataset==='coverage'){
        if(row.material!=='1'||row.staged!=='0'||row.adopted!=='1')throw Error('Unexpected current-state counts');
        await evaluate(`document.querySelector('.am-coverage-table').scrollIntoView({block:'start'});document.querySelector('.am-main').scrollTop+=140`);
        const basis=await evaluate(`(()=>{const mainEl=document.querySelector('.am-main'),main=mainEl.getBoundingClientRect(),caption=document.querySelector('caption').getBoundingClientRect(),padding=Number.parseFloat(getComputedStyle(mainEl).paddingTop);return {pinned:caption.top>=main.top-2&&caption.top<=main.top+padding+2,visible:caption.bottom<main.bottom,captionTop:caption.top,mainTop:main.top,padding};})()`);
        const basisShot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,`basis-${width}-${language}-${theme}.png`),Buffer.from(basisShot.data,'base64'));
        if(!basis.pinned||!basis.visible)throw Error('Calendar basis disappeared '+JSON.stringify(basis));
        rows.push({width,language,action:'calendar-scrolled-with-basis',...basis});
        let shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,`${dataset}-${width}-${language}-${theme}.png`),Buffer.from(shot.data,'base64'));
        await evaluate(`document.querySelector('[data-coverage-month="2026-09"]').click()`);
        await until(()=>evaluate(`Boolean(document.querySelector('[data-coverage-day="2026-09-30"]'))`));
        await evaluate(`document.querySelector('[data-coverage-day="2026-09-30"]').click()`);
        await until(()=>evaluate(`Boolean(document.querySelector('[data-coverage-material="demo_material_01"]'))`));
        const detail=await snapshot('received-material-detail');
        if(!detail.rawKey.includes('demo_material_01 · r1')||detail.selectedDay!=='2026-09-30')throw Error('Material identity lost');
        await evaluate(`document.querySelector('[data-coverage-material]').scrollIntoView({block:'center'})`);
        shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,`material-${width}-${language}-${theme}.png`),Buffer.from(shot.data,'base64'));
        await evaluate(`document.querySelectorAll('[data-coverage-layer]').forEach(input=>input.click())`);
        await until(()=>evaluate(`document.querySelectorAll('[data-band]').length===0`));
        await snapshot('all-layers-hidden');
      }else{
        const url=await evaluate(`document.querySelector('[data-open-coverage]').href`);
        const navigation=await send('Page.navigate',{url});if(navigation.errorText)throw Error(navigation.errorText);
        await until(()=>evaluate(`Boolean(document.querySelector('.am-coverage-table'))`));
        rows.push({width,language,action:'follow-unavailable-sample-link',calendar:true});
      }
    }
  }
  writeFileSync(join(out,'report.json'),JSON.stringify({browser:version.Browser,scope:'Owned synthetic browser/profile only. No native or human acceptance.',rows,pageErrors,navigationTimings},null,2));
  if(pageErrors.length)throw Error('Page errors '+JSON.stringify(pageErrors));
} finally {
  writeFileSync(join(out,'startup-diagnostics.json'),JSON.stringify({pageErrors,networkEvents},null,2));
  if (ws?.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => undefined);
  ws?.close(); browser?.kill(); await server.close(); closeSync(log);
}
