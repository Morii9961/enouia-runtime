// Focused owned-browser layout diagnostics. Cold CDP startup has taken 52.7s on this host; commands are bounded to 60s, with no automatic retry.
// node e2e/inspector-settings-reflow-diagnostics.mjs <Edge executable> <directory under ./target>
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
  for(const [width,height,language,theme,ratio] of [[1100,700,'en','light',1],[550,350,'en','light',2],[550,350,'zh-Hans','dark',2],[720,450,'ja','light',2]].filter(()=>!process.argv.includes('--details-only'))){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:ratio,mobile:false});
    await send('Page.navigate',{url:origin+`/?lang=${language}&theme=${theme}&vault-dataset=original`});await until(()=>evaluate(`Boolean(document.querySelector('.qr89'))`));
    for(const page of ['runtime','settings']){
      await evaluate(`document.querySelector('[data-runtime-page="${page}"]').click()`);await until(()=>evaluate(`Boolean(document.querySelector('${page==='runtime'?'.qr210':'.qr187'}'))`));await evaluate('document.fonts.ready.then(()=>true)');
      const row=await evaluate(`(()=>{const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,width:r.width,height:r.height,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}};return {page:${JSON.stringify(page)},width:innerWidth,height:innerHeight,language:document.documentElement.lang,theme:document.documentElement.dataset.theme,document:box(document.documentElement),surface:box(document.querySelector('${page==='runtime'?'.qr210':'.qr187'}')),reader:box(document.querySelector('${page==='runtime'?'.qr209':'.qr219'}')),title:document.querySelector('.qr194')?.textContent??null};})()`);
      rows.push(row);console.log(JSON.stringify({page,width,documentWidth:row.document.scrollWidth,readerRight:row.reader.right}));
      if(!process.argv.includes('--observe')&&(row.document.scrollWidth>width||row.reader.right>width||width<900&&row.reader.scrollWidth>row.reader.clientWidth))throw Error('Clipped surface '+JSON.stringify(row));
      const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,`${page}-${width}-${language}-${theme}.png`),Buffer.from(shot.data,'base64'));
    }
  }
  if(process.argv.includes('--details-only')){
    for(const [width,height,language,theme] of [[550,350,'en','light'],[550,350,'zh-Hans','dark'],[720,450,'ja','light']]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:false});
      await send('Page.navigate',{url:origin+`/?lang=${language}&theme=${theme}&vault-dataset=original`});await until(()=>evaluate(`Boolean(document.querySelector('.qr89'))`));
      await evaluate(`document.querySelector('[data-runtime-page="runtime"]').click()`);await until(()=>evaluate(`Boolean(document.querySelector('#runtime-reading'))`));
      const count=await evaluate(`document.querySelectorAll('.qr190').length`);
      for(let index=0;index<count;index++){
        await evaluate(`document.querySelectorAll('.qr190')[${index}].click()`);await until(()=>evaluate(`document.querySelectorAll('.qr190')[${index}].dataset.selected==='true'`));
        const row=await evaluate(`(()=>{const r=document.querySelector('#runtime-reading'),b=r.getBoundingClientRect();return {action:'component',index:${index},width:innerWidth,language:document.documentElement.lang,focused:document.activeElement===r,top:b.top,title:document.querySelector('.qr194').textContent,selected:document.querySelectorAll('.qr190')[${index}].querySelector('.qr188').textContent,overflow:r.scrollWidth>r.clientWidth};})()`);
        if(!row.focused||row.top < -2||row.top>height-40||row.title!==row.selected||row.overflow)throw Error('Unreachable component '+JSON.stringify(row));rows.push(row);
        const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,`component-${index}-${width}-${language}.png`),Buffer.from(shot.data,'base64'));
        await evaluate(`document.querySelector('#runtime-reading .reader-return').click()`);
      }
      await evaluate(`document.querySelector('[data-runtime-page="settings"]').click()`);await until(()=>evaluate(`Boolean(document.querySelector('.font-settings'))`));
      await evaluate(`document.querySelector('.font-settings summary').click()`);await until(()=>evaluate(`Boolean(document.querySelector('.font-licences'))`));
      await evaluate(`(()=>{document.querySelector('.font-licences details summary').click();document.querySelector('.font-settings').scrollIntoView({block:'start'});})()`);await evaluate('document.fonts.ready.then(()=>true)');
      const row=await evaluate(`(()=>{const e=document.querySelector('.font-settings'),p=e.querySelector('.font-licences pre'),b=e.getBoundingClientRect();return {action:'font-licences',width:innerWidth,language:document.documentElement.lang,open:e.open,licenceOpen:e.querySelector('.font-licences details').open,right:b.right,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,licenceScrollWidth:p.scrollWidth,licenceClientWidth:p.clientWidth,bodySelection:[...e.querySelectorAll('[aria-pressed="true"]')].map(e=>e.textContent)};})()`);
      if(!row.open||!row.licenceOpen||row.right>width||row.scrollWidth>row.clientWidth||row.licenceScrollWidth>row.licenceClientWidth)throw Error('Clipped font reading '+JSON.stringify(row));rows.push(row);
      const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,`font-licences-${width}-${language}.png`),Buffer.from(shot.data,'base64'));
    }
  }
  writeFileSync(join(out,'report.json'),JSON.stringify({browser:version.Browser,scope:'Owned synthetic Runtime/Settings CSS-layout evidence only; no native observations, font installation or Windows settings.',rows,pageErrors,navigationTimings},null,2));
  if(pageErrors.length)throw Error('Page errors '+JSON.stringify(pageErrors));
} finally {
  writeFileSync(join(out,'startup-diagnostics.json'),JSON.stringify({pageErrors,networkEvents},null,2));
  if (ws?.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => undefined);
  ws?.close(); browser?.kill(); await server.close(); closeSync(log);
}
