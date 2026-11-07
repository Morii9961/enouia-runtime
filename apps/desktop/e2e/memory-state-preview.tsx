// Independent browser fixture: every Workspace read is mocked; no native connection or Vault.
import {createRoot} from 'react-dom/client';
import {mockIPC} from '@tauri-apps/api/mocks';
import MemorySurface from '../src/memory/MemorySurface';
import {MemoryStatusProvider} from '../src/memory/status';
import {setTransport} from '../src/memory/client';
import {ready,useLang} from '../src/i18n';
import '../src/theme/negative-fonts.css';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';
import '../src/theme/negative.css';
import '../src/theme/palettes.css';
import '../src/theme/motion.css';
import '../src/theme/cjk-fonts.css';

const params=new URLSearchParams(location.search);
const states=['pending','list','empty','no-match','index-unavailable','index-busy','search-index-unavailable'];
const state=states.includes(params.get('state')??'')?params.get('state')!:'list';
const calls:string[]=[];
Object.assign(window,{memoryFixtureCalls:calls});
document.documentElement.dataset.theme=params.get('theme')==='light'?'light':'dark';
document.documentElement.dataset.fixtureState=state;
document.documentElement.dataset.fixtureHostActions='0';
mockIPC(async command=>{
  document.documentElement.dataset.fixtureHostActions=String(Number(document.documentElement.dataset.fixtureHostActions)+1);
  throw Error('Unexpected Memory fixture host action '+command);
},{shouldMockEvents:true});
const common={type:'fact',status:'active',currency:'current',revision:1,updatedAt:'2026-11-01T10:00:00Z'};
const rows=[
  {...common,memoryId:'mem_fictional_state_0',title:'Fictional quiet-desk preference',evidenceCount:1,snippet:'Fictional fixture: prefers a quiet desk for long reading.'},
  {...common,memoryId:'mem_fictional_state_1',title:'Fictional tea note',evidenceCount:0,snippet:'Fictional fixture: drinks green tea in the afternoon.',updatedAt:'2026-10-31T08:30:00Z'},
];
const failure=(code:string,rules:string[]=[])=>({kind:'memory_error',error:{code,retryable:true,rules}});
setTransport(async(native,args)=>{
  if(native==='shell_status')return {vaultChanging:false};
  if(native!=='memory_call')throw Error('Unexpected Memory fixture channel '+native);
  const r=args.request as {command:string};calls.push(r.command);
  if(r.command==='workspace_status')return {kind:'memory_page',result:{vault:{state:'open',vaultId:'vlt_fictional_state_fixture'},pendingCandidates:0}};
  if(r.command==='memory_list'){
    if(state==='pending')return new Promise(()=>{});
    if(state==='index-unavailable')return failure('index_not_ready');
    if(state==='index-busy')return failure('busy',['index.busy']);
    return {kind:'memory_page',result:{items:state==='empty'?[]:rows,nextCursor:null,total:state==='empty'?0:rows.length}};
  }
  if(r.command==='memory_search'){
    if(state==='search-index-unavailable')return failure('index_not_ready');
    return {kind:'memory_page',result:{items:[],nextCursor:null}};
  }
  throw Error('Memory fixture permits list and search reads only');
});
function Preview(){
  useLang();
  return <>
    <header data-fixture-watermark lang="en" style={{height:40,boxSizing:'border-box',padding:'10px 16px',font:'12px/18px var(--f-lab)',borderBottom:'1px solid var(--grid-major)'}}>FICTIONAL FIXTURE · NO NATIVE CONNECTION · {state}</header>
    <div style={{height:'calc(100vh - 40px)',display:'flex'}}><MemoryStatusProvider><MemorySurface/></MemoryStatusProvider></div>
  </>;
}
await ready();
createRoot(document.getElementById('fixture')!).render(<Preview/>);
async function wait(test:()=>boolean){for(let i=0;i<250;i++){if(test())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Memory fixture did not settle');}
await wait(()=>calls.includes('memory_list'));
if(state==='list'||state==='no-match'||state==='search-index-unavailable')await wait(()=>document.querySelectorAll('button.qr43').length===rows.length);
if(state==='empty')await wait(()=>!!document.querySelector('.qr32'));
if(state==='index-unavailable'||state==='index-busy')await wait(()=>!!document.querySelector('[role="alert"]'));
if(state==='no-match'||state==='search-index-unavailable'){
  const search=document.querySelector<HTMLInputElement>('input.qr21')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(search,'fictional absent cue');
  search.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(resolve=>setTimeout(resolve,30));
  search.closest('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await wait(()=>calls.includes('memory_search')&&(state==='no-match'?!!document.querySelector('.qr32'):!!document.querySelector('[role="alert"]')));
}
await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
document.documentElement.dataset.fixtureReady='true';
