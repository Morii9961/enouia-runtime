// Real Memory components across fictional lifecycle states and deletion receipts.
import {createRoot} from 'react-dom/client';
import {mockIPC} from '@tauri-apps/api/mocks';
import MemorySurface from '../src/memory/MemorySurface';
import {MemoryStatusProvider,useStatus} from '../src/memory/status';
import {setTransport} from '../src/memory/client';
import {ready,t,useLang} from '../src/i18n';
import '../src/theme/negative-fonts.css';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';
import '../src/theme/negative.css';
import '../src/theme/palettes.css';
import '../src/theme/motion.css';
import '../src/theme/cjk-fonts.css';

const params=new URLSearchParams(location.search);
const state=['before','loading','ready','locked','status-error','permission-denied','forget-refreshing','purge-refreshing','forgotten','purged'].includes(params.get('state')??'')?params.get('state')!:'before';
const gated=['locked','status-error','permission-denied'].includes(state);
const deleting=['forget-refreshing','purge-refreshing','forgotten','purged'].includes(state);
const purge=state==='purge-refreshing'||state==='purged';
const deletion={removed:false,refreshStarted:false};
const calls:{command:string;vault:string;args:Record<string,unknown>}[]=[];
const hostReads:string[]=[];
let vault='A',changed=false;
Object.assign(window,{memorySwitchFixtureCalls:calls,memorySwitchFixtureHostReads:hostReads,memorySwitchFixtureDeletion:deletion});
document.documentElement.dataset.theme=params.get('theme')==='light'?'light':'dark';
document.documentElement.dataset.fixtureState=state;
document.documentElement.dataset.fixtureHostActions='0';
mockIPC(async command=>{
  if(command==='shell_status'){hostReads.push(command);return {vaultChanging:false,vaultAdmissionError:null};}
  document.documentElement.dataset.fixtureHostActions=String(Number(document.documentElement.dataset.fixtureHostActions)+1);
  throw Error('Unexpected Vault switch fixture host action '+command);
},{shouldMockEvents:true});
setTransport(async(native,args)=>{
  if(native==='shell_status')return {vaultChanging:false};
  if(native!=='memory_call')throw Error('Unexpected Vault switch fixture channel '+native);
  const request=args.request as {command:string;arguments:Record<string,unknown>};
  calls.push({command:request.command,vault,args:request.arguments});
  let result:unknown;
  switch(request.command){
    case 'workspace_status':
      if(changed&&(state==='status-error'||state==='permission-denied'))return {kind:'memory_error',error:{code:state==='status-error'?'storage_failed':'permission_denied',retryable:false,rules:[]}};
      result={vault:changed&&state==='locked'?{state:'locked',rootName:'Fictional Vault A'}:{state:'open',vaultId:`vlt_fictional_${vault}`,rootName:`Fictional Vault ${vault}`},pendingCandidates:0};break;
    case 'memory_list':
      if(deletion.removed){
        deletion.refreshStarted=true;
        if(state==='forget-refreshing'||state==='purge-refreshing')return new Promise(()=>{});
        result={items:[],nextCursor:null,total:0};break;
      }
      if(vault==='B'&&state==='loading')return new Promise(()=>{});
      result={items:[{memoryId:`mem_fictional_${vault}`,snippet:`Vault ${vault} saved memory`,type:'fact',status:'active',currency:'current',revision:1,updatedAt:'2026-11-01T10:00:00Z',evidenceCount:0}],nextCursor:null,total:1};break;
    case 'memory_read':result={record:{memory_id:request.arguments.memoryId,revision:1,content:`Vault ${vault} detail for ${request.arguments.memoryId}`,approved_at:'2026-10-13T00:00:00Z',supersedes:[]},summary:{memoryId:request.arguments.memoryId,status:'active',type:'fact',expired:false,conflicted:false,sourceMissing:false},evidence:[],supersededBy:[]};break;
    case 'forget_plan':
      if(!deleting||request.arguments.memoryId!=='mem_fictional_A'||request.arguments.mode!==(purge?'purge':'forget')||request.arguments.withDependents!==false)throw Error('Unexpected fictional deletion target');
      result={planId:'plan_fictional_deletion',diffHash:'fictional-deletion-hash',confirmCode:'SYNTHETIC',expiresAt:'2099-01-01T00:00:00Z',operationKind:'forget',purge,records:[{target:'mem_fictional_A',mode:purge?'purge':'forget'}]};break;
    case 'review_confirm':
      if(!deleting||request.arguments.planId!=='plan_fictional_deletion'||request.arguments.diffHash!=='fictional-deletion-hash')throw Error('Unexpected fictional deletion confirmation');
      deletion.removed=true;result={committed:true};break;
    default:throw Error('Unexpected fictional Workspace command');
  }
  return {kind:'memory_page',result};
});
function StatusControl(){
  const {refresh,status,error}=useStatus();
  return <button hidden id="fixture-refresh" data-vault={status?.vault?.vaultId??''} data-status={status?.vault?.state??(error?'failed':'pending')} onClick={()=>void refresh()}>Fixture: read status</button>;
}
function Preview(){
  useLang();
  return <>
    <header data-fixture-watermark lang="en" style={{height:40,boxSizing:'border-box',padding:'10px 16px',font:'12px/18px var(--f-lab)',borderBottom:'1px solid var(--grid-major)'}}>FICTIONAL FIXTURE · NO NATIVE CONNECTION · {state}</header>
    <div style={{height:'calc(100vh - 40px)',display:'flex'}}><MemoryStatusProvider><StatusControl/><MemorySurface/></MemoryStatusProvider></div>
  </>;
}
await ready();
createRoot(document.getElementById('fixture')!).render(<Preview/>);
async function wait(test:()=>boolean){for(let n=0;n<250;n++){if(test())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Vault switch fixture did not settle');}
const surface=()=>document.querySelector('[data-screen-label="Memory Vault"]')!;
await wait(()=>surface()?.querySelectorAll('button.qr43').length===1);
surface().querySelector<HTMLButtonElement>('button.qr43')!.click();
await wait(()=>surface().textContent!.includes('Vault A detail for mem_fictional_A'));
document.documentElement.dataset.fixtureStartedWithSelectedA='true';
if(deleting){
  const trigger=[...surface().querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.trim()===t(purge?'Purge…':'Forget…'))!;
  trigger.click();
  await wait(()=>!!document.querySelector('dialog[open] button.mem-primary'));
  document.querySelector<HTMLButtonElement>('dialog[open] button.mem-primary')!.click();
  await wait(()=>deletion.refreshStarted&&!document.querySelector('dialog[open]')&&!surface().querySelector('#mem-fix'));
  if(state==='forgotten'||state==='purged')await wait(()=>!!surface().querySelector('.qr32')&&surface().querySelector('.qr45')?.getAttribute('aria-busy')==='false');
}else if(state!=='before'){
  changed=true;
  // Switches finish between polls; gate cases retain the same fictional root.
  if(!gated)vault='B';
  document.querySelector<HTMLButtonElement>('#fixture-refresh')!.click();
  if(gated){
    await wait(()=>document.querySelector('#fixture-refresh')?.getAttribute('data-status')===(state==='locked'?'locked':'failed')&&!surface().querySelector('button.qr43')&&!surface().querySelector('#mem-fix'));
  }else{
    await wait(()=>document.querySelector('#fixture-refresh')?.getAttribute('data-vault')==='vlt_fictional_B'&&!surface().textContent!.includes('Vault A'));
    await wait(()=>calls.some(call=>call.command==='memory_list'&&call.vault==='B'));
    if(state==='loading')await wait(()=>surface().querySelector('.qr45')?.getAttribute('aria-busy')==='true');
    else await wait(()=>surface().querySelector('button.qr43')?.textContent?.includes('Vault B saved memory')===true);
  }
}
await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
document.documentElement.dataset.fixtureReady='true';
