// Browser demo navigation and selection; DOM-model evidence only.
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import { setLang, useLang, type Lang } from '../src/i18n';
const fixture=document.getElementById('fixture')!,root=createRoot(fixture),checks:{id:string;ok:boolean}[]=[];
const check=(id:string,ok:boolean)=>{checks.push({id,ok});if(!ok)throw Error(id);};
const sleep=()=>new Promise(resolve=>setTimeout(resolve,15));
async function wait(test:()=>boolean){for(let i=0;i<250;i++){if(test())return;await sleep();}throw Error('Workspace timeout');}
try{
  document.documentElement.dataset.motion='reduced';
  function Surface(){useLang();return <App memoryConnected={false} startPage="memory" breathing={false}/>;}
  root.render(<Surface/>);
  await wait(()=>!!fixture.querySelector('[data-memory-workspace]'));
  check('five_workspaces_with_legacy_list_inside_memories',fixture.querySelectorAll('[data-memory-workspace]').length===5&&!!fixture.querySelector('[data-memory-view="vault"][aria-pressed="true"]')&&!!fixture.querySelector('.qr89')&&!fixture.querySelector('.am-entry'));
  const workspace=(id:string)=>fixture.querySelector<HTMLButtonElement>(`[data-memory-workspace="${id}"]`)!;
  fixture.querySelector<HTMLButtonElement>('[data-memory-view="grid"]')!.click();
  await wait(()=>!!fixture.querySelector('.am-slip'));
  const slip=[...fixture.querySelectorAll<HTMLButtonElement>('.am-slip')].find(b=>b.getAttribute('aria-pressed')!=='true')!;
  const chosen=slip.querySelector('.am-slip-title')!.textContent;slip.click();await wait(()=>fixture.querySelector('.am-i-title')?.textContent===chosen);
  const inspector=fixture.querySelector('.am-inspector');
  for(const [id,views] of [['time','timeline'],['relations','stars,starmap,replacement,evidence'],['formation','formation,conflicts,revisions,hypotheses'],['recall','recall,suggestions'],['memories','grid']]){
    const nav=workspace(id);nav.focus();nav.click();
    await wait(()=>nav.getAttribute('aria-current')==='page'&&!!fixture.querySelector('.am-i-title'));
    check(`${id}_only_owns_its_views`,[...fixture.querySelectorAll<HTMLElement>('[data-auto-view]')].map(b=>b.dataset.autoView).join(',')===(views.includes(',')?views:'')&&fixture.querySelector('.am')?.getAttribute('data-view')===views.split(',')[0]);
    check(`${id}_keeps_shared_selection_and_inspector`,fixture.querySelector('.am-i-title')?.textContent===chosen&&fixture.querySelector('.am-inspector')===inspector);
    for(const language of ['en','zh-Hans','ja']){
      await setLang(language as Lang);await sleep();
      check(`${id}_${language}_keeps_nav_focus_and_selection`,document.activeElement===nav&&fixture.querySelector('.am-i-title')?.textContent===chosen&&nav.getAttribute('aria-current')==='page');
    }
    const link=fixture.querySelector<HTMLAnchorElement>('.am-demo-states a');
    check(`${id}_state_link_retains_workspace`,new URL(link!.href).searchParams.get('auto-workspace')===id);
  }
  await setLang('en');
  fixture.querySelector<HTMLButtonElement>('[data-memory-view="vault"]')!.click();await wait(()=>!!fixture.querySelector('.qr89'));
  check('legacy_compatibility_returns_without_synthetic_content',!fixture.querySelector('.am')&&!!fixture.querySelector('.qr26'));
  workspace('relations').click();await wait(()=>!!fixture.querySelector('[data-auto-view="stars"]'));
  fixture.querySelector<HTMLButtonElement>('[data-auto-view="starmap"]')!.click();await wait(()=>fixture.querySelector('.am')?.getAttribute('data-view')==='starmap');
  check('generated_map_is_only_a_connections_subview',!!fixture.querySelector('.sm-canvas')&&workspace('relations').getAttribute('aria-current')==='page');
}catch(error){checks.push({id:String(error),ok:false});}
finally{root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok)});}
