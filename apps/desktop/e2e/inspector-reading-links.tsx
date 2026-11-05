// Fictional Runtime model only: selecting and reading never invokes native observations.
import {createRoot} from 'react-dom/client';
import App from '../src/App';
import {setLang,useLang,type Lang} from '../src/i18n';
const fixture=document.getElementById('fixture')!,root=createRoot(fixture),checks:{id:string;ok:boolean}[]=[];
const check=(id:string,ok:boolean)=>{checks.push({id,ok});if(!ok)throw Error(id);};
const sleep=()=>new Promise(resolve=>setTimeout(resolve,15));
async function wait(test:()=>boolean){for(let n=0;n<180;n++){if(test())return;await sleep();}throw Error('Inspector reading timeout');}
const originalMatch=globalThis.matchMedia;
try{
  globalThis.matchMedia=((q:string)=>q==='(max-width:899px)'?{matches:true} as MediaQueryList:originalMatch(q));
  document.documentElement.dataset.motion='reduced';
  function Surface(){useLang();return <App memoryConnected={false} startPage="runtime" breathing={false}/>;}
  root.render(<Surface/>);await wait(()=>!!fixture.querySelector('#runtime-reading'));
  const reader=fixture.querySelector('#runtime-reading'),strip=[...fixture.querySelectorAll('.qr193 .qr61')].map(e=>e.textContent),buttons=[...fixture.querySelectorAll<HTMLButtonElement>('.qr190')];
  check('fictional_component_catalog_is_present',buttons.length>0&&fixture.querySelector('.bg-app')?.getAttribute('data-runtime-mode')==='demo');
  for(const [i,button] of buttons.entries()){
    button.click();await wait(()=>button.getAttribute('data-selected')==='true');
    check(`component_${i}_focuses_existing_reading_panel`,document.activeElement===reader&&fixture.querySelector('.qr194')!.textContent===button.querySelector('.qr188')!.textContent&&fixture.querySelectorAll('.qr190[data-selected="true"]').length===1);
  }
  const selected=buttons.at(-1)!;selected.focus();
  for(const language of ['zh-Hans','ja','en']){await setLang(language as Lang);await sleep();check(`${language}_selection_focus_nodes_and_contract_values_survive`,document.activeElement===selected&&fixture.querySelector('#runtime-reading')===reader&&fixture.querySelectorAll('.qr190')[buttons.length-1]===selected&&selected.getAttribute('data-selected')==='true'&&fixture.querySelector('.qr194')!.textContent===selected.querySelector('.qr188')!.textContent&&[...fixture.querySelectorAll('.qr193 .qr61')].every((e,i)=>e.textContent===strip[i]));}
  fixture.querySelector<HTMLAnchorElement>('#runtime-reading .reader-return')!.click();check('return_focuses_components_without_selection_change',document.activeElement===fixture.querySelector('#runtime-components')&&selected.getAttribute('data-selected')==='true');
}catch(error){checks.push({id:String(error),ok:false});}
finally{globalThis.matchMedia=originalMatch;root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok)});}
