// Legacy browser Vault reading sections retain draft and operation ownership.
import {createRef} from 'react';
import {createRoot} from 'react-dom/client';
import App from '../src/App';
import {demoData as D} from '../src/demo-data';
import {setLang,useLang,type Lang} from '../src/i18n';
const fixture=document.getElementById('fixture')!,root=createRoot(fixture),app=createRef<App>(),checks:{id:string;ok:boolean}[]=[];
const dataset=new URLSearchParams(location.search).get('vault-dataset')??'original';
const check=(id:string,ok:boolean)=>{checks.push({id,ok});if(!ok)throw Error(id);};
const sleep=()=>new Promise(resolve=>setTimeout(resolve,15));
async function wait(test:()=>boolean){for(let n=0;n<180;n++){if(test())return;await sleep();}throw Error('Vault reading timeout');}
try{
  document.documentElement.dataset.motion='reduced';
  function Surface(){useLang();return <App ref={app} memoryConnected={false} startPage="memory" breathing={false}/>;}
  root.render(<Surface/>);await wait(()=>!!fixture.querySelector('.vault-reading-nav'));
  if(dataset==='candidates'){fixture.querySelector<HTMLButtonElement>('.qr26')!.click();await wait(()=>fixture.querySelectorAll('.qr43').length===2);}
  const hash=location.hash,identity=fixture.querySelector('.qr51')?.textContent,originalState=JSON.stringify(app.current!.state.mems),originalData=JSON.stringify(D.MEM);
  for(const id of ['vault-collections','vault-list','vault-inspector']){fixture.querySelector<HTMLAnchorElement>(`.vault-reading-nav a[href="#${id}"]`)!.click();check(`${id}_focuses_section_without_navigation`,document.activeElement===fixture.querySelector('#'+id)&&location.hash===hash);}
  fixture.querySelector<HTMLAnchorElement>('.qr88 .vault-reading-return')!.click();
  check('inspector_return_keeps_selection',document.activeElement===fixture.querySelector('#vault-list')&&fixture.querySelector('.qr51')?.textContent===identity);
  if(dataset==='empty'){
    check('empty_links_do_not_create_memory',fixture.querySelectorAll('.qr43').length===0&&!fixture.querySelector('.qr51')&&D.MEM.length===0);
    const link=fixture.querySelector<HTMLAnchorElement>('.vault-reading-nav a')!;link.focus();
    for(const language of ['en','zh-Hans','ja']){await setLang(language as Lang);await sleep();check(`${language}_empty_focus_and_nodes_survive`,document.activeElement===link&&fixture.querySelector('.vault-reading-nav a')===link&&!fixture.querySelector('.qr53'));}
  }else{
    const original=fixture.querySelector('.qr52')!.textContent,inspector=fixture.querySelector('.qr88');
    fixture.querySelector<HTMLButtonElement>('.qr82')!.click();await wait(()=>!!fixture.querySelector('.qr53'));
    const field=fixture.querySelector<HTMLTextAreaElement>('.qr53')!,draft='Invented draft: preserve exact words.\nSecond line remains raw.';
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(field,draft);field.dispatchEvent(new Event('input',{bubbles:true}));await wait(()=>app.current!.state.draft===draft);field.focus();
    for(const language of ['zh-Hans','ja','en']){await setLang(language as Lang);await sleep();check(`${language}_draft_focus_identity_and_records_survive`,document.activeElement===field&&fixture.querySelector('.qr53')===field&&field.value===draft&&app.current!.state.draft===draft&&fixture.querySelector('.qr51')?.textContent===identity&&fixture.querySelector('.qr88')===inspector&&JSON.stringify(app.current!.state.mems)===originalState);}
    fixture.querySelector<HTMLAnchorElement>('.qr45 .vault-reading-return')!.click();fixture.querySelector<HTMLAnchorElement>('.qr88 .vault-reading-return')!.click();
    check('reading_roundtrip_does_not_save_or_promote',field.value===draft&&fixture.querySelector('.qr53')===field&&JSON.stringify(app.current!.state.mems)===originalState&&JSON.stringify(D.MEM)===originalData);
    fixture.querySelector<HTMLButtonElement>('.qr84')!.click();await wait(()=>!fixture.querySelector('.qr53'));
    check('existing_cancel_restores_original_without_commit',fixture.querySelector('.qr52')!.textContent===original&&JSON.stringify(app.current!.state.mems)===originalState);
  }
}catch(error){checks.push({id:String(error),ok:false});}
finally{root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),dataset});}
