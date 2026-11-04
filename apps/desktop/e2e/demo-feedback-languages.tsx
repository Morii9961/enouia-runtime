// Actual browser-demo shell, mocked clipboard; no native IPC or system clipboard.
import { createRef } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import { demoData } from '../src/demo-data';
import { setLang, t, useLang, type Lang } from '../src/i18n';
const fixture=document.getElementById('fixture')!,root=createRoot(fixture),app=createRef<App>();
const checks:{id:string;ok:boolean}[]=[];
const check=(id:string,ok:boolean)=>checks.push({id,ok});
const sleep=()=>new Promise(resolve=>setTimeout(resolve,20));
async function wait(test:()=>boolean){for(let i=0;i<250;i++){if(test())return;await sleep();}throw Error('Demo feedback timeout');}
const notice=()=>fixture.querySelector('.qr80')?.textContent?.trim();
const click=(selector:string)=>{const button=fixture.querySelector<HTMLButtonElement>(selector);if(!button||button.disabled)throw Error('Missing '+selector);button.click();};
const original=JSON.stringify(demoData.MEM),clipboard=Object.getOwnPropertyDescriptor(navigator,'clipboard');
let copies=0,clockReads=0,failCopy=false;
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{copies++;if(failCopy)throw Error('Synthetic clipboard refusal');}}});
const blankCandidate={en:'Enter memory content before promoting.','zh-Hans':'请先输入记忆内容，再提升候选。',ja:'候補を正式な記憶にする前に内容を入力してください。'};
const blankRevision={en:'Enter memory content before saving.','zh-Hans':'请先输入记忆内容，再保存。',ja:'保存する前に記憶の内容を入力してください。'};
async function languages(name:string,key:string,expected?:Record<Lang,string>,field:HTMLElement=fixture.querySelector('.qr21')!){
  const identity=fixture.querySelector('.qr51')?.textContent,text=fixture.querySelector('.qr52')?.textContent,draft=app.current!.state.draft;
  const feedback=app.current!.state.notice,copied=app.current!.state.copied;
  const state=JSON.stringify(app.current!.state.mems),actions=clockReads,writes=copies;
  field.focus();
  for(const language of ['en','zh-Hans','ja','en'] as Lang[]){
    await setLang(language);await sleep();
    check(`${name}_${language}_notice_follows_language`,notice()===(expected?expected[language]:t(key)));
    check(`${name}_${language}_keeps_record_draft_focus_and_action_count`,fixture.querySelector('.qr51')?.textContent===identity&&fixture.querySelector('.qr52')?.textContent===text&&app.current!.state.draft===draft&&document.activeElement===field&&JSON.stringify(app.current!.state.mems)===state&&app.current!.state.notice===feedback&&app.current!.state.copied===copied&&clockReads===actions&&copies===writes);
  }
}
async function edit(value:string){
  const field=fixture.querySelector<HTMLTextAreaElement>('textarea.qr53')!;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(field,value);
  field.dispatchEvent(new Event('input',{bubbles:true}));await wait(()=>app.current!.state.draft===value);return field;
}
try{
  await setLang('en');document.documentElement.dataset.motion='reduced';
  function Surface(){useLang();return <App ref={app} memoryConnected={false} startPage="memory" breathing={false}/>;}
  root.render(<Surface/>);await wait(()=>!!fixture.querySelector('.qr49'));
  app.current!.now=()=>{clockReads++;return '2026-11-04T07:30:00.000Z';};
  click('.qr49');await wait(()=>!!notice());
  await languages('copy_success','ID copied.');
  failCopy=true;click('.qr49');await wait(()=>app.current!.state.copied===false);
  await languages('copy_failure','Could not copy. Select the ID and copy it manually.');
  [...fixture.querySelectorAll<HTMLButtonElement>('.qr26')].find(b=>b.textContent!.includes('Candidate inbox'))!.click();
  await wait(()=>!!fixture.querySelector('.qr81'));click('.qr82');await wait(()=>!!fixture.querySelector('textarea'));
  const candidateField=await edit(' \n ');click('.qr83');await wait(()=>!!notice());
  await languages('candidate_blank',blankCandidate.en,blankCandidate,candidateField);
  const candidateText='Synthetic reviewed text <packet> 原文 unknown/key-01';
  await edit(candidateText);click('.qr83');await wait(()=>!fixture.querySelector('textarea')&&fixture.querySelector('.qr52')?.textContent===candidateText);
  await languages('approval_success','Demo approval complete · kept in this window only. Reload clears demo changes.');
  const approved=app.current!.state.mems!.filter(m=>m.content===candidateText);
  check('one_approval_keeps_original_proposal',approved.length===1&&!!approved[0].originalProposal&&approved[0].status==='active');
  [...fixture.querySelectorAll<HTMLButtonElement>('.qr43')].find(b=>b.textContent!.includes('Vault generations design is settled'))!.click();
  await wait(()=>fixture.querySelector('.qr52')?.textContent?.startsWith('Vault generations design is settled')===true);
  click('.qr82');await wait(()=>!!fixture.querySelector('textarea'));const revisionField=await edit('');click('.qr83');await wait(()=>!!notice());
  await languages('revision_blank',blankRevision.en,blankRevision,revisionField);
  const revisionText='Synthetic revised text — keep original packet/key-02 未知';
  await edit(revisionText);click('.qr83');await wait(()=>!fixture.querySelector('textarea')&&fixture.querySelector('.qr52')?.textContent===revisionText);
  await languages('revision_success','Demo revision created · previous version retained in this window. Reload clears demo changes.');
  const memories=app.current!.state.mems!,revisions=memories.filter(m=>m.content===revisionText);
  check('one_revision_retains_previous_identity',revisions.length===1&&revisions[0].supersedes==='m1'&&memories.find(m=>m.key==='m1')?.supersededBy===revisions[0].key);
  check('only_explicit_actions_run_and_original_fixture_is_unchanged',copies===2&&clockReads===4&&JSON.stringify(demoData.MEM)===original);
}catch(error){checks.push({id:String(error),ok:false});}
finally{root.unmount();if(clipboard)Object.defineProperty(navigator,'clipboard',clipboard);else Reflect.deleteProperty(navigator,'clipboard');document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),copies,clockReads});}
