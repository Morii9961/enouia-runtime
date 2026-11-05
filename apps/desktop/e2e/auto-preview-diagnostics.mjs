// Focused browser-only automatic-memory state/layout diagnostics.
// node e2e/auto-preview-diagnostics.mjs <Edge executable> <directory under ./target>
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
  await send('Runtime.enable');
  await send('Network.enable');
  const response=await fetch(origin+'/');console.log(JSON.stringify({origin,httpStatus:response.status,htmlBytes:(await response.text()).length}));
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1.5, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const rows=[];
  const workspaceMode=process.argv.includes('--workspaces');
  for(const [width,height,language,theme] of [[1100,700,'zh-Hans','dark'],[1440,900,'ja','light']]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    for(const item of (workspaceMode ? ['memories','time','relations','formation','recall','vault'] : ['empty','held','open-ended','source-missing','unknown-result','read-only'])){
      const only=process.argv.find(arg=>arg.startsWith('--only='))?.slice('--only='.length);
      if(only&&item!==only)continue;
      const dataset=workspaceMode?'original':item;
      const workspace=workspaceMode?(item==='vault'?'memories':item):'time';
      const navigation=await send('Page.navigate',{url:origin+`/?lang=${language}&theme=${theme}&auto-dataset=${dataset}`});
      console.log(JSON.stringify({navigation}));
      if(navigation.errorText)throw Error('Navigation refused: '+navigation.errorText);
      await until(()=>evaluate(`Boolean(document.querySelector('[data-runtime-page="memory"]'))`));
      await evaluate(`document.querySelector('[data-runtime-page="memory"]').click()`);
      await until(()=>evaluate(`Boolean(document.querySelector('[data-memory-workspace="time"]'))`));
      await evaluate(`document.querySelector('[data-memory-workspace="${workspace}"]').click()`);
      if(item==='vault') {
        await until(()=>evaluate(`Boolean(document.querySelector('[data-memory-view="vault"]'))`));
        await evaluate(`document.querySelector('[data-memory-view="vault"]').click()`);
        await until(()=>evaluate(`Boolean(document.querySelector('.qr89'))`));
      } else {
        await until(()=>evaluate(`Boolean(document.querySelector('.am-head'))`));
        // Follow the real reload link, keeping the selected workspace and dataset.
        await evaluate(`document.querySelector('.am-demo-states a[aria-current="true"]').click()`);
        await until(()=>evaluate(`document.querySelector('[data-memory-workspace="${workspace}"]')?.getAttribute('aria-current')==='page'&&Boolean(document.querySelector('.am-head'))`));
      }
      await evaluate(`document.querySelector('.am-unknown-result')?.setAttribute('open','')`);
      await evaluate('document.fonts.ready.then(()=>true)');
      const row=await evaluate(`(()=>{
        const head=document.querySelector('.am-head');
        return {workspaces:document.querySelectorAll('[data-memory-workspace]').length,oldEntry:!!document.querySelector('.am-entry'),workspace:document.querySelector('[data-memory-workspace][aria-current="page"]')?.getAttribute('data-memory-workspace'),width:innerWidth,height:innerHeight,language:document.documentElement.lang,theme:document.documentElement.dataset.theme,
          dataset:${JSON.stringify(dataset)},item:${JSON.stringify(item)},documentOverflow:document.documentElement.scrollWidth>innerWidth,
          headerOverflow:head?head.scrollWidth>head.clientWidth:false,openEnd:!!document.querySelector('.am-mk[data-open], [data-month-record][data-open]'),
          memoryTitle:document.querySelector('.am-i-title')?.textContent??null,generatedMap:!!document.querySelector('.sm-canvas'),falseOpenEndLag:!!document.querySelector('.am-mk[data-open], [data-month-record][data-open]')&&!!document.querySelector('.am-lag'),unknownKey:document.querySelector('.am-unknown-result code')?.textContent??null};
      })()`);
      if(row.workspaces!==5||row.oldEntry||row.workspace!==workspace||row.falseOpenEndLag||row.documentOverflow||row.headerOverflow||row.generatedMap||(!workspaceMode&&((dataset==='empty'?row.memoryTitle!==null:row.memoryTitle===null)||(dataset==='open-ended'&&!row.openEnd))))throw Error('Invalid preview '+JSON.stringify(row));
      rows.push(row);console.log(JSON.stringify(row));
      const shot=await send('Page.captureScreenshot',{format:'png'});
      writeFileSync(join(out,`${item}-${width}-${language}-${theme}.png`),Buffer.from(shot.data,'base64'));
    }
  }
  writeFileSync(join(out,'report.json'),JSON.stringify({browser:version.Browser,scope:'Owned headless browser/profile, browser-only fictional preview. Not native or human acceptance.',rows},null,2));
} finally {
  writeFileSync(join(out,'startup-diagnostics.json'),JSON.stringify({pageErrors,networkEvents},null,2));
  if (ws?.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => undefined);
  ws?.close(); browser?.kill(); await server.close(); closeSync(log);
}
