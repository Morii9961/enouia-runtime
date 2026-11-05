// Focused owned-browser layout diagnostics. Cold CDP startup has taken 52.7s on this host; commands are bounded to 60s, with no automatic retry.
// node e2e/scaling-diagnostics.mjs <Edge executable> <directory under ./target>
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
  for(const [width,height,language,theme,ratio] of [[1100,700,'en','light',1],[550,350,'zh-Hans','dark',2],[550,350,'en','light',2],[720,450,'ja','light',2]].filter(([w])=>!process.argv.includes('--resize-only')&&(!process.argv.includes('--focus-only')||w===550))){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:ratio,mobile:false});
    for(const [workspace,view,dataset,time] of [...['grid','formation','timeline','stars','starmap','replacement','evidence','conflicts','revisions','hypotheses','recall','suggestions'].map(view=>[view==='grid'?'memories':view==='timeline'?'time':['stars','starmap','replacement','evidence'].includes(view)?'relations':['recall','suggestions'].includes(view)?'recall':'formation',view,'original','months']),['formation','revisions','revisions','months'],['time','timeline','coverage','coverage'],['memories','grid','unknown-result','months'],['memories','grid','empty','months']]){
      const navigation=await send('Page.navigate',{url:origin+`/?lang=${language}&theme=${theme}&auto-dataset=${dataset}&auto-workspace=${workspace}&auto-view=${view}&auto-time-view=${time}`});if(navigation.errorText)throw Error(navigation.errorText);
      await until(()=>evaluate(`Boolean(document.querySelector('.am[data-view="${view}"]'))`));await evaluate('document.fonts.ready.then(()=>true)');
      const row=await evaluate(`(()=>{const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}};return {workspace:${JSON.stringify(workspace)},view:${JSON.stringify(view)},dataset:${JSON.stringify(dataset)},width:innerWidth,height:innerHeight,devicePixelRatio,language:document.documentElement.lang,theme:document.documentElement.dataset.theme,document:rect(document.documentElement),app:rect(document.querySelector('.bg-app')),header:rect(document.querySelector('.am-head')),main:rect(document.querySelector('.am-main')),inspector:rect(document.querySelector('.am-inspector')),nav:rect(document.querySelector('[data-runtime-nav="primary"]')),selected:document.querySelector('.am-i-title')?.textContent??null};})()`);
      writeFileSync(join(out,'report.partial.json'),JSON.stringify({rows:[...rows,row],pageErrors},null,2));
      if(row.document.scrollWidth>width||row.main.scrollWidth>row.main.clientWidth||width<900&&row.inspector&&row.inspector.scrollWidth>row.inspector.clientWidth||row.header.scrollWidth>row.header.clientWidth||row.main.height<=0||row.inspector&&row.inspector.right>width)throw Error('Unreachable layout '+JSON.stringify(row));
      if(width<900&&row.inspector){
        const links=await evaluate(`(()=>{const same=document.querySelector('.am-inspector');document.querySelector('.am-main .am-reading-jump').click();const inspectorFocused=document.activeElement===same,inspectorTop=same.getBoundingClientRect().top;document.querySelector('.am-inspector .am-reading-jump').click();return {inspectorFocused,inspectorTop,mainFocused:document.activeElement===document.querySelector('.am-main'),mainTop:document.querySelector('.am-main').getBoundingClientRect().top,scrolls:[...document.querySelectorAll('body,#root,.bg-app,.bg-body,#runtime-content,.memory-region,.am,.am-main,.am-inspector')].map(e=>({tag:e.id||e.className,top:e.scrollTop,height:e.scrollHeight,client:e.clientHeight}))};})()`);
        row.links=links;if(!links.inspectorFocused||!links.mainFocused||links.inspectorTop < -2||links.inspectorTop>height-40||links.mainTop < -2||links.mainTop>height-40)throw Error('Reading links lost focus '+JSON.stringify(links));
      }
      rows.push(row);console.log(JSON.stringify({view,width,mainHeight:row.main.height,mainWidth:row.main.width,headerHeight:row.header.height,documentWidth:row.document.scrollWidth,inspectorRight:row.inspector.right}));
      const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,`${view}-${dataset}-${width}-${language}-${theme}.png`),Buffer.from(shot.data,'base64'));
    }
  }
  if(process.argv.includes('--resize-only')){
    await send('Emulation.setDeviceMetricsOverride',{width:1100,height:700,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:origin+'/?lang=en&theme=light&auto-dataset=original&auto-workspace=memories&auto-view=grid'});
    await until(()=>evaluate(`Boolean(document.querySelector('[data-memory-filter="text"]'))`));
    await evaluate(`(()=>{document.querySelector('[data-grid-layout="list"]').click();const input=document.querySelector('[data-memory-filter="text"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'short');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await until(()=>evaluate(`document.querySelectorAll('[data-memory-record]').length===3`));
    await evaluate(`(()=>{document.querySelector('[data-memory-record="am_01"]').click();window.readingNodes={input:document.querySelector('[data-memory-filter="text"]'),inspector:document.querySelector('.am-inspector')};window.readingNodes.input.focus();})()`);
    for(const [width,height,ratio] of [[550,350,2],[720,450,2],[1100,700,1]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:ratio,mobile:false});
      const row=await evaluate(`(()=>{const input=document.querySelector('[data-memory-filter="text"]');return {action:'resize',width:innerWidth,layout:document.querySelector('.am-slips').dataset.layout,query:input.value,sameInput:input===readingNodes.input,sameInspector:document.querySelector('.am-inspector')===readingNodes.inspector,focus:document.activeElement===input,ids:[...document.querySelectorAll('[data-memory-record]')].map(e=>e.dataset.memoryRecord),selected:document.querySelector('[data-memory-record="am_01"]').getAttribute('aria-pressed'),mainColumns:getComputedStyle(document.querySelector('.am-body')).gridTemplateColumns,rootWidth:document.documentElement.scrollWidth};})()`);
      if(!row.sameInput||!row.sameInspector||!row.focus||row.query!=='short'||row.selected!=='true'||row.layout!=='list'||row.ids.join()!=='am_11,am_01,am_13'||row.rootWidth>width)throw Error('Resize lost state '+JSON.stringify(row));
      rows.push(row);console.log(JSON.stringify(row));
    }
  }
  writeFileSync(join(out,'report.json'),JSON.stringify({browser:version.Browser,scope:'Owned synthetic CSS-viewport diagnostic only. Half-size CSS viewport at DPR 2 approximates layout space at 200 percent; this does not operate browser zoom or Windows scaling.',rows,pageErrors,navigationTimings},null,2));
  if(pageErrors.length)throw Error('Page errors '+JSON.stringify(pageErrors));
} finally {
  writeFileSync(join(out,'startup-diagnostics.json'),JSON.stringify({pageErrors,networkEvents},null,2));
  if (ws?.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => undefined);
  ws?.close(); browser?.kill(); await server.close(); closeSync(log);
}
