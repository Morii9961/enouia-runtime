// Owned headless browser, mock transport only. No Vault, picker or OS keys.
// node e2e/inbox-review-diagnostics.mjs <browser executable> <directory under ./target>
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
const fixtureOut=join(out,'preview');
await build({css:{postcss:{plugins:[]}},build:{outDir:fixtureOut,emptyOutDir:false,rolldownOptions:{input:resolve('e2e/inbox-review-preview.html')}},logLevel:'error'});
const server=await preview({build:{outDir:fixtureOut},preview:{host:'127.0.0.1',port:0,strictPort:true},logLevel:'error'});
let browser,ws,nextId=0;
const pending=new Map(),pageErrors=[],rows=[],commands=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(test){
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){const result=await test();if(result)return result;await sleep(100);}
  throw Error('Inbox review diagnostics timed out: '+JSON.stringify(pageErrors));
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
  const initialUrl=origin+'/e2e/inbox-review-preview.html';
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
  await until(()=>evaluate("document.documentElement.dataset.fixtureReady==='true'"));
  for(const language of ['en','zh-Hans','ja'])for(const theme of ['dark','light'])for(const state of ['plan-ready','stale-dialog','cancelled-draft','replanned']){
    await evaluate(`localStorage.setItem('enouia.lang',${JSON.stringify(language)})`);
    await send('Page.navigate',{url:origin+`/e2e/inbox-review-preview.html?theme=${theme}&state=${state}`});
    await until(()=>evaluate("document.documentElement.dataset.fixtureReady==='true'"));
    await evaluate('document.fonts.ready.then(()=>true)');
    const row=await evaluate(`(()=>{const dialog=document.querySelector('dialog[open]'),watermark=document.querySelector('[data-fixture-watermark]').getBoundingClientRect(),article=document.querySelector('article'),confirm=dialog?.querySelector('button.mem-primary'),rect=dialog?.getBoundingClientRect(),alert=dialog?.querySelector('[role="alert"]');return {state:${JSON.stringify(state)},language:document.documentElement.lang,theme:document.documentElement.dataset.theme,draft:article.querySelector('textarea').value,article:article.textContent,savedLine:[...article.querySelectorAll('p.mem-muted')].find(p=>p.textContent.includes(memoryReviewFixture.data.saved))?.textContent??null,savedLineDecoration:[...article.querySelectorAll('p.mem-muted')].filter(p=>p.textContent.includes(memoryReviewFixture.data.saved)).map(p=>getComputedStyle(p).textDecorationLine),dialog:!!dialog,dialogText:dialog?.textContent,records:dialog?.querySelector('pre').textContent,confirmDisabled:confirm?.disabled??null,alert:alert?.textContent??null,recovery:dialog?.querySelector('#mem-plan-recovery')?.textContent??null,ariaDescribedBy:dialog?.getAttribute('aria-describedby'),retry:!!dialog&&[...dialog.querySelectorAll('button')].some(button=>button.textContent==='Retry'),dialogFits:!rect||(rect.top>=0&&rect.left>=0&&rect.right<=innerWidth&&rect.bottom<=innerHeight&&dialog.scrollWidth<=dialog.clientWidth),overflow:document.documentElement.scrollWidth>innerWidth,watermarkVisible:watermark.top>=0&&watermark.left>=0&&watermark.right<=innerWidth&&watermark.bottom<=innerHeight,hostActions:Number(document.documentElement.dataset.fixtureHostActions),calls:memoryReviewFixture.calls,data:memoryReviewFixture.data};})()`);
    const first=state==='plan-ready',stale=state==='stale-dialog',cancelled=state==='cancelled-draft',replanned=state==='replanned';
    const plans=row.calls.filter(call=>call.command==='review_plan'),confirms=row.calls.filter(call=>call.command==='review_confirm'),discards=row.calls.filter(call=>call.command==='review_discard');
    if(row.language!==language||row.theme!==theme||row.data.state!==state||row.data.revision!==(first?1:2)||row.draft!==row.data.draft||row.dialog===cancelled||row.confirmDisabled!==(cancelled?null:stale)||row.hostActions||row.overflow||!row.dialogFits||!row.watermarkVisible)throw Error('Invalid review state: '+JSON.stringify(row));
    if(!row.calls.every(call=>['workspace_status','candidate_list','review_plan','review_confirm','review_discard'].includes(call.command))||plans.length!==(replanned?2:1)||confirms.length!==(first?0:1)||discards.length!==(cancelled||replanned?1:0)||row.calls.filter(call=>call.command==='candidate_list').length!==(cancelled||replanned?2:1))throw Error('Unexpected review request count');
    plans.forEach((plan,index)=>{const decisions=plan.arguments.decisions,decision=decisions[0];if(decisions.length!==1||decision.candidateId!=='candidate_fictional_review'||decision.revision!==index+1||decision.action!=='edit_accept'||decision.editedContent!==row.data.draft||decision.mergeTarget!==null)throw Error('Wrong review decision');});
    if(confirms.some(call=>call.arguments.planId!=='plan_fictional_r1'||call.arguments.diffHash!=='fictional-hash-r1'||!call.idempotencyKey)||discards.some(call=>call.arguments.planId!=='plan_fictional_r1'))throw Error('Wrong confirmation or discarded plan');
    if(stale?(!row.alert||!row.recovery||row.retry||!row.ariaDescribedBy.includes('mem-plan-recovery')):row.alert!==null||row.recovery!==null)throw Error('Missing blocked confirmation explanation');
    if(cancelled||replanned){if(!row.savedLine?.includes(row.data.saved)||!row.savedLine.includes('r2')||row.savedLineDecoration.some(decoration=>decoration.includes('line-through')))throw Error('Changed saved proposal missing or struck out');}
    if(!cancelled){const records=JSON.parse(row.records);if(records.length!==1||records[0].revision!==(replanned?2:1)||records[0].editedContent!==row.data.draft)throw Error('Dialog shows the wrong review records');}
    const staleCopy={en:'The content changed since you reviewed it. Review it again','zh-Hans':'你审阅之后内容变了。请重新审阅',ja:'レビューした後に内容が変わりました。もう一度レビューしてください'};
    const savedCopy={en:'Saved proposal (r2):','zh-Hans':'已保存的提议（r2）：',ja:'保存済みの提案（r2）：'};
    if(stale&&!row.alert.includes(staleCopy[language]))throw Error('Wrong translated stale plan explanation');
    if((cancelled||replanned)&&!row.savedLine.includes(savedCopy[language]))throw Error('Wrong translated saved proposal label');
    const screenshot=`${state}-${language}-${theme}.png`;
    const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(out,screenshot),Buffer.from(shot.data,'base64'));
    rows.push({...row,screenshot});console.log(JSON.stringify({state,language,theme,passed:true}));
  }
  if(pageErrors.length)throw Error('Page errors: '+JSON.stringify(pageErrors));
  writeFileSync(join(out,'report.json'),JSON.stringify({browser:version.Browser,rendering:'Vite production bundle of the fictional fixture only',scope:'Real inbox and PlanDialog with synthetic revision_conflict/review.stale_plan replies, cancellation and replanning. No native acceptance or actual clock expiry.',rows,pageErrors,commands},null,2)+'\n');
}finally{
  if(ws?.readyState===WebSocket.OPEN)await send('Browser.close').catch(()=>undefined);
  ws?.close();browser?.kill();await server.close();closeSync(log);
}
