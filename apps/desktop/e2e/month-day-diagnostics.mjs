// Focused owned-browser layout diagnostics. Cold CDP startup has taken 52.7s on this host; commands are bounded to 60s, with no automatic retry.
// node e2e/month-day-diagnostics.mjs <Edge executable> <directory under ./target>
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
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 60000);
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
    for(const dataset of ['original','held','open-ended','empty']) {
      const navigation = await send('Page.navigate',{url:origin+`/?lang=${language}&theme=${theme}&auto-dataset=${dataset}&auto-workspace=time`});
      if (navigation.errorText) throw Error(navigation.errorText);
      await until(()=>evaluate(`Boolean(document.querySelector('.am-head'))`));
      await evaluate('document.fonts.ready.then(()=>true)');
      if(dataset!=='empty') {
        await until(()=>evaluate(`Boolean(document.querySelector('[data-shown-month]'))`));
        await evaluate(`document.querySelector('[data-month="2026-09"]').click()`);
        if(dataset==='original') {
          await until(()=>evaluate(`Boolean(document.querySelector('[data-day="2026-09-29"]'))`));
          await evaluate(`document.querySelector('[data-day="2026-09-29"] summary').click()`);
          await until(()=>evaluate(`document.querySelector('[data-day="2026-09-29"]').open`));
          await evaluate(`document.querySelector('[data-month-record="am_01"]').click()`);
        }
      }
      const row=await evaluate(`(()=>{const paper=document.querySelector('.am-month-paper');return {
        dataset:${JSON.stringify(dataset)},width:innerWidth,language:document.documentElement.lang,theme:document.documentElement.dataset.theme,
        month:paper?.dataset.shownMonth??null,overflow:document.documentElement.scrollWidth>innerWidth,
        paperOverflow:paper?paper.scrollWidth>paper.clientWidth:false,dayOpen:document.querySelector('[data-day="2026-09-29"]')?.open??null,
        title:document.querySelector('.am-i-title')?.textContent??null,openEnd:!!document.querySelector('[data-month-record][data-open]'),
        falseDay:!!document.querySelector('.am-month-day [data-precision="month"],.am-month-day [data-precision="range"],.am-month-paper [data-precision="unknown"]'),
        falseNaN:document.body.textContent.includes('NaN'),map:document.querySelector('.tm-map')?.getAttribute('aria-valuetext')??null};})()`);
      if(row.overflow||row.paperOverflow||row.falseDay||row.falseNaN||dataset==='original'&&(!row.dayOpen||row.title!=='Short answers')||dataset==='open-ended'&&!row.openEnd||dataset==='empty'&&(row.title!==null||row.month!==null))throw Error('Invalid month layout '+JSON.stringify(row));
      rows.push(row);console.log(JSON.stringify(row));
      const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,`${dataset}-${width}-${language}-${theme}.png`),Buffer.from(shot.data,'base64'));
      if(dataset==='original') {
        await evaluate(`document.querySelector('.tm-map').focus();document.querySelector('.tm-map').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))`);
        await until(()=>evaluate(`Boolean(document.querySelector('[data-shown-month="2026-10"]'))`));
        const kept=await evaluate(`document.querySelector('.am-i-title').textContent==='Short answers'&&document.querySelector('.tm-map').getAttribute('aria-valuetext')`);
        if(!kept)throw Error('Map did not keep selection');rows.push({width,language,action:'map-arrow-next-month',readout:kept});
      }
    }
  }
  writeFileSync(join(out,'report.json'),JSON.stringify({browser:version.Browser,scope:'Owned synthetic browser/profile only. No native or human acceptance.',rows,pageErrors},null,2));
  if(pageErrors.length)throw Error('Page errors '+JSON.stringify(pageErrors));
} finally {
  writeFileSync(join(out,'startup-diagnostics.json'),JSON.stringify({pageErrors,networkEvents},null,2));
  if (ws?.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => undefined);
  ws?.close(); browser?.kill(); await server.close(); closeSync(log);
}
