// Real inbox and PlanDialog; all review replies and saved revisions are fictional.
import {createRoot} from 'react-dom/client';
import {mockIPC} from '@tauri-apps/api/mocks';
import MemorySurface from '../src/memory/MemorySurface';
import {MemoryStatusProvider} from '../src/memory/status';
import {setTransport} from '../src/memory/client';
import {ready,t,useLang} from '../src/i18n';
import '../src/theme/negative-fonts.css';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';
import '../src/theme/negative.css';
import '../src/theme/palettes.css';
import '../src/theme/motion.css';
import '../src/theme/cjk-fonts.css';

type Decision={candidateId:string;revision:number;action:string;editedContent:string;mergeTarget:null};
type Request={command:string;arguments:Record<string,unknown>;idempotencyKey:string|null};
const params=new URLSearchParams(location.search);
const state=['plan-ready','stale-dialog','cancelled-draft','replanned'].includes(params.get('state')??'')?params.get('state')!:'plan-ready';
const calls:Request[]=[];
const data={revision:1,draft:'Fictional owner draft — 中文と日本語',saved:'Fictional proposal changed elsewhere',state};
Object.assign(window,{memoryReviewFixture:{calls,data}});
document.documentElement.dataset.theme=params.get('theme')==='light'?'light':'dark';
document.documentElement.dataset.fixtureHostActions='0';
mockIPC(async command=>{
  document.documentElement.dataset.fixtureHostActions=String(Number(document.documentElement.dataset.fixtureHostActions)+1);
  throw Error('Unexpected review fixture host action '+command);
},{shouldMockEvents:true});
setTransport(async(native,args)=>{
  if(native==='shell_status')return {vaultChanging:false};
  if(native!=='memory_call')throw Error('Unexpected review fixture channel '+native);
  const request=args.request as Request;calls.push(structuredClone(request));
  let result:unknown;
  switch(request.command){
    case 'workspace_status':result={vault:{state:'open',vaultId:'vlt_fictional_review'},pendingCandidates:1};break;
    case 'candidate_list':result={items:[{candidateId:'candidate_fictional_review',revision:data.revision,content:data.revision===1?'Original fictional proposal':data.saved,proposalKind:'create',proposedType:'fact',sensitivity:'normal',originKind:'manual',createdAt:'2026-11-01T10:00:00Z',evidence:[],contextSources:[],conflicts:[],target:null}],total:1,nextCursor:null};break;
    case 'review_plan':{
      const decisions=request.arguments.decisions as Decision[],decision=decisions[0];
      if(decisions.length!==1||decision.candidateId!=='candidate_fictional_review'||decision.revision!==data.revision||decision.action!=='edit_accept'||decision.editedContent!==data.draft||decision.mergeTarget!==null)throw Error('Unexpected fictional review decision');
      result={planId:`plan_fictional_r${data.revision}`,operationKind:'review',diffHash:`fictional-hash-r${data.revision}`,confirmCode:'FIXTURE',expiresAt:'2099-01-01T00:00:00Z',records:decisions};break;
    }
    case 'review_confirm':
      if(request.arguments.planId!=='plan_fictional_r1'||request.arguments.diffHash!=='fictional-hash-r1'||!request.idempotencyKey||data.revision!==1)throw Error('Unexpected fictional review confirmation');
      data.revision=2;
      return {kind:'memory_error',error:{code:'revision_conflict',retryable:false,rules:['review.stale_plan']}};
    case 'review_discard':
      if(request.arguments.planId!=='plan_fictional_r1'||data.revision!==2)throw Error('Unexpected fictional plan discard');
      result=null;break;
    default:throw Error('Unexpected fictional review command '+request.command);
  }
  return {kind:'memory_page',result};
});
function Preview(){
  useLang();
  return <>
    <header data-fixture-watermark lang="en" style={{height:40,boxSizing:'border-box',padding:'10px 16px',font:'12px/18px var(--f-lab)',borderBottom:'1px solid var(--grid-major)'}}>FICTIONAL FIXTURE · NO NATIVE CONNECTION · {state}</header>
    <div style={{height:'calc(100vh - 40px)',display:'flex'}}><MemoryStatusProvider><MemorySurface initialCollection="inbox"/></MemoryStatusProvider></div>
  </>;
}
await ready();
createRoot(document.getElementById('fixture')!).render(<Preview/>);
async function wait(test:()=>boolean){for(let n=0;n<250;n++){if(test())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Review fixture did not settle');}
const sent=(command:string)=>calls.filter(call=>call.command===command);
const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(control=>control.textContent?.trim()===label);
await wait(()=>!!document.querySelector('article textarea')&&button(t('Refresh candidates'))?.disabled===false);
const textarea=document.querySelector<HTMLTextAreaElement>('article textarea')!;
Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(textarea,data.draft);
textarea.dispatchEvent(new Event('input',{bubbles:true}));
await wait(()=>!!button(t('Accept with edits…')));
button(t('Accept with edits…'))!.click();
await wait(()=>!!document.querySelector('dialog[open] button.mem-primary'));
if(state!=='plan-ready'){
  document.querySelector<HTMLButtonElement>('dialog[open] button.mem-primary')!.click();
  await wait(()=>!!document.querySelector('dialog [role="alert"]')&&document.querySelector<HTMLButtonElement>('dialog button.mem-primary')?.disabled===true);
  if(state!=='stale-dialog'){
    button(t('Cancel'))!.click();
    await wait(()=>!document.querySelector('dialog[open]')&&sent('candidate_list').length===2&&!!document.querySelector('article')?.textContent?.includes(data.saved)&&button(t('Refresh candidates'))?.disabled===false);
    if(state==='replanned'){
      button(t('Accept with edits…'))!.click();
      await wait(()=>sent('review_plan').length===2&&!!document.querySelector('dialog[open] button.mem-primary'));
    }
  }
}
await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
document.documentElement.dataset.fixtureReady='true';
