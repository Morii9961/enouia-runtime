// Focused owned-browser layout diagnostics. Cold CDP startup has taken 52.7s on this host; commands are bounded to 60s, with no automatic retry.
// node e2e/recall-diagnostics.mjs <Edge executable> <directory under ./target>
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
  for(const [width,height,language,theme] of [[1100,700,'zh-Hans','dark'],[1100,700,'ja','light'],[1440,900,'en','light']]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    for(const dataset of ['original','unknown-result','held','source-missing','empty']){
      const navigation=await send('Page.navigate',{url:origin+`/?lang=${language}&theme=${theme}&auto-dataset=${dataset}&auto-workspace=recall&auto-view=suggestions`});if(navigation.errorText)throw Error(navigation.errorText);
      await until(()=>evaluate(`Boolean(document.querySelector('.am[data-view="suggestions"]'))`));await evaluate('document.fonts.ready.then(()=>true)');
      const snapshot=async action=>{
        const row=await evaluate(`(()=>{const main=document.querySelector('.am-main'),head=document.querySelector('.am-head');return {dataset:${JSON.stringify(dataset)},action:${JSON.stringify(action)},width:innerWidth,language:document.documentElement.lang,theme:document.documentElement.dataset.theme,
          overflow:document.documentElement.scrollWidth>innerWidth,mainOverflow:main.scrollWidth>main.clientWidth,headerOverflow:head.scrollWidth>head.clientWidth,
          case:document.querySelector('[data-recall-case]')?.dataset.recallCase??null,caseIndex:[...document.querySelectorAll('.am-cases button')].findIndex(b=>b.getAttribute('aria-pressed')==='true'),
          ids:[...document.querySelectorAll('[data-suggestion-memory]')].map(e=>e.dataset.suggestionMemory),reasons:[...document.querySelectorAll('[data-suggestion-reason]')].map(e=>e.textContent),
          disabled:[...document.querySelectorAll('.am-suggestion-card .am-opt')].every(e=>e.disabled),controls:document.querySelectorAll('.am-suggestion-card .am-opt').length,
          current:document.querySelector('.am-statement')?.textContent??null,pipeline:!!document.querySelector('.am-steps'),
          unknownKey:document.querySelector('.am-unknown-result code')?.textContent??null,unknownPacket:document.querySelector('.am-unknown-result pre')?.textContent??null};})()`);
        if(row.overflow||row.mainOverflow||row.headerOverflow||!row.disabled)throw Error('Invalid card layout '+JSON.stringify(row));
        if(dataset==='unknown-result'&&(row.unknownKey!=='demo-only-unknown-0001'||!row.unknownPacket?.includes('Result: unknown')))throw Error('Unknown packet changed');rows.push(row);console.log(JSON.stringify(row));return row;
      };
      if(dataset==='original'||dataset==='unknown-result'){
        for(const [index,ids] of [['am_05','am_07','am_01','am_06','am_10','am_11','am_14'],['am_03','am_01','am_04','am_08','am_13']].entries()){
          await evaluate(`document.querySelectorAll('.am-cases button')[${index}].click()`);await until(()=>evaluate(`document.querySelector('[data-recall-case]')?.dataset.recallCase==='rc_${index+1}'`));
          const row=await snapshot('cards-'+index);if(row.ids.join()!==ids.join()||row.controls!==ids.length*2||row.reasons.length!==ids.length)throw Error('Wrong case membership');
          await evaluate(`document.querySelector('[data-suggestion-memory="${ids.at(-1)}"] .am-ref').click()`);await until(()=>evaluate(`document.querySelector('[data-suggestion-memory="${ids.at(-1)}"] .am-ref').getAttribute('aria-pressed')==='true'`));
          const chosen=await evaluate(`document.querySelector('.am-statement').textContent`);
          await evaluate(`document.querySelector('.am-suggestions').scrollIntoView({block:'start'})`);
          const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,`${dataset}-case${index+1}-${width}-${language}-${theme}.png`),Buffer.from(shot.data,'base64'));
          await evaluate(`document.querySelector('[data-auto-view="recall"]').click()`);await until(()=>evaluate(`Boolean(document.querySelector('.am-steps'))`));
          const pipeline=await snapshot('pipeline-'+index);if(!pipeline.pipeline||pipeline.caseIndex!==index||pipeline.current!==chosen)throw Error('Pipeline lost case or Inspector');
          await evaluate(`document.querySelector('[data-auto-view="suggestions"]').click()`);await until(()=>evaluate(`Boolean(document.querySelector('[data-recall-case]'))`));
          const back=await snapshot('return-'+index);if(back.ids.join()!==ids.join()||back.caseIndex!==index||back.current!==chosen)throw Error('Cards lost case or Inspector');
        }
      }else{
        const row=await snapshot('no-case');if(row.ids.length||row.case)throw Error('Invented incomplete recall');
        const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,`${dataset}-${width}-${language}-${theme}.png`),Buffer.from(shot.data,'base64'));
      }
    }
  }
  writeFileSync(join(out,'report.json'),JSON.stringify({browser:version.Browser,scope:'Owned synthetic browser/profile only. No live suggestion feed, native or human acceptance.',rows,pageErrors,navigationTimings},null,2));
  if(pageErrors.length)throw Error('Page errors '+JSON.stringify(pageErrors));
} finally {
  writeFileSync(join(out,'startup-diagnostics.json'),JSON.stringify({pageErrors,networkEvents},null,2));
  if (ws?.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => undefined);
  ws?.close(); browser?.kill(); await server.close(); closeSync(log);
}
