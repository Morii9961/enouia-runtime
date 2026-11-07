// Actual browser App and all surfaces; fictional data only, no IPC.
import { createRef } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import { demoData as D } from '../src/demo-data';
import { setLang, useLang, type Lang } from '../src/i18n';
const fixture=document.getElementById('fixture')!,root=createRoot(fixture),app=createRef<App>();
const asked=new URLSearchParams(location.search).get('vault-dataset');
const dataset=asked==='empty'||asked==='candidates'?asked:'original';
const checks:{id:string;ok:boolean;reason?:string}[]=[];
const check=(id:string,ok:boolean)=>checks.push({id,ok});
const sleep=()=>new Promise(resolve=>setTimeout(resolve,15));
async function wait(test:()=>boolean){for(let i=0;i<250;i++){if(test())return;await sleep();}throw Error('Vault sample timeout');}
const page=(name:string)=>fixture.querySelector<HTMLButtonElement>(`[data-runtime-page="${name}"]`)!;
try{
  document.documentElement.dataset.motion='reduced';await setLang('en');
  // Reproduce the fixed-reference failure without sending a React update that crashes the root.
  const probe=new App({memoryConnected:false,breathing:false});
  if(dataset!=='original')probe.state={...probe.state,mems:dataset==='empty'?[]:D.MEM.filter(m=>m.status==='candidate')};
  try{const view=probe.renderVals();check('sample_projects_without_dangling_references',dataset==='original'||view.ctx===null&&view.ses===null);}
  catch(error){checks.push({id:'sample_projects_without_dangling_references',ok:false,reason:String(error)});}
  check('explicit_dataset_is_selected',dataset==='empty'?D.MEM.length===0&&D.SESS.length===0&&D.CTX.length===0:dataset==='candidates'?D.MEM.length===2&&D.MEM.every(m=>m.status==='candidate'&&m.src.kind==='import')&&D.SESS.length===0&&D.CTX.length===0:D.MEM.length===14);
  function Surface(){useLang();return <App ref={app} memoryConnected={false} startPage="memory" breathing={false}/>;}
  root.render(<Surface/>);await wait(()=>!!page('memory'));
  for(const language of ['en','zh-Hans','ja'] as Lang[]){
    await setLang(language);
    for(const name of ['home','memory','context','sessions','runtime','settings']){
      page(name).click();await wait(()=>page(name).getAttribute('aria-current')==='page');
      check(`${language}_${name}_renders_without_invalid_time`,!!fixture.querySelector('[data-screen-label]')&&!fixture.textContent!.includes('NaN')&&!fixture.textContent!.includes('Invalid Date'));
      if(dataset==='original')continue;
      if(name==='memory')check(`${language}_no_fabricated_canonical_selection`,fixture.querySelectorAll('.qr43').length===0&&!fixture.querySelector('.qr51')&&!!fixture.querySelector('a[href*="vault-dataset=original"]'));
      if(name==='context')check(`${language}_no_fabricated_capsule`,!fixture.querySelector('.qr127')&&!fixture.textContent!.includes(D.CAP)&&!!fixture.querySelector('a[href*="vault-dataset=original"]'));
      if(name==='sessions')check(`${language}_no_fabricated_session_or_checkpoint`,fixture.querySelectorAll('.qr134,.qr163').length===0&&!!fixture.querySelector('a[href*="vault-dataset=original"]'));
      if(name==='home')check(`${language}_no_fabricated_home_checkpoint_or_timestamps`,fixture.querySelectorAll<HTMLButtonElement>('.bg-notes button')[3]?.disabled===true&&!fixture.querySelector('.bg-home-chart')?.textContent?.includes(D.short(D.CAP)));
    }
  }
  await setLang('en');page('memory').click();await wait(()=>!!fixture.querySelector('.qr89'));
  if(dataset==='candidates'){
    [...fixture.querySelectorAll<HTMLButtonElement>('.qr26')].find(b=>b.textContent!.includes('Candidate inbox'))!.click();
    await wait(()=>!!fixture.querySelector('.qr81'));
    check('only_imported_candidates_are_in_inbox',fixture.querySelectorAll('.qr43').length===2&&fixture.querySelectorAll('.qr43[data-status="candidate"]').length===2);
    const original=fixture.querySelector('.qr52')!.textContent!;fixture.querySelector<HTMLButtonElement>('.qr81')!.click();
    await wait(()=>!!app.current!.state.mems?.some(m=>m.status==='active'));
    check('explicit_approval_changes_only_window_model',app.current!.state.mems!.filter(m=>m.status==='active').length===1&&fixture.querySelector('.qr52')?.textContent===original&&D.MEM.every(m=>m.status==='candidate'));
    page('home').click();await wait(()=>!!fixture.querySelector('.bg-home-sub'));
    check('approval_does_not_invent_capsule_session_or_checkpoint',app.current!.renderVals().ctx===null&&app.current!.renderVals().ses===null&&fixture.querySelectorAll<HTMLButtonElement>('.bg-notes button')[3]?.disabled===true);
  }
}catch(error){checks.push({id:String(error),ok:false});}
finally{root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),dataset});}
