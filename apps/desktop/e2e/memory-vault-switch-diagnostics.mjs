// Owned headless Chromium browser, mock transport only. No native app, Vault, picker or OS keys.
// node e2e/memory-vault-switch-diagnostics.mjs <browser executable> <directory under ./target>
import {spawn} from 'node:child_process';
import {closeSync,existsSync,mkdirSync,mkdtempSync,openSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {build,preview} from 'vite';

const [edgeInput,outputInput]=process.argv.slice(2);
if(!edgeInput||!outputInput)throw Error('Expected browser executable and output directory');
const edge=resolve(edgeInput),out=resolve(outputInput);
if(!out.startsWith(resolve('target')+sep))throw Error('Diagnostics must stay under the desktop target directory');
mkdirSync(out,{recursive:true});
const profile=mkdtempSync(join(out,'profile-')),log=openSync(join(profile,'edge.log'),'a');
// Build only this fixture before serving it; dev-server cold starts timed out on this host.
const fixtureOut=join(out,'preview');
await build({css:{postcss:{plugins:[]}},build:{outDir:fixtureOut,emptyOutDir:false,rolldownOptions:{input:resolve('e2e/memory-vault-switch-preview.html')}},logLevel:'error'});
const server=await preview({build:{outDir:fixtureOut},preview:{host:'127.0.0.1',port:0,strictPort:true},logLevel:'error'});
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
  const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
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
  for(const language of ['en','zh-Hans','ja'])for(const theme of ['dark','light'])for(const state of ['before','loading','ready','locked','status-error','permission-denied','forget-refreshing','purge-refreshing','forgotten','purged']){
    await evaluate(`localStorage.setItem('enouia.lang',${JSON.stringify(language)})`);
    await send('Page.navigate',{url:origin+`/e2e/memory-vault-switch-preview.html?theme=${theme}&state=${state}`});
    await until(()=>evaluate("document.documentElement.dataset.fixtureReady==='true'"));
    await evaluate('document.fonts.ready.then(()=>true)');
    const row=await evaluate(`(()=>{const surface=document.querySelector('[data-screen-label="Memory Vault"]'),watermark=document.querySelector('[data-fixture-watermark]').getBoundingClientRect(),buttons=[...surface.querySelectorAll('button.qr43')],center=surface.querySelector('.qr45');return {state:${JSON.stringify(state)},language:document.documentElement.lang,theme:document.documentElement.dataset.theme,startedWithSelectedA:document.documentElement.dataset.fixtureStartedWithSelectedA==='true',vault:document.querySelector('#fixture-refresh').dataset.vault,status:document.querySelector('#fixture-refresh').dataset.status,oldContent:surface.textContent.includes('Vault A saved memory')||surface.textContent.includes('Vault A detail'),newContent:surface.textContent.includes('Vault B saved memory'),rows:buttons.length,selected:buttons.filter(button=>button.getAttribute('aria-pressed')==='true').length,detail:!!surface.querySelector('#mem-fix'),connect:!!surface.querySelector('#mem-create-phrase'),busy:center.getAttribute('aria-busy'),count:center.querySelector('.qr19')?.textContent,empty:center.querySelector('.qr32')?.textContent??null,centerText:center.textContent,inspector:surface.querySelector('.qr88')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth,watermarkVisible:watermark.top>=0&&watermark.left>=0&&watermark.right<=innerWidth&&watermark.bottom<=innerHeight,hostActions:Number(document.documentElement.dataset.fixtureHostActions),hostReads:memorySwitchFixtureHostReads,calls:memorySwitchFixtureCalls,deletion:memorySwitchFixtureDeletion};})()`);
    const before=state==='before',gated=['locked','status-error','permission-denied'].includes(state),deleting=['forget-refreshing','purge-refreshing','forgotten','purged'].includes(state),refreshing=state==='forget-refreshing'||state==='purge-refreshing';
    const status=state==='locked'?'locked':gated?'failed':'open';
    if(row.language!==language||row.theme!==theme||!row.startedWithSelectedA||row.vault!==(gated?'':`vlt_fictional_${before||deleting?'A':'B'}`)||row.status!==status||row.oldContent!==before||row.newContent!==(state==='ready')||row.rows!==((before||state==='ready')?1:0)||row.selected!==(before?1:0)||row.detail!==before||row.connect!==(state==='locked')||row.busy!==(state==='loading'||refreshing?'true':gated?null:'false')||row.overflow||!row.watermarkVisible||row.hostActions)throw Error('Invalid Vault lifecycle state: '+JSON.stringify(row));
    if(!row.calls.every(call=>(deleting?['workspace_status','memory_list','memory_read','forget_plan','review_confirm']:['workspace_status','memory_list','memory_read']).includes(call.command))||row.calls.some(call=>call.command==='memory_read'&&call.vault==='B'))throw Error('Unexpected request or inherited selection');
    if(!row.hostReads.every(command=>command==='shell_status')||(row.hostReads.length>0)!==(state==='locked'))throw Error('Unexpected host read');
    if(gated&&row.calls.filter(call=>call.command==='memory_list').length!==1)throw Error('Gated Vault started another list read');
    if(deleting){
      const plans=row.calls.filter(call=>call.command==='forget_plan'),confirmations=row.calls.filter(call=>call.command==='review_confirm');
      if(!row.deletion.removed||!row.deletion.refreshStarted||plans.length!==1||confirmations.length!==1||plans[0].args.memoryId!=='mem_fictional_A'||plans[0].args.mode!==(state==='purged'||state==='purge-refreshing'?'purge':'forget')||plans[0].args.withDependents!==false||confirmations[0].args.planId!=='plan_fictional_deletion'||confirmations[0].args.diffHash!=='fictional-deletion-hash')throw Error('Unexpected fictional deletion transaction');
      if(refreshing?row.empty!==null:!row.empty)throw Error('Wrong pending or completed deletion result');
    }
    if(language==='en'){
      if(!before&&!row.inspector.includes(gated?'Open a Vault to see its memories.':'Select a memory to see where it came from.'))throw Error('Missing inspector explanation');
      if(state==='locked'&&!row.centerText.includes('Vault locked · Fictional Vault A'))throw Error('Missing locked Vault explanation');
      if(gated&&state!=='locked'&&!row.centerText.includes('Memory status could not be read. It is retried every few seconds.'))throw Error('Missing failed status explanation');
      if(deleting&&!row.centerText.includes(state==='purged'||state==='purge-refreshing'?'Permanent purge confirmed by Memory.':'Forget confirmed by Memory.'))throw Error('Wrong deletion receipt explanation');
      if(refreshing&&row.count!=='Waiting for memories')throw Error('Deleted list kept its old count while refreshing');
    }
    const screenshot=`${state}-${language}-${theme}.png`;
    const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,screenshot),Buffer.from(shot.data,'base64'));
    rows.push({...row,screenshot});console.log(JSON.stringify({state,language,theme,passed:true}));
  }
  if(pageErrors.length)throw Error('Page errors: '+JSON.stringify(pageErrors));
  writeFileSync(join(out,'report.json'),JSON.stringify({browser:version.Browser,rendering:'Vite production bundle of the fictional fixture only',scope:'MemorySurface across fictional Vault switches, failed status reads and bound fictional deletion confirmations. Mock Workspace only; no native acceptance.',rows,pageErrors,commands},null,2)+'\n');
}finally{
  if(ws?.readyState===WebSocket.OPEN)await send('Browser.close').catch(()=>undefined);
  ws?.close();browser?.kill();await server.close();closeSync(log);
}
