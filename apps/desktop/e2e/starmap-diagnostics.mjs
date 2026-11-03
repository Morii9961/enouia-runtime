// Isolated, fictional browser diagnostics for UI v2 issue #24. No native IPC.
// Probes temporarily omit drawing operations to locate cost; they are NOT visual fixes.
// node e2e/starmap-diagnostics.mjs <Edge executable> <directory under ./target>
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
  await send('Page.navigate', { url: origin + '/starmap.html?lang=en&theme=dark' });
  await until(() => evaluate('Boolean(document.querySelector(".sm-canvas[data-ready]"))'));
  await evaluate('document.fonts.ready.then(()=>true)');
  await evaluate(`(() => {
    const canvas=document.querySelector('.sm-canvas'),ctx=canvas.getContext('2d');
    const drawImage=ctx.drawImage,stroke=ctx.stroke;
    const composite=Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype,'globalCompositeOperation');
    const probe=window.__starDiagnostic={mode:'baseline',times:[],draws:[],steps:[]};
    ctx.drawImage=function(...args){if(!['no_glow','no_glow_or_blend'].includes(probe.mode))return drawImage.apply(this,args);};
    ctx.stroke=function(...args){if(!(probe.mode==='no_theme_links'&&this.getLineDash().length))return stroke.apply(this,args);};
    Object.defineProperty(ctx,'globalCompositeOperation',{configurable:true,get(){return composite.get.call(this);},
      set(value){composite.set.call(this,probe.mode==='no_glow_or_blend'&&value==='lighter'?'source-over':value);}});
    window.__starPerf.draws.push=function(value){probe.times.push(performance.now());probe.draws.push(value);return Array.prototype.push.call(this,value);};
    window.__starPerf.steps.push=function(value){probe.steps.push(value);return Array.prototype.push.call(this,value);};
  })()`);
  const rows = [];
  const cases = [
    ['Sphere', 200, ['baseline']],
    ['Sphere', 5000, ['baseline', 'no_glow', 'no_glow_or_blend', 'baseline']],
    ['Theme clusters', 5000, ['baseline', 'no_theme_links', 'baseline']],
  ];
  for (const [layout, n, modes] of cases) {
    await evaluate(`(() => {
      const size=[...document.querySelectorAll('.sm-size button')].find(b=>b.textContent.replaceAll(',','')==='${n}');
      const layout=[...document.querySelectorAll('[aria-label="Star map layout"] button')].find(b=>b.textContent==='${layout}');
      if(!size||!layout)throw Error('Missing diagnostic controls');size.click();layout.click();
    })()`);
    await until(() => evaluate(`document.querySelector('.sm-canvas')?.dataset.ready==='${n}:${layout === 'Sphere' ? 'sphere' : 'clusters'}'`));
    for (const mode of modes) {
      await evaluate(`window.__starDiagnostic.mode=${JSON.stringify(mode)}`);
      await sleep(1200);
      const row = await evaluate(`(async () => {
        const p=window.__starDiagnostic;p.times=[];p.draws=[];p.steps=[];
        await new Promise(resolve=>setTimeout(resolve,6000));
        const summary=a=>{const s=a.slice().sort((x,y)=>x-y);return {n:s.length,median:s[Math.floor(s.length/2)]??null,p95:s[Math.min(s.length-1,Math.floor(s.length*.95))]??null};};
        return {layout:${JSON.stringify(layout)},n:${n},mode:p.mode,dpr:devicePixelRatio,hidden:document.hidden,
          canvas:{width:document.querySelector('.sm-canvas').width,height:document.querySelector('.sm-canvas').height},
          draw:summary(p.draws),step:summary(p.steps),interval:summary(p.times.slice(1).map((t,i)=>t-p.times[i]))};
      })()`);
      if (row.hidden || row.draw.n === 0) throw Error('Hidden or empty diagnostic sample');
      rows.push(row); console.log(JSON.stringify(row));
      writeFileSync(join(out, 'report.json'), JSON.stringify({ browser: version.Browser, scope: 'Isolated headless browser, fictional star map; probes change pixels, not product behavior. Draw intervals are not presentation timestamps.', rows }, null, 2));
    }
  }
} finally {
  if (ws?.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => undefined);
  ws?.close(); browser?.kill(); await server.close(); closeSync(log);
}
