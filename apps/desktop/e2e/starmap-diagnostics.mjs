// Isolated, fictional browser diagnostics for UI v2 issue #24. No native IPC.
// Probes temporarily omit drawing operations to locate cost; they are NOT visual fixes.
// node e2e/starmap-diagnostics.mjs <Edge executable> <directory under ./target> [--dashes | --context]
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
  if(process.argv.includes('--context')){
    await send('Page.enable');
    const rows=[];
    for(const [run,alpha] of [true,false,true].entries()){
      const script=await send('Page.addScriptToEvaluateOnNewDocument',{source:`(() => {
        window.__starContextRun=${run};
        const original=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(type,settings){return original.call(this,type,
          type==='2d'&&this.classList.contains('sm-canvas')?{...settings,alpha:${alpha}}:settings);};
      })()`});
      await send('Page.navigate',{url:origin+`/starmap.html?lang=en&theme=dark&context-run=${run}`});
      await until(()=>evaluate(`window.__starContextRun===${run}&&Boolean(document.querySelector(".sm-canvas[data-ready]"))`));
      await evaluate('document.fonts.ready.then(()=>true)');
      await evaluate(`(() => {
        const p=window.__starDiagnostic={times:[],draws:[],steps:[]};
        window.__starPerf.draws.push=function(value){p.times.push(performance.now());p.draws.push(value);return Array.prototype.push.call(this,value);};
        window.__starPerf.steps.push=function(value){p.steps.push(value);return Array.prototype.push.call(this,value);};
      })()`);
      for(const layout of ['Sphere','Theme clusters']){
        await evaluate(`(() => {
          [...document.querySelectorAll('.sm-size button')].find(b=>b.textContent.replaceAll(',','')==='5000').click();
          [...document.querySelectorAll('[aria-label="Star map layout"] button')].find(b=>b.textContent==='${layout}').click();
        })()`);
        await until(()=>evaluate(`document.querySelector('.sm-canvas')?.dataset.ready==='5000:${layout==='Sphere'?'sphere':'clusters'}'`));
        await sleep(1200);
        const row=await evaluate(`(async () => {
          const p=window.__starDiagnostic;p.times=[];p.draws=[];p.steps=[];
          await new Promise(resolve=>setTimeout(resolve,6000));
          const summary=a=>{const s=a.slice().sort((x,y)=>x-y);return {n:s.length,median:s[Math.floor(s.length/2)]??null,p95:s[Math.min(s.length-1,Math.floor(s.length*.95))]??null};};
          const canvas=document.querySelector('.sm-canvas');
          return {layout:${JSON.stringify(layout)},n:5000,run:${run},requestedAlpha:${alpha},attributes:canvas.getContext('2d').getContextAttributes(),
            dpr:devicePixelRatio,hidden:document.hidden,canvas:{width:canvas.width,height:canvas.height},
            draw:summary(p.draws),step:summary(p.steps),interval:summary(p.times.slice(1).map((t,i)=>t-p.times[i]))};
        })()`);
        if(row.hidden||row.draw.n===0||row.attributes.alpha!==alpha)throw Error('Invalid context diagnostic sample '+JSON.stringify(row));
        rows.push(row);console.log(JSON.stringify(row));
        writeFileSync(join(out,'report.json'),JSON.stringify({browser:version.Browser,scope:'Fresh fictional headless pages, original product drawing; only main canvas alpha differs. Draw intervals are not presentation timestamps.',rows},null,2));
      }
      await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:script.identifier});
    }
  }else{
  await send('Page.navigate', { url: origin + '/starmap.html?lang=en&theme=dark' });
  await until(() => evaluate('Boolean(document.querySelector(".sm-canvas[data-ready]"))'));
  await evaluate('document.fonts.ready.then(()=>true)');
  await evaluate(`(() => {
    const canvas=document.querySelector('.sm-canvas'),ctx=canvas.getContext('2d');
    const drawImage=ctx.drawImage,stroke=ctx.stroke,beginPath=ctx.beginPath,moveTo=ctx.moveTo,lineTo=ctx.lineTo,setLineDash=ctx.setLineDash;
    const composite=Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype,'globalCompositeOperation');
    const probe=window.__starDiagnostic={mode:'baseline',times:[],draws:[],steps:[]};
    let dash=[],segments=[],last=null;
    ctx.drawImage=function(...args){if(!['no_glow','no_glow_or_blend'].includes(probe.mode))return drawImage.apply(this,args);};
    ctx.beginPath=function(){segments=[];last=null;return beginPath.call(this);};
    ctx.moveTo=function(x,y){last=[x,y];return moveTo.call(this,x,y);};
    ctx.lineTo=function(x,y){
      if(last&&dash.length){
        const [x0,y0]=last;segments.push([x0,y0,x,y]);
        if(probe.mode==='manual_theme_dashes'){
          const dx=x-x0,dy=y-y0,length=Math.hypot(dx,dy);
          for(let start=0;start<length;start+=6){const end=Math.min(start+3,length);
            moveTo.call(this,x0+dx*start/length,y0+dy*start/length);lineTo.call(this,x0+dx*end/length,y0+dy*end/length);}
          last=[x,y];return;
        }
      }
      last=[x,y];return lineTo.call(this,x,y);
    };
    ctx.setLineDash=function(value){dash=value;return setLineDash.call(this,['solid_theme_links','manual_theme_dashes'].includes(probe.mode)?[]:value);};
    ctx.stroke=function(...args){
      if(dash.length)probe.path={segments:segments.slice(),stroke:this.strokeStyle,width:this.lineWidth,alpha:this.globalAlpha,
        transform:[this.getTransform().a,this.getTransform().b,this.getTransform().c,this.getTransform().d,this.getTransform().e,this.getTransform().f]};
      if(!(probe.mode==='no_theme_links'&&dash.length))return stroke.apply(this,args);
    };
    Object.defineProperty(ctx,'globalCompositeOperation',{configurable:true,get(){return composite.get.call(this);},
      set(value){composite.set.call(this,probe.mode==='no_glow_or_blend'&&value==='lighter'?'source-over':value);}});
    window.__starPerf.draws.push=function(value){probe.times.push(performance.now());probe.draws.push(value);return Array.prototype.push.call(this,value);};
    window.__starPerf.steps.push=function(value){probe.steps.push(value);return Array.prototype.push.call(this,value);};
  })()`);
  const rows = [];
  const cases = process.argv.includes('--dashes') ? [
    ['Sphere', 5000, ['baseline', 'solid_theme_links', 'manual_theme_dashes', 'baseline']],
    ['Theme clusters', 5000, ['baseline', 'solid_theme_links', 'manual_theme_dashes', 'baseline']],
  ] : [
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
      if(mode==='manual_theme_dashes'){
        row.pixelComparison=await evaluate(`(() => {
          const p=window.__starDiagnostic.path,w=document.querySelector('.sm-canvas').width,h=document.querySelector('.sm-canvas').height;
          const images=[false,true].map(manual=>{
            const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const g=canvas.getContext('2d');
            g.setTransform(...p.transform);g.strokeStyle=p.stroke;g.lineWidth=p.width;g.globalAlpha=p.alpha;g.setLineDash(manual?[]:[3,3]);g.beginPath();
            for(const [x0,y0,x1,y1] of p.segments){
              if(!manual){g.moveTo(x0,y0);g.lineTo(x1,y1);continue;}
              const dx=x1-x0,dy=y1-y0,length=Math.hypot(dx,dy);
              for(let start=0;start<length;start+=6){const end=Math.min(start+3,length);g.moveTo(x0+dx*start/length,y0+dy*start/length);g.lineTo(x0+dx*end/length,y0+dy*end/length);}
            }
            g.stroke();return g.getImageData(0,0,w,h).data;
          });
          let different=0,maxDelta=0,totalDelta=0;
          for(let i=0;i<images[0].length;i+=4){let changed=false;for(let j=0;j<4;j++){const delta=Math.abs(images[0][i+j]-images[1][i+j]);maxDelta=Math.max(maxDelta,delta);totalDelta+=delta;changed ||= delta>0;}if(changed)different++;}
          return {segments:p.segments.length,pixels:w*h,different,maxChannelDelta:maxDelta,meanChannelDelta:totalDelta/images[0].length};
        })()`);
        console.log(JSON.stringify({layout,n,pixelComparison:row.pixelComparison}));
      }
      writeFileSync(join(out, 'report.json'), JSON.stringify({ browser: version.Browser, scope: 'Isolated headless browser, fictional star map; probes change pixels, not product behavior. Draw intervals are not presentation timestamps.', rows }, null, 2));
    }
  }
  }
} finally {
  if (ws?.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => undefined);
  ws?.close(); browser?.kill(); await server.close(); closeSync(log);
}
