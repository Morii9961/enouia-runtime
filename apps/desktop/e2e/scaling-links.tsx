// Focus links and state continuity in the synthetic preview; layout measured separately.
import {createRoot} from 'react-dom/client';
import AutoMemory from '../src/screens/automemory/AutoMemory';
import {AUTO_MEMORIES,DATASET} from '../src/screens/automemory/dataset';
import {setLang,useLang,type Lang} from '../src/i18n';
const fixture=document.getElementById('fixture')!,root=createRoot(fixture),checks:{id:string;ok:boolean}[]=[];
const check=(id:string,ok:boolean)=>{checks.push({id,ok});if(!ok)throw Error(id);};
const sleep=()=>new Promise(resolve=>setTimeout(resolve,15));
async function wait(test:()=>boolean){for(let n=0;n<180;n++){if(test())return;await sleep();}throw Error('Reading links timeout');}
try{
  document.documentElement.dataset.motion='reduced';
  function Surface(){useLang();return <AutoMemory workspace="memories"/>;}
  root.render(<Surface/>);await wait(()=>!!fixture.querySelector('.am-main .am-reading-jump'));
  const main=fixture.querySelector<HTMLElement>('.am-main')!,inspector=fixture.querySelector<HTMLElement>('.am-inspector')!,go=main.querySelector<HTMLAnchorElement>('.am-reading-jump')!,back=inspector.querySelector<HTMLAnchorElement>('.am-reading-jump')!;
  const oldHash=location.hash;go.click();
  check('visible_reading_link_focuses_same_inspector',document.activeElement===inspector&&location.hash===oldHash);
  back.click();check('return_focuses_view_without_navigation',document.activeElement===main&&location.hash===oldHash);
  if(AUTO_MEMORIES.length){
    const slip=fixture.querySelector<HTMLButtonElement>('[data-memory-record]')!;slip.click();await wait(()=>slip.getAttribute('aria-pressed')==='true');
    const statement=fixture.querySelector('.am-statement')!.textContent,input=fixture.querySelector<HTMLInputElement>('[data-memory-filter="text"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'literal-query-retained');input.dispatchEvent(new Event('input',{bubbles:true}));await wait(()=>fixture.querySelectorAll('[data-memory-record]').length===0);
    check('jump_keeps_hidden_selection_and_filter',(()=>{go.click();back.click();return fixture.querySelector('.am-statement')!.textContent===statement&&input.value==='literal-query-retained'&&fixture.querySelector('.am-inspector')===inspector;})());
  }
  back.focus();
  for(const language of ['zh-Hans','ja','en']){await setLang(language as Lang);await sleep();check(`${language}_links_keep_nodes_focus_and_raw_selection`,document.activeElement===back&&fixture.querySelector('.am-main')===main&&fixture.querySelector('.am-inspector')===inspector&&inspector.querySelector('.am-reading-jump')===back);}
}catch(error){checks.push({id:String(error),ok:false});}
finally{root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),dataset:DATASET});}
