// Focused owned-browser layout diagnostics. Cold CDP startup has taken 52.7s on this host; commands are bounded to 60s, with no automatic retry.
// node e2e/timeline-scale-diagnostics.mjs <Edge executable> <directory under ./target>
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
  for(const [width,height,language,theme,ratio] of [[1100,700,'zh-Hans','dark',1],[1100,700,'ja','light',1],[1440,900,'en','light',1],[550,350,'zh-Hans','dark',2]].filter(([w])=>!process.argv.includes('--labels-only')||w!==1440)){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:ratio,mobile:false});
    for(const dataset of (process.argv.includes('--labels-only')?['original','open-ended']:['original','open-ended','coverage','unknown-result'])){
      await send('Page.navigate',{url:origin+`/?lang=${language}&theme=${theme}&auto-dataset=${dataset}&auto-workspace=time&auto-view=timeline`});await until(()=>evaluate(`Boolean(document.querySelector('[data-time-view="lanes"]'))`));
      await evaluate(`document.querySelector('[data-time-view="lanes"]').click()`);await until(()=>evaluate(`Boolean(document.querySelector('[data-time-scale="day"]'))`));await evaluate('document.fonts.ready.then(()=>true)');
      const selected=await evaluate(`document.querySelector('.am-statement').textContent`);
      for(const scale of (process.argv.includes('--labels-only')?['day','month']:['day','week','month','six-weeks'])){
        await evaluate(`document.querySelector('[data-time-scale="${scale}"]').click()`);await until(()=>evaluate(`document.querySelector('[data-time-scale="${scale}"]').getAttribute('aria-pressed')==='true'`));
        if(scale==='day'){
          await evaluate(`document.querySelector('.tm-map').scrollIntoView({block:'center'})`);
          const date=dataset==='open-ended'?'2026-09-01':dataset==='coverage'?'2026-10-03':'2026-10-01';
          const fraction=(Date.parse(date+'T00:00:00+08:00')+43200000-Date.parse('2026-07-01T00:00:00+08:00'))/(123*86400000);
          const point=await evaluate(`(()=>{const r=document.querySelector('.tm-map').getBoundingClientRect();return {x:r.left+r.width*${fraction},y:r.top+r.height/2};})()`);
          await send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
        }
        await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
        const row=await evaluate(`(()=>{const h=document.querySelector('.am-head'),m=document.querySelector('.am-main');return {dataset:${JSON.stringify(dataset)},scale:${JSON.stringify(scale)},width:innerWidth,language:document.documentElement.lang,theme:document.documentElement.dataset.theme,overflow:document.documentElement.scrollWidth>innerWidth,mainOverflow:m.scrollWidth>m.clientWidth,headerOverflow:h.scrollWidth>h.clientWidth,paperWidth:parseFloat(document.querySelector('.am-pan').style.width),mapFrame:document.querySelector('.tm-frame').style.width,mapText:document.querySelector('.tm-map').getAttribute('aria-valuetext'),clockTicks:[...document.querySelectorAll('[data-clock-tick]')].map(e=>e.textContent),selected:document.querySelector('.am-statement').textContent,openMarkers:document.querySelectorAll('.am-mk[data-open]').length,unknown:document.querySelectorAll('.am-unknown .am-ref').length,unknownPacket:document.querySelector('.am-unknown-result pre')?.textContent??null,unknownKey:document.querySelector('.am-unknown-result code')?.textContent??null,labelOverflow:[...document.querySelectorAll('.am-lane-label')].some(e=>e.scrollHeight>e.clientHeight),firstClockVisible:(()=>{const e=document.querySelector('[data-clock-tick]');if(!e)return null;const r=e.getBoundingClientRect(),c=document.querySelector('.am-tl-col').getBoundingClientRect();return r.left>=c.left-1&&r.right<=c.right+1;})()};})()`);
        if(row.labelOverflow||row.firstClockVisible===false||row.overflow||row.mainOverflow||row.headerOverflow||row.selected!==selected||scale==='day'&&row.clockTicks.join()!=='00:00,06:00,12:00,18:00'||scale==='day'&&row.paperWidth<12000||scale==='week'&&(row.paperWidth<1700||row.paperWidth>1800)||scale==='six-weeks'&&(row.paperWidth<290||row.paperWidth>295)||dataset==='open-ended'&&!row.openMarkers||dataset==='unknown-result'&&(row.unknownKey!=='demo-only-unknown-0001'||!row.unknownPacket?.includes('Result: unknown')))throw Error('Invalid scale '+JSON.stringify(row));
        rows.push(row);console.log(JSON.stringify({dataset,scale,width,paperWidth:row.paperWidth,mapText:row.mapText}));
        await evaluate(`document.querySelector('.am-timeline').scrollIntoView({block:'start'})`);
        const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,`${dataset}-${scale}-${width}-${language}-${theme}.png`),Buffer.from(shot.data,'base64'));
      }
    }
  }
  writeFileSync(join(out,'report.json'),JSON.stringify({browser:version.Browser,scope:'Owned synthetic Timeline scale only. No native projection or backend writes. Narrow CSS viewport is layout-space evidence only.',rows,pageErrors,navigationTimings},null,2));
  if(pageErrors.length)throw Error('Page errors '+JSON.stringify(pageErrors));
} finally {
  writeFileSync(join(out,'startup-diagnostics.json'),JSON.stringify({pageErrors,networkEvents},null,2));
  if (ws?.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => undefined);
  ws?.close(); browser?.kill(); await server.close(); closeSync(log);
}
