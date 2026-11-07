// Focused owned-browser layout diagnostics. Cold CDP startup has taken 52.7s on this host; commands are bounded to 60s, with no automatic retry.
// node e2e/vault-reflow-diagnostics.mjs <Edge executable> <directory under ./target>
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
  const draftText = 'Owned invented draft.\nRaw second line.';
  for(const [width,height,language,theme,ratio] of [[1100,700,'en','light',1],[550,350,'en','light',2],[550,350,'zh-Hans','dark',2],[720,450,'ja','light',2]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:ratio,mobile:false});
    for(const dataset of ['original','empty','candidates']){
      await send('Page.navigate',{url:origin+`/?lang=${language}&theme=${theme}&vault-dataset=${dataset}`});
      await until(()=>evaluate(`Boolean(document.querySelector('.qr89'))`));await evaluate('document.fonts.ready.then(()=>true)');
      if(dataset==='candidates'){await evaluate(`document.querySelector('.qr26').click()`);await until(()=>evaluate(`document.querySelectorAll('.qr43').length===2`));}
      const row=await evaluate(`(()=>{const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,width:r.width,height:r.height,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}};return {dataset:${JSON.stringify(dataset)},width:innerWidth,height:innerHeight,language:document.documentElement.lang,theme:document.documentElement.dataset.theme,document:box(document.documentElement),nav:box(document.querySelector('.memory-workspace-nav')),collections:box(document.querySelector('.qr28')),list:box(document.querySelector('.qr45')),inspector:box(document.querySelector('.qr88')),records:document.querySelectorAll('.qr43').length,statement:document.querySelector('.qr52')?.textContent??null};})()`);
      if(!process.argv.includes('--observe')&&(row.document.scrollWidth>width||row.inspector.right>width||width<900&&[row.collections,row.list,row.inspector,row.nav].some(b=>b.scrollWidth>b.clientWidth)))throw Error('Vault layout clipped '+JSON.stringify(row));
      rows.push(row);console.log(JSON.stringify({dataset,width,documentWidth:row.document.scrollWidth,inspectorRight:row.inspector.right,records:row.records}));
      if(!process.argv.includes('--observe')&&width<900){
        for(const target of ['vault-collections','vault-list','vault-inspector']){
          const focus=await evaluate(`(()=>{document.querySelector('.vault-reading-nav a[href="#${target}"]').click();const e=document.getElementById('${target}');return {action:'focus',dataset:${JSON.stringify(dataset)},width:innerWidth,language:document.documentElement.lang,target:${JSON.stringify(target)},focused:document.activeElement===e,top:e.getBoundingClientRect().top};})()`);
          if(!focus.focused||focus.top < -2||focus.top>height-40)throw Error('Section opening not reachable '+JSON.stringify(focus));rows.push(focus);
        }
        const inspectorShot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,`inspector-${dataset}-${width}-${language}-${theme}.png`),Buffer.from(inspectorShot.data,'base64'));
      }
      if(!process.argv.includes('--observe')&&dataset!=='empty'){
        const identity=await evaluate(`document.querySelector('.qr51').textContent`);
        await evaluate(`document.querySelector('.qr82').click()`);await until(()=>evaluate(`Boolean(document.querySelector('.qr53'))`));
        await evaluate(`(()=>{const field=document.querySelector('.qr53');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,${JSON.stringify(draftText)});field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();field.scrollIntoView({block:'start'});})()`);
        const draft=await evaluate(`(()=>{const field=document.querySelector('.qr53'),r=field.getBoundingClientRect();return {action:'draft',dataset:${JSON.stringify(dataset)},width:innerWidth,language:document.documentElement.lang,value:field.value,identity:document.querySelector('.qr51').textContent,focused:document.activeElement===field,left:r.left,right:r.right,save:!!document.querySelector('.qr83')};})()`);
        if(!draft.focused||draft.identity!==identity||draft.value!==draftText||!draft.save||width<900&&(draft.right>width||draft.left<0))throw Error('Draft lost or clipped '+JSON.stringify(draft));rows.push(draft);
        const draftShot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,`draft-${dataset}-${width}-${language}-${theme}.png`),Buffer.from(draftShot.data,'base64'));
        await evaluate(`document.querySelector('.qr84').click()`);await until(()=>evaluate(`Boolean(document.querySelector('.qr52'))`));
        if(await evaluate(`document.querySelector('.qr52').textContent`)!==row.statement||await evaluate(`document.querySelector('.qr51').textContent`)!==identity)throw Error('Reading changed original record');
      }
      const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,`${dataset}-${width}-${language}-${theme}.png`),Buffer.from(shot.data,'base64'));
    }
  }
  writeFileSync(join(out,'report.json'),JSON.stringify({browser:version.Browser,scope:'Fictional legacy Vault, owned profile. CSS layout-space diagnostic, not actual browser/Windows zoom or native acceptance.',rows,pageErrors,navigationTimings},null,2));
  if(pageErrors.length)throw Error('Page errors '+JSON.stringify(pageErrors));
} finally {
  writeFileSync(join(out,'startup-diagnostics.json'),JSON.stringify({pageErrors,networkEvents},null,2));
  if (ws?.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => undefined);
  ws?.close(); browser?.kill(); await server.close(); closeSync(log);
}
