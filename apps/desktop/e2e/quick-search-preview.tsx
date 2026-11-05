// Browser-only Quick Search screenshot fixture. No native connection or Vault.
import {createRoot} from 'react-dom/client';
import {mockIPC} from '@tauri-apps/api/mocks';
import QuickSearch from '../src/shell/QuickSearch';
import {setTransport} from '../src/memory/client';
import {ready,useLang} from '../src/i18n';
import '../src/theme/negative-fonts.css';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';
import '../src/theme/negative.css';
import '../src/theme/palettes.css';
import '../src/theme/motion.css';
import '../src/theme/cjk-fonts.css';

const params=new URLSearchParams(location.search),asked=params.get('state');
const state=asked==='results'||asked==='no-results'||asked==='error'?asked:'empty';
document.documentElement.dataset.theme=params.get('theme')==='light'?'light':'dark';
document.documentElement.dataset.fixtureState=state;
document.documentElement.dataset.fixtureSearches='0';
document.documentElement.dataset.fixtureHostActions='0';
mockIPC(async command=>{
  document.documentElement.dataset.fixtureHostActions=String(Number(document.documentElement.dataset.fixtureHostActions)+1);
  if(command==='shell_hide'||command==='shell_show')return null;
  throw Error('Unexpected fixture host action '+command);
},{shouldMockEvents:true});
setTransport(async(command,args)=>{
  if(command!=='memory_call')throw Error('Unexpected fixture transport '+command);
  const request=args.request as {command:string;arguments:{query:string};idempotencyKey:unknown};
  if(request.command!=='memory_search'||request.idempotencyKey!==null)throw Error('Fixture permits read-only memory_search');
  document.documentElement.dataset.fixtureSearches=String(Number(document.documentElement.dataset.fixtureSearches)+1);
  if(state==='error')return {kind:'memory_error',error:{code:'busy',retryable:true,rules:[]}};
  return {kind:'memory_page',result:{items:state==='no-results'?[]:[{memoryId:'mem_fictional_overlay_01',currency:'current',snippet:`Fictional saved result for “${request.arguments.query}”. Exact original: <source> 中文と日本語。`}],nextCursor:null}};
});
function Preview(){
  useLang();
  return <>
    <div data-fixture-watermark lang="en" style={{position:'fixed',top:8,right:8,zIndex:100,padding:'3px 6px',border:'1px solid var(--grid-major)',background:'var(--paper)',color:'var(--ink)',font:'12px/16px var(--f-lab)',pointerEvents:'none'}}>FICTIONAL FIXTURE · NO NATIVE CONNECTION</div>
    <QuickSearch/>
  </>;
}
await ready();
createRoot(document.getElementById('fixture')!).render(<Preview/>);
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
async function wait(test:()=>boolean){for(let i=0;i<200;i++){if(test())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Quick Search fixture did not settle');}
await wait(()=>!!document.getElementById('quick-query'));await frame();
if(state!=='empty'){
  const input=document.getElementById('quick-query') as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'demo query — keep literal');
  input.dispatchEvent(new Event('input',{bubbles:true}));await frame();
  document.querySelector<HTMLFormElement>('form')!.requestSubmit();
  await wait(()=>document.documentElement.dataset.fixtureSearches==='1'&&document.querySelector('main')?.getAttribute('aria-busy')==='false');await frame();
}
document.documentElement.dataset.fixtureReady='true';
