// Mounted component + controlled native transport. No browser or OS evidence.
import { createRoot } from 'react-dom/client';
import { CatalogMemory } from '../src/memory/CatalogMemory';
import { setCatalogTransport } from '../src/memory/catalog';
import { setLang, useLang, type Lang } from '../src/i18n';
import { status, page, stats } from './fixtures/catalog.mjs';
const fixture=document.getElementById('fixture')!,root=createRoot(fixture);
const checks:{id:string;ok:boolean}[]=[],calls:Record<string,any>[]=[];
let state='disabled',holdStats=false,holdStatus=false,failStats=false,busyStatus=false,expired=false,scope='b'.repeat(64);
let releaseStats:(()=>void)|null=null,releaseStatus:(()=>void)|null=null;
setCatalogTransport(async(command,args)=>{
  if(command!=='memory_catalog')throw new Error('Unexpected channel');
  const query=(args as any).request.query;calls.push(structuredClone(query));
  if(query.operation==='status'){
    const result=status(state);
    if(result.selection)result.selection={...result.selection,scope_hash:scope};
    if(busyStatus){busyStatus=false;throw 'catalog_busy';}
    if(holdStatus){holdStatus=false;await new Promise<void>(resolve=>{releaseStatus=resolve;});}
    return result;
  }
  if(query.operation==='page'){
    const result=page(query.filter.text,query.cursor);result.selection={...result.selection,scope_hash:scope};
    if(result.next)result.next.selection=result.selection;
    return expired?{...result,items:[],matched_in_scope:0,unknown_time_in_scope:0,next:null,complete_in_scope:true}:result;
  }
  if(query.operation==='stats'){
    if(failStats){failStats=false;throw 'catalog_stale';}
    if(holdStats){holdStats=false;await new Promise<void>(resolve=>{releaseStats=resolve;});}
    return stats(query.selection,expired?0:query.filter.text?1:3);
  }
  if(query.operation==='lock'||query.operation==='unlock'){state=query.operation==='lock'?'locked':'open';return {...status(state),effect:'native_control'};}
  throw new Error('Unexpected operation');
});
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const text=()=>fixture.textContent??'';
const button=(label:string)=>[...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label);
const click=(label:string)=>{const b=button(label);if(!b||b.disabled)throw new Error(`Unavailable ${label}`);b.click();};
const check=(id:string,ok:boolean)=>checks.push({id,ok});
async function wait(test:()=>boolean){for(let n=0;n<350;n++){if(test())return;await sleep(20);}throw new Error(`UI timeout: ${text()}`);}
const reads=()=>calls.filter(c=>c.operation!=='status').length;
try{
  function Surface(){useLang();return <CatalogMemory/>;}
  root.render(<Surface/>);
  await wait(()=>text().includes('No segmented synthetic library is enabled'));
  check('disabled_is_explicit_without_page_or_stats',reads()===0&&!text().includes('Page statistics were read'));
  holdStats=true;state='open';
  await wait(()=>releaseStats!==null);
  check('counts_and_records_wait_for_same_selection_stats',!text().includes('Synthetic item 1')&&!text().includes('matching authorized records')&&!text().includes('Page statistics were read'));
  releaseStats!();releaseStats=null;
  await wait(()=>text().includes('2 shown · 3 matching authorized records'));
  check('synthetic_authorized_scope_and_unknown_dates_are_explicit',text().includes('Isolated synthetic read-2')&&text().includes('currently authorized machine revisions')&&text().includes('3 records have unknown event dates'));
  check('record_text_is_literal_not_markup',text().includes('<img id="catalog-injected"')&&!fixture.querySelector('#catalog-injected'));
  click('Next catalog page');await wait(()=>text().includes('1 shown · 3 matching authorized records'));
  check('next_page_uses_core_cursor_and_replaces_rows',!text().includes('Synthetic item 1')&&text().includes('Synthetic item 3')&&!button('Next catalog page')&&calls.filter(c=>c.operation==='page').at(-1)!.cursor.after==='synthetic-memory-2');
  const input=fixture.querySelector<HTMLInputElement>('input')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'调试');
  input.dispatchEvent(new Event('input',{bubbles:true}));await sleep(30);input.focus();
  const beforeLanguage=reads(),row=fixture.querySelector('li');
  for(const [language,heading] of [['zh-Hans','分段合成目录'],['ja','分割形式の合成カタログ'],['en','Segmented synthetic catalog']]){
    await setLang(language as Lang);await wait(()=>text().includes(heading));
    check(`${language}_language_preserves_rows_draft_focus_and_requests`,fixture.querySelector('li')===row&&fixture.querySelector('input')===input&&input.value==='调试'&&document.activeElement===input&&reads()===beforeLanguage);
  }
  fixture.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await wait(()=>text().includes('1 shown · 1 matching authorized records'));
  check('explicit_search_reads_new_scope_and_preserves_raw_chinese',text().includes('调试偏好')&&text().includes('合成示例：我喜欢详细的调试说明。')&&input.value==='调试'&&calls.filter(c=>c.operation==='page').at(-1)!.filter.text==='调试');
  failStats=true;click('Refresh catalog');await wait(()=>!!fixture.querySelector('[role=alert]'));
  check('stats_failure_withdraws_records_and_counts',!text().includes('matching authorized records')&&!fixture.querySelector('li')&&text().includes('No catalog page is currently observed.'));
  const failedReads=reads();await sleep(100);
  check('failed_page_stats_are_not_automatically_replayed',reads()===failedReads);
  click('Refresh catalog');await wait(()=>text().includes('1 shown · 1 matching authorized records'));
  check('explicit_refresh_recovers_same_filter',calls.filter(c=>c.operation==='page').at(-1)!.filter.text==='调试');
  holdStats=true;click('Refresh catalog');await wait(()=>releaseStats!==null);
  state='locked';await wait(()=>text().includes('Library: locked'));
  releaseStats!();releaseStats=null;await sleep(60);
  check('late_counts_do_not_reappear_after_external_lock',!fixture.querySelector('li')&&!text().includes('matching authorized records')&&input.value==='调试');
  click('Unlock synthetic library');await wait(()=>text().includes('1 shown · 1 matching authorized records'));
  holdStatus=true;await wait(()=>releaseStatus!==null);
  click('Lock synthetic library');await wait(()=>text().includes('Library: locked'));
  releaseStatus!();releaseStatus=null;await sleep(60);
  check('late_open_status_cannot_reverse_local_lock',text().includes('Library: locked')&&!fixture.querySelector('li'));
  check('lock_control_was_sent_once',calls.filter(c=>c.operation==='lock').length===1);
  click('Unlock synthetic library');await wait(()=>text().includes('1 shown · 1 matching authorized records'));
  input.focus();busyStatus=true;await wait(()=>!busyStatus);await sleep(30);
  check('busy_status_hides_observations_but_keeps_draft_and_focus',!fixture.querySelector('li')&&fixture.querySelector('input')===input&&input.value==='调试'&&document.activeElement===input);
  const busyReads=reads();
  for(const [language,error]of [['zh-Hans','自动记忆正忙。请稍后再读取。'],['ja','自動記憶は処理中です。少ししてから読み直してください。'],['en','Automatic Memory is busy. Try the read again shortly.']]){
    await setLang(language as Lang);await wait(()=>!!fixture.querySelector('[role=alert]')?.textContent?.includes(error));
    check(`${language}_busy_error_translates_without_read_replay`,reads()===busyReads&&input.value==='调试');
  }
  await wait(()=>!!fixture.querySelector('li'));
  check('successful_status_restores_same_held_page_without_replay',reads()===busyReads);
  holdStats=true;expired=true;scope='e'.repeat(64);
  await wait(()=>releaseStats!==null);
  check('changed_authorized_scope_withdraws_old_rows_before_new_stats',!fixture.querySelector('li')&&!text().includes('matching authorized records')&&input.value==='调试');
  releaseStats!();releaseStats=null;
  await wait(()=>text().includes('0 shown · 0 matching authorized records'));
  check('scope_change_can_be_empty_without_a_new_commit_or_draft_loss',!fixture.querySelector('li')&&input.value==='调试');
  check('only_closed_read2_operations_were_used',calls.every(c=>['status','page','stats','lock','unlock'].includes(c.operation)));
}catch(error){checks.push({id:String(error),ok:false});}
finally{releaseStats?.();releaseStatus?.();root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),calls});}
