// Independent browser fixture: every read is mocked; no native connection.
import {createRoot} from 'react-dom/client';
import {mockIPC} from '@tauri-apps/api/mocks';
import {AutomaticMemory} from '../src/memory/AutomaticMemory';
import {setAutomationTransport} from '../src/memory/automation';
import {setTransport} from '../src/memory/client';
import {ready,useLang} from '../src/i18n';
import basePage from './fixtures/core8/page.json';
import '../src/theme/negative-fonts.css';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';
import '../src/theme/negative.css';
import '../src/theme/palettes.css';
import '../src/theme/motion.css';
import '../src/theme/cjk-fonts.css';

const params=new URLSearchParams(location.search);
const states=['initial','page-pending','page-error','status-error','open','locked','disabled','failed'];
const state=states.includes(params.get('state')??'')?params.get('state')!:'initial';
const calls:Record<string,any>[]=[];
Object.assign(window,{read1FixtureCalls:calls});
document.documentElement.dataset.theme=params.get('theme')==='light'?'light':'dark';
document.documentElement.dataset.fixtureState=state;
document.documentElement.dataset.fixtureHostActions='0';
mockIPC(async command=>{
  document.documentElement.dataset.fixtureHostActions=String(Number(document.documentElement.dataset.fixtureHostActions)+1);
  throw Error('Unexpected read-1 fixture host action '+command);
},{shouldMockEvents:true});
setTransport(async()=>{throw Error('Workspace calls are not part of this fixture');});
setAutomationTransport(async(command,args)=>{
  if(command!=='memory_automation')throw Error('Unexpected read-1 fixture channel');
  const query=(args as any).request.query;
  if(!['status','page'].includes(query.operation))throw Error('Read-1 fixture permits reads only');
  calls.push(structuredClone(query));
  if(query.operation==='status'){
    if(state==='initial')return new Promise(()=>{});
    if(state==='status-error')throw 'automation_read_refused';
    return {schema_version:2,capability:'memory-native-read-1',effect:'native_read',kind:'runtime_memory_automation_status',mode:'synthetic_only',state:['locked','disabled','failed'].includes(state)?state:'open',snapshot:structuredClone(basePage.snapshot)};
  }
  if(state==='page-pending')return new Promise(()=>{});
  if(state==='page-error')throw 'automation_read_refused';
  return structuredClone(basePage);
});
function Preview(){
  useLang();
  return <>
    <header data-fixture-watermark lang="en" style={{height:40,boxSizing:'border-box',padding:'10px 16px',font:'12px/18px var(--f-lab)',borderBottom:'1px solid var(--grid-major)'}}>FICTIONAL FIXTURE · NO NATIVE CONNECTION</header>
    <section className="qr89" style={{height:'calc(100vh - 40px)'}}>
      <aside className="qr28" lang="en"><div className="qr20"><h1 className="qr18">READ-1 STATE FIXTURE</h1><p className="mem-muted">{state}</p><p className="mem-content">Original AutomaticMemory component. Controlled browser reads only. No Owner Vault or Provider.</p></div></aside>
      <AutomaticMemory/>
    </section>
  </>;
}
await ready();
createRoot(document.getElementById('fixture')!).render(<Preview/>);
async function wait(test:()=>boolean){for(let i=0;i<200;i++){if(test())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Read-1 fixture did not settle');}
await wait(()=>!!document.querySelector('.qr45 h2')&&calls.length>0);
if(state==='page-pending')await wait(()=>calls.some(c=>c.operation==='page')&&document.querySelector('.qr45')?.getAttribute('aria-busy')==='true');
if(state==='page-error'||state==='status-error')await wait(()=>!!document.querySelector('[role="alert"]'));
if(state==='open')await wait(()=>document.querySelectorAll('.mem-list li').length===basePage.items.length);
await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
document.documentElement.dataset.fixtureReady='true';
