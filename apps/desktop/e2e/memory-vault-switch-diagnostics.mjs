// Owned headless Edge, mock transport only. No native app, Vault, picker or OS keys.
// node e2e/memory-vault-switch-diagnostics.mjs <Edge executable> <directory under ./target>
import {spawn} from 'node:child_process';
import {closeSync,existsSync,mkdirSync,mkdtempSync,openSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {createServer} from 'vite';

const [edgeInput,outputInput]=process.argv.slice(2);
if(!edgeInput||!outputInput)throw Error('Expected Edge executable and output directory');
const edge=resolve(edgeInput),out=resolve(outputInput);
if(!out.startsWith(resolve('target')+sep))throw Error('Diagnostics must stay under the desktop target directory');
mkdirSync(out,{recursive:true});
const profile=mkdtempSync(join(out,'profile-')),log=openSync(join(profile,'edge.log'),'a');
// Keep screenshots independent of a running preview or DOM runner's optimizer.
const server=await createServer({cacheDir:join(out,'vite-cache'),css:{postcss:{plugins:[]}},server:{host:'127.0.0.1',port:0,strictPort:true},logLevel:'error'});
let browser,ws,nextId=0;
const pending=new Map(),pageErrors=[],rows=[],commands=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(test){
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){const result=await test();if(result)return result;await sleep(100);}
  throw Error('Vault switch diagnostics timed out: '+JSON.stringify(pageErrors));
}
function send(method,params={}){
  const id=++nextId,started=Date.now();
  console.log(JSON.stringify({sending:method}));
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},60000);
    pending.set(id,{resolve,reject,timer,method,started});ws.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??'Browser evaluation failed');
  return result.result?.value;
}
try{
  await server.listen();
  const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
  await fetch(origin+'/');
  await server.environments.client.warmupRequest('/e2e/memory-vault-switch-preview.tsx');
  await server.environments.client.waitForRequestsIdle();
  const initialUrl=origin+'/e2e/memory-vault-switch-preview.html';
  browser=spawn(edge,['--headless=new','--no-first-run','--disable-extensions','--disable-default-apps','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,initialUrl],{windowsHide:true,stdio:['ignore',log,log]});
  const portFile=join(profile,'DevToolsActivePort');
  await until(()=>existsSync(portFile));
  const port=Number(readFileSync(portFile,'utf8').split('\n')[0]);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid owned browser port');
  const endpoint=`http://127.0.0.1:${port}`;
  const version=await(await fetch(endpoint+'/json/version')).json();
  const target=await until(async()=>{const targets=await(await fetch(endpoint+'/json/list')).json();return targets.find(target=>target.type==='page'&&target.url===initialUrl);});
  if(!target?.webSocketDebuggerUrl?.startsWith(`ws://127.0.0.1:${port}/`))throw Error('Owned fixture page unavailable');
  ws=new WebSocket(target.webSocketDebuggerUrl);
  ws.onmessage=event=>{
    const packet=JSON.parse(event.data),waiter=pending.get(packet.id);
    if(packet.method==='Runtime.exceptionThrown')pageErrors.push(packet.params.exceptionDetails.exception?.description??packet.params.exceptionDetails.text);
    if(packet.method==='Runtime.consoleAPICalled'&&packet.params.type==='error')pageErrors.push(packet.params.args.map(arg=>arg.value??arg.description).join(' '));
    if(!waiter)return;
    pending.delete(packet.id);clearTimeout(waiter.timer);
    const command={method:waiter.method,ms:Date.now()-waiter.started};commands.push(command);console.log(JSON.stringify(command));
    if(packet.error)waiter.reject(Error(packet.error.message));else waiter.resolve(packet.result);
  };
  ws.onclose=()=>{for(const waiter of pending.values()){clearTimeout(waiter.timer);waiter.reject(Error('Owned browser closed'));}pending.clear();};
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1100,height:700,deviceScaleFactor:1,mobile:false});
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await send('Page.navigate',{url:origin+'/e2e/memory-vault-switch-preview.html'});
  await until(()=>evaluate("document.documentElement.dataset.fixtureReady==='true'"));
  for(const language of ['en','zh-Hans','ja'])for(const theme of ['dark','light'])for(const state of ['before','loading','ready']){
    await evaluate(`localStorage.setItem('enouia.lang',${JSON.stringify(language)})`);
    await send('Page.navigate',{url:origin+`/e2e/memory-vault-switch-preview.html?theme=${theme}&state=${state}`});
    await until(()=>evaluate("document.documentElement.dataset.fixtureReady==='true'"));
    await evaluate('document.fonts.ready.then(()=>true)');
    const row=await evaluate(`(()=>{const surface=document.querySelector('[data-screen-label="Memory Vault"]'),watermark=document.querySelector('[data-fixture-watermark]').getBoundingClientRect(),buttons=[...surface.querySelectorAll('button.qr43')];return {state:${JSON.stringify(state)},language:document.documentElement.lang,theme:document.documentElement.dataset.theme,startedWithSelectedA:document.documentElement.dataset.fixtureStartedWithSelectedA==='true',vault:document.querySelector('#fixture-refresh').dataset.vault,oldContent:surface.textContent.includes('Vault A'),newContent:surface.textContent.includes('Vault B saved memory'),rows:buttons.length,selected:buttons.filter(button=>button.getAttribute('aria-pressed')==='true').length,detail:!!surface.querySelector('#mem-fix'),busy:surface.querySelector('.qr45').getAttribute('aria-busy'),inspector:surface.querySelector('.qr88')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth,watermarkVisible:watermark.top>=0&&watermark.left>=0&&watermark.right<=innerWidth&&watermark.bottom<=innerHeight,hostActions:Number(document.documentElement.dataset.fixtureHostActions),calls:memorySwitchFixtureCalls};})()`);
    const before=state==='before';
    if(row.language!==language||row.theme!==theme||!row.startedWithSelectedA||row.vault!==`vlt_fictional_${before?'A':'B'}`||row.oldContent!==before||row.newContent!==(state==='ready')||row.rows!==(state==='loading'?0:1)||row.selected!==(before?1:0)||row.detail!==before||row.busy!==(state==='loading'?'true':'false')||row.overflow||!row.watermarkVisible||row.hostActions)throw Error('Invalid Vault switch state: '+JSON.stringify(row));
    if(!row.calls.every(call=>['workspace_status','memory_list','memory_read'].includes(call.command))||row.calls.some(call=>call.command==='memory_read'&&call.vault==='B'))throw Error('Unexpected read or inherited selection');
    if(language==='en'&&!before&&!row.inspector.includes('Select a memory to see where it came from.'))throw Error('Missing unselected inspector explanation');
    const screenshot=`${state}-${language}-${theme}.png`;
    const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,screenshot),Buffer.from(shot.data,'base64'));
    rows.push({...row,screenshot});console.log(JSON.stringify({state,language,theme,passed:true}));
  }
  if(pageErrors.length)throw Error('Page errors: '+JSON.stringify(pageErrors));
  writeFileSync(join(out,'report.json'),JSON.stringify({browser:version.Browser,scope:'MemorySurface switch between two fictional Vaults. Mock status, list and detail reads only; no native acceptance.',rows,pageErrors,commands},null,2)+'\n');
}finally{
  if(ws?.readyState===WebSocket.OPEN)await send('Browser.close').catch(()=>undefined);
  ws?.close();browser?.kill();await server.close();closeSync(log);
}
