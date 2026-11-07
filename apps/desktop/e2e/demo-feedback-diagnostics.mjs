// Focused fictional Vault feedback layout; mocked clipboard, owned profile only.
// node e2e/demo-feedback-diagnostics.mjs <Edge executable> <directory under ./target>
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
  const response=await fetch(origin+'/');if(response.status!==200)throw Error('Owned Vite entry unavailable');
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{window.__demoCopies=(window.__demoCopies??0)+1;throw Error('Synthetic clipboard refusal');}}});window.__demoClipboardReady=true;window.__demoCopies=0;`});
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await send('Emulation.setDeviceMetricsOverride',{width:1100,height:700,deviceScaleFactor:1,mobile:false});
  const rows=[];
  for(const kind of ['copy','candidate']){
    const navigation=await send('Page.navigate',{url:origin+'/?lang=en&theme=dark'});
    if(navigation.errorText)throw Error(navigation.errorText);
    await until(()=>evaluate(`Boolean(document.querySelector('[data-runtime-page="memory"]'))`));
    if(!await evaluate('window.__demoClipboardReady===true'))throw Error('Synthetic clipboard replacement did not initialize');
    await evaluate(`document.querySelector('[data-runtime-page="memory"]').click()`);
    await until(()=>evaluate(`Boolean(document.querySelector('.qr49'))`));
    if(kind==='copy')await evaluate(`document.querySelector('.qr49').click()`);
    else{
      await evaluate(`[...document.querySelectorAll('.qr26')].find(b=>b.textContent.includes('Candidate inbox')).click()`);
      await until(()=>evaluate(`Boolean(document.querySelector('.qr81'))`));
      await evaluate(`document.querySelector('.qr82').click()`);
      await until(()=>evaluate(`Boolean(document.querySelector('textarea.qr53'))`));
      await evaluate(`(()=>{const field=document.querySelector('textarea.qr53');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'');field.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await until(()=>evaluate(`document.querySelector('textarea.qr53').value===''`));
      await evaluate(`document.querySelector('.qr83').click()`);
    }
    await until(()=>evaluate(`Boolean(document.querySelector('.qr80')?.textContent)`));
    const identity=await evaluate(`document.querySelector('.qr51').textContent`);
    for(const [language,theme] of [['zh-Hans','dark'],['ja','light']]){
      await evaluate(`import('/src/i18n/index.ts').then(m=>m.setLang(${JSON.stringify(language)}))`);
      await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
      await evaluate('document.fonts.ready.then(()=>true)');
      const row=await evaluate(`(async()=>{
        const {t}=await import('/src/i18n/index.ts');
        const notice=document.querySelector('.qr80'),pane=document.querySelector('.qr87'),r=notice.getBoundingClientRect(),p=pane.getBoundingClientRect();
        return {kind:${JSON.stringify(kind)},language:document.documentElement.lang,theme:document.documentElement.dataset.theme,
          identity:document.querySelector('.qr51').textContent,notice:notice.textContent.trim(),
          expected:t(${JSON.stringify(kind==='copy'?'Could not copy. Select the ID and copy it manually.':'Enter memory content before promoting.')}),
          copies:window.__demoCopies??0,draft:document.querySelector('textarea.qr53')?.value??null,
          pageOverflow:document.documentElement.scrollWidth>innerWidth,noticeFits:r.left>=p.left&&r.right<=p.right&&r.bottom<=innerHeight&&notice.scrollWidth<=notice.clientWidth};
      })()`);
      if(row.identity!==identity||row.notice!==row.expected||row.pageOverflow||!row.noticeFits||row.copies!==(kind==='copy'?1:0)||(kind==='candidate'&&row.draft!==''))throw Error('Invalid feedback '+JSON.stringify(row));
      rows.push(row);console.log(JSON.stringify(row));
      const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,`${kind}-${language}-${theme}.png`),Buffer.from(shot.data,'base64'));
    }
  }
  writeFileSync(join(out,'report.json'),JSON.stringify({browser:version.Browser,scope:'Owned headless browser/profile, 1100x700, fictional browser-only Vault. Clipboard replaced before load; no native IPC or system clipboard. Language changes do not repeat the demo action.',rows},null,2));
} finally {
  writeFileSync(join(out,'startup-diagnostics.json'),JSON.stringify({pageErrors,networkEvents},null,2));
  if (ws?.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => undefined);
  ws?.close(); browser?.kill(); await server.close(); closeSync(log);
}
