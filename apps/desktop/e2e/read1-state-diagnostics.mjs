// Focused owned-browser layout diagnostics. Cold CDP startup has taken 52.7s on this host; commands are bounded to 60s, with no automatic retry.
// node e2e/read1-state-diagnostics.mjs <Edge executable> <directory under ./target>
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
  await server.environments.client.warmupRequest('/e2e/read1-state-preview.tsx');
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
  const initial = await send('Page.navigate', {url: origin + '/e2e/read1-state-preview.html?state=initial'});
  if (initial.errorText) throw Error(initial.errorText);
  await until(()=>evaluate(`document.documentElement.dataset.fixtureReady==='true'`));
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });





  const rows=[];
  await send('Emulation.setDeviceMetricsOverride',{width:1100,height:700,deviceScaleFactor:1,mobile:false});
  const states=process.argv.includes('--pending-only')?['page-pending','open']:['initial','page-pending','page-error','status-error','open','locked','disabled','failed'];
  for(const language of ['en','zh-Hans','ja'])for(const theme of ['dark','light'])for(const state of states){
    await evaluate(`localStorage.setItem('enouia.lang',${JSON.stringify(language)})`);
    await send('Page.navigate',{url:origin+`/e2e/read1-state-preview.html?theme=${theme}&state=${state}`});
    await until(()=>evaluate(`document.documentElement.dataset.fixtureReady==='true'`));await evaluate('document.fonts.ready.then(()=>true)');
    const snapshot=async action=>{
      const row=await evaluate(`(()=>{const w=document.querySelector('[data-fixture-watermark]'),b=w.getBoundingClientRect(),p=document.querySelector('.qr45');return {action:${JSON.stringify(action)},state:${JSON.stringify(state)},language:document.documentElement.lang,theme:document.documentElement.dataset.theme,watermarkVisible:b.left>=0&&b.top>=0&&b.right<=innerWidth&&b.bottom<=innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,busy:p.getAttribute('aria-busy'),items:[...document.querySelectorAll('.mem-list li')].map(e=>e.querySelector('button').textContent),alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent),statuses:[...p.querySelectorAll('[role=status]')].map(e=>e.textContent),body:p.textContent,inspector:document.querySelector('.qr88').textContent,query:document.querySelector('input')?.value??null,readCalls:read1FixtureCalls.map(c=>c.operation),hostActions:Number(document.documentElement.dataset.fixtureHostActions)};})()`);
      if(!row.watermarkVisible||row.overflow||row.hostActions||row.items.length!==(state==='open'?1:0)||row.alerts.length!==(['page-error','status-error'].includes(state)?1:0)||row.busy!==(state==='page-pending'?'true':'false'))throw Error('Invalid read-1 state '+JSON.stringify(row));
      const feedback={en:{pending:'Reading…',unknown:'Library state is unknown.',initial:'Reading library state…'},'zh-Hans':{pending:'正在读取…',unknown:'库状态未知。',initial:'正在读取库状态…'},ja:{pending:'読み込み中…',unknown:'ライブラリの状態は不明です。',initial:'ライブラリの状態を読み込み中…'}}[row.language];
      if(state==='status-error'&&(!row.statuses.includes(feedback.unknown)||row.statuses.includes(feedback.initial))||state==='initial'&&!row.statuses.includes(feedback.initial))throw Error('Wrong read-1 feedback');
      if(state==='page-pending'&&!row.statuses.includes(feedback.pending)||state==='open'&&row.statuses.includes(feedback.pending))throw Error('Wrong pending read-1 feedback');
      if(!row.readCalls.every(x=>['status','page'].includes(x)))throw Error('Unexpected read-1 operation');
      rows.push(row);return row;
    };
    const initial=await snapshot('initial');if(initial.language!==language)throw Error('Wrong initial language');
    const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,`${state}-${language}-${theme}.png`),Buffer.from(shot.data,'base64'));
    if(['open','page-pending','status-error','page-error'].includes(state)){
      await evaluate(`(()=>{window.fixtureInput=document.querySelector('input');window.fixtureRow=document.querySelector('.mem-list li');if(fixtureInput){fixtureInput.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(fixtureInput,'literal cue — 中文と日本語');fixtureInput.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
      if(state==='open')await until(()=>evaluate(`document.querySelector('input').value==='literal cue — 中文と日本語'`));
      const reads=initial.readCalls.filter(x=>x==='page').length;
      for(const next of ['zh-Hans','ja','en']){
        await evaluate(`(()=>{localStorage.setItem('enouia.lang',${JSON.stringify(next)});window.dispatchEvent(new StorageEvent('storage',{key:'enouia.lang',newValue:${JSON.stringify(next)},storageArea:localStorage}));})()`);await until(()=>evaluate(`document.documentElement.lang==='${next}'`));
        const row=await snapshot('language');
        const retained=await evaluate(`document.querySelector('input')===fixtureInput&&(!fixtureInput||document.activeElement===fixtureInput)&&document.querySelector('.mem-list li')===fixtureRow`);
        if(!retained||state==='open'&&row.query!=='literal cue — 中文と日本語'||JSON.stringify(row.items)!==JSON.stringify(initial.items)||row.readCalls.filter(x=>x==='page').length!==reads)throw Error('Language lost state or replayed read-1 page');
      }
    }
    console.log(JSON.stringify({state,language,theme,rows:rows.length}));
  }
  writeFileSync(join(out,'report.json'),JSON.stringify({browser:version.Browser,scope:'Fictional read-1 state fixture only; all transport mocked. Only status/page, no original source/detail/simulation requests, no real Vault or Provider.',rows,pageErrors,navigationTimings},null,2));
  if(pageErrors.length)throw Error('Page errors '+JSON.stringify(pageErrors));
} finally {
  writeFileSync(join(out,'startup-diagnostics.json'),JSON.stringify({pageErrors,networkEvents},null,2));
  if (ws?.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => undefined);
  ws?.close(); browser?.kill(); await server.close(); closeSync(log);
}
