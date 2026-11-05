// Synthetic Context and Sessions: reading navigation preserves raw content and rows.
import {createRoot} from 'react-dom/client';
import App from '../src/App';
import {demoData as D} from '../src/demo-data';
import {setLang,useLang,type Lang} from '../src/i18n';
const fixture=document.getElementById('fixture')!,root=createRoot(fixture),checks:{id:string;ok:boolean}[]=[];
const dataset=new URLSearchParams(location.search).get('vault-dataset')??'original';
const check=(id:string,ok:boolean)=>{checks.push({id,ok});if(!ok)throw Error(id);};
const sleep=()=>new Promise(resolve=>setTimeout(resolve,15));
async function wait(test:()=>boolean){for(let n=0;n<200;n++){if(test())return;await sleep();}throw Error('Reader links timeout');}
const originalMatch=globalThis.matchMedia;
try{
  globalThis.matchMedia=((query:string)=>query==='(max-width:899px)'?{matches:true} as MediaQueryList:originalMatch(query));
  document.documentElement.dataset.motion='reduced';
  function Surface(){useLang();return <App memoryConnected={false} startPage="context" breathing={false}/>;}
  root.render(<Surface/>);await wait(()=>!!fixture.querySelector('.qr132'));
  check('fictional_scope_marker_is_explicit',fixture.querySelector('.bg-app')?.getAttribute('data-runtime-mode')==='demo');
  if(dataset==='original'){
    const cap=fixture.querySelector('.qr91')!.textContent,button=fixture.querySelector<HTMLButtonElement>('.qr114')!;button.click();await wait(()=>button.getAttribute('aria-expanded')==='true');
    const text=fixture.querySelector('.qr109')!.textContent,reader=fixture.querySelector('#context-reader');
    fixture.querySelector<HTMLButtonElement>('.qr104')!.click();
    check('section_jump_uses_existing_reader_and_capsule',document.activeElement===reader&&fixture.querySelector('.qr91')!.textContent===cap&&fixture.querySelector('.qr127')!.textContent!.includes(D.CAPHASH)&&button.getAttribute('aria-expanded')==='true');
    fixture.querySelector<HTMLAnchorElement>('.reader-return')!.click();check('context_return_focuses_section_navigation',document.activeElement===fixture.querySelector('#context-sections'));
    button.focus();for(const language of ['zh-Hans','ja','en']){await setLang(language as Lang);await sleep();check(`${language}_capsule_expansion_focus_and_raw_text_survive`,document.activeElement===button&&fixture.querySelector('.qr114')===button&&button.getAttribute('aria-expanded')==='true'&&fixture.querySelector('.qr109')!.textContent===text&&fixture.querySelector('.qr91')!.textContent===cap&&fixture.querySelector('.qr127')!.textContent!.includes(D.CAPHASH)&&fixture.querySelector('#context-reader')===reader);}
  }else check('empty_context_does_not_invent_capsule',!fixture.querySelector('#context-reader')&&!fixture.querySelector('.qr127')&&!!fixture.querySelector('.demo-empty'));
  fixture.querySelector<HTMLButtonElement>('[data-runtime-page="sessions"]')!.click();await wait(()=>!!fixture.querySelector('#session-reader'));
  const reader=fixture.querySelector('#session-reader'),events=[...fixture.querySelectorAll('.bg-turn')],texts=events.map(e=>e.querySelector('.qr146')?.textContent),gaps=events.map(e=>(e as HTMLElement).style.getPropertyValue('--gap'));
  for(const id of ['session-list','session-reader','session-info']){fixture.querySelector<HTMLAnchorElement>(`.reader-section-nav a[href="#${id}"]`)!.click();check(`${id}_focus_does_not_change_transcript`,document.activeElement===fixture.querySelector('#'+id)&&fixture.querySelectorAll('.bg-turn').length===events.length);}
  const link=fixture.querySelector<HTMLAnchorElement>('.reader-section-nav a[href="#session-reader"]')!;link.focus();
  for(const language of ['zh-Hans','ja','en']){await setLang(language as Lang);await sleep();check(`${language}_transcript_nodes_raw_text_gaps_and_focus_survive`,document.activeElement===link&&fixture.querySelector('#session-reader')===reader&&events.every((e,i)=>fixture.querySelectorAll('.bg-turn')[i]===e&&e.querySelector('.qr146')?.textContent===texts[i]&&(e as HTMLElement).style.getPropertyValue('--gap')===gaps[i]));}
  check('only_existing_sample_events_are_shown',dataset==='original'?events.length===13:events.length===0&&!!fixture.querySelector('.demo-empty'));
}catch(error){checks.push({id:String(error),ok:false});}
finally{globalThis.matchMedia=originalMatch;root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),dataset});}
