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
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) { const result = await test(); if (result) return result; await sleep(100); }
  throw Error('Diagnostic setup timed out');
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
    if (!waiter) return;
    pending.delete(packet.id); clearTimeout(waiter.timer);
    if (packet.error) waiter.reject(Error(packet.error.message)); else waiter.resolve(packet.result);
  };
  ws.onclose = () => {
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(Error('Owned browser closed')); }
    pending.clear();
  };
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1.5, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const rows=[];
  for(const [width,height,language,theme] of [[1100,700,'zh-Hans','dark'],[1440,900,'ja','light']]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    for(const dataset of ['empty','held','open-ended','source-missing','unknown-result','read-only']){
      await send('Page.navigate',{url:origin+`/?lang=${language}&theme=${theme}&auto-dataset=${dataset}`});
      await until(()=>evaluate(`Boolean(document.querySelector('[data-runtime-page="memory"]'))`));
      await evaluate(`document.querySelector('[data-runtime-page="memory"]').click()`);
      await until(()=>evaluate(`Boolean(document.querySelector('.am-entry'))`));
      await evaluate(`document.querySelector('.am-entry').click()`);
      await until(()=>evaluate(`Boolean(document.querySelector('[data-auto-view="timeline"]'))`));
      await evaluate(`document.querySelector('[data-auto-view="timeline"]').click()`);
      await until(()=>evaluate(`document.querySelector('.am')?.dataset.view==='timeline'`));
      await evaluate(`document.querySelector('.am-unknown-result')?.setAttribute('open','')`);
      await evaluate('document.fonts.ready.then(()=>true)');
      const row=await evaluate(`(()=>{
        const head=document.querySelector('.am-head');
        return {width:innerWidth,height:innerHeight,language:document.documentElement.lang,theme:document.documentElement.dataset.theme,
          dataset:${JSON.stringify(dataset)},documentOverflow:document.documentElement.scrollWidth>innerWidth,
          headerOverflow:head.scrollWidth>head.clientWidth,openEnd:!!document.querySelector('.am-mk[data-open]'),
          memoryTitle:document.querySelector('.am-i-title')?.textContent??null,generatedMap:!!document.querySelector('.sm-canvas'),falseOpenEndLag:!!document.querySelector('.am-mk[data-open]')&&!!document.querySelector('.am-lag'),unknownKey:document.querySelector('.am-unknown-result code')?.textContent??null};
      })()`);
      if(row.falseOpenEndLag||row.documentOverflow||row.headerOverflow||row.generatedMap||(dataset==='empty'?row.memoryTitle!==null:row.memoryTitle===null)||(dataset==='open-ended'&&!row.openEnd))throw Error('Invalid preview '+JSON.stringify(row));
      rows.push(row);console.log(JSON.stringify(row));
      const shot=await send('Page.captureScreenshot',{format:'png'});
      writeFileSync(join(out,`${dataset}-${width}-${language}-${theme}.png`),Buffer.from(shot.data,'base64'));
    }
  }
  writeFileSync(join(out,'report.json'),JSON.stringify({browser:version.Browser,scope:'Owned headless browser/profile, browser-only fictional preview. Not native or human acceptance.',rows},null,2));
} finally {
  if (ws?.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => undefined);
  ws?.close(); browser?.kill(); await server.close(); closeSync(log);
}
