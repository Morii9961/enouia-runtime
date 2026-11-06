// Independent browser fixture: every read is mocked; no native connection.
import {createRoot} from 'react-dom/client';
import {mockIPC} from '@tauri-apps/api/mocks';
import {CatalogMemory} from '../src/memory/CatalogMemory';
import {setCatalogTransport} from '../src/memory/catalog';
import {setTransport} from '../src/memory/client';
import {ready,useLang} from '../src/i18n';
import {status,page,stats} from './fixtures/catalog.mjs';
import '../src/theme/negative-fonts.css';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';
import '../src/theme/negative.css';
import '../src/theme/palettes.css';
import '../src/theme/motion.css';
import '../src/theme/cjk-fonts.css';

const params=new URLSearchParams(location.search);
const states=['initial','counts-pending','counts-error','status-error','open','locked','disabled','failed'];
const state=states.includes(params.get('state')??'')?params.get('state')!:'initial';
const calls:Record<string,any>[]=[];
Object.assign(window,{catalogFixtureCalls:calls});
document.documentElement.dataset.theme=params.get('theme')==='light'?'light':'dark';
document.documentElement.dataset.fixtureState=state;
document.documentElement.dataset.fixtureHostActions='0';
mockIPC(async command=>{
  document.documentElement.dataset.fixtureHostActions=String(Number(document.documentElement.dataset.fixtureHostActions)+1);
  throw Error('Unexpected catalog fixture host action '+command);
},{shouldMockEvents:true});
setTransport(async()=>{throw Error('Workspace calls are not part of this fixture');});
setCatalogTransport(async(command,args)=>{
  if(command!=='memory_catalog')throw Error('Unexpected catalog fixture channel');
  const query=(args as any).request.query;
  if(!['status','page','stats'].includes(query.operation))throw Error('Catalog fixture permits reads only');
  calls.push(structuredClone(query));
  if(query.operation==='status'){
    if(state==='initial')return new Promise(()=>{});
    if(state==='status-error')throw 'catalog_read_refused';
    return status(['locked','disabled','failed'].includes(state)?state:'open');
  }
  if(query.operation==='page')return page(query.filter.text,query.cursor);
  if(state==='counts-pending')return new Promise(()=>{});
  if(state==='counts-error')throw 'catalog_stale';
  return stats(query.selection,query.filter.text?1:3);
});
function Preview(){
  useLang();
  return <>
    <header data-fixture-watermark lang="en" style={{height:40,boxSizing:'border-box',padding:'10px 16px',font:'12px/18px var(--f-lab)',borderBottom:'1px solid var(--grid-major)'}}>FICTIONAL FIXTURE · NO NATIVE CONNECTION</header>
    <section className="qr89" style={{height:'calc(100vh - 40px)'}}>
      <aside className="qr28" lang="en"><div className="qr20"><h1 className="qr18">READ-2 STATE FIXTURE</h1><p className="mem-muted">{state}</p><p className="mem-content">Original CatalogMemory component. Controlled browser reads only. No Owner Vault or Provider.</p></div></aside>
      <CatalogMemory/>
    </section>
  </>;
}
await ready();
createRoot(document.getElementById('fixture')!).render(<Preview/>);
async function wait(test:()=>boolean){for(let i=0;i<200;i++){if(test())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Catalog fixture did not settle');}
await wait(()=>!!document.querySelector('form')&&calls.length>0);
if(state==='counts-pending')await wait(()=>calls.some(c=>c.operation==='stats')&&document.querySelector('.qr45')?.getAttribute('aria-busy')==='true');
if(state==='counts-error'||state==='status-error')await wait(()=>!!document.querySelector('[role="alert"]'));
if(state==='open')await wait(()=>document.querySelectorAll('.mem-list li').length===2);
await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
document.documentElement.dataset.fixtureReady='true';
