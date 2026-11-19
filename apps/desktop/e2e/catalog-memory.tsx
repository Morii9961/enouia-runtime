// Mounted component + controlled native transport. No browser or OS evidence.
import { createRoot } from 'react-dom/client';
import { CatalogMemory } from '../src/memory/CatalogMemory';
import { setCatalogTransport } from '../src/memory/catalog';
import { setLang, useLang, type Lang } from '../src/i18n';
import { status, page, stats, detail, source, quote } from './fixtures/catalog.mjs';
const fixture=document.getElementById('fixture')!,root=createRoot(fixture);
const checks:{id:string;ok:boolean}[]=[],calls:Record<string,any>[]=[];
let state='disabled',holdStats=false,holdStatus=false,failStats=false,busyStatus=false,expired=false,scope='b'.repeat(64);
let mode='synthetic_segmented_only';
let releaseStats:(()=>void)|null=null,releaseStatus:(()=>void)|null=null;
let holdDetail=false,holdSource=false,failDetail=false;
let releaseDetail:(()=>void)|null=null,releaseSource:(()=>void)|null=null;
const secondSourceRef={source_id:'synthetic-second-source',source_revision:1};
setCatalogTransport(async(command,args)=>{
  if(command!=='memory_catalog')throw new Error('Unexpected channel');
  const query=(args as any).request.query;calls.push(structuredClone(query));
  if(query.operation==='status'){
    const result={...status(state),mode};
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
  if(query.operation==='detail'){
    if(failDetail){failDetail=false;throw 'catalog_busy';}
    const result=detail(query.memory_id);result.header.selection={...result.header.selection,scope_hash:scope};
    if(query.memory_id==='synthetic-memory-1'){
      const first=result.fields.evidence[0];
      result.fields.evidence.push({...first,reference:{...first.reference,...secondSourceRef}});
    }
    if(holdDetail){holdDetail=false;await new Promise<void>(resolve=>{releaseDetail=resolve;});}
    return result;
  }
  if(query.operation==='source'){
    const result=source(query.start,query.limit);result.header.selection={...result.header.selection,scope_hash:scope};
    if(query.source.source_id===secondSourceRef.source_id){
      result.source=secondSourceRef;
      result.source_record={...result.source_record,reference:secondSourceRef,original_message_id:'synthetic-second-message'};
    }
    if(holdSource){holdSource=false;await new Promise<void>(resolve=>{releaseSource=resolve;});}
    return result;
  }
  if(query.operation==='lock'||query.operation==='unlock'){state=query.operation==='lock'?'locked':'open';return {...status(state),mode,effect:'native_control'};}
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
  await wait(()=>fixture.querySelector('[aria-busy]')?.getAttribute('aria-busy')==='true');
  check('pending_counts_have_visible_reading_feedback',text().includes('Reading catalog page and statistics…'));
  const pendingReads=reads();
  for(const [language,message]of [['zh-Hans','正在读取目录页和统计…'],['ja','カタログページと統計を読み込み中…'],['en','Reading catalog page and statistics…']]){
    await setLang(language as Lang);await sleep(30);
    check(`${language}_pending_feedback_translates_without_replay`,text().includes(message)&&reads()===pendingReads&&!fixture.querySelector('li'));
  }
  check('counts_and_records_wait_for_same_selection_stats',!text().includes('Synthetic item 1')&&!text().includes('matching authorized records')&&!text().includes('Page statistics were read'));
  releaseStats!();releaseStats=null;
  await wait(()=>text().includes('2 shown · 3 matching authorized records'));
  check('synthetic_authorized_scope_and_unknown_dates_are_explicit',text().includes('Isolated synthetic read-2')&&text().includes('currently authorized machine revisions')&&text().includes('3 records have unknown event dates'));
  check('record_text_is_literal_not_markup',text().includes('<img id="catalog-injected"')&&!fixture.querySelector('#catalog-injected'));
  click('Synthetic item 1');await wait(()=>text().includes('Synthetic detail'));
  check('detail_is_read_without_automatically_reading_source',calls.filter(c=>c.operation==='detail').length===1&&!calls.some(c=>c.operation==='source'));
  click('Read quoted source');await wait(()=>!!fixture.querySelector('section[aria-label="Quoted source excerpt"]'));
  check('exact_unicode_source_is_literal_and_attributed',text().includes(quote)&&!fixture.querySelector('#catalog-source-injected')&&text().includes('synthetic-conversation')&&text().includes('synthetic-message'));
  const sourceButtons=[...fixture.querySelectorAll<HTMLButtonElement>('section[aria-label="Catalog record detail"] li button')];
  check('identical_quotes_have_distinct_accessible_actions',sourceButtons.map(b=>b.getAttribute('aria-label')).join('|')==='Read quoted source 1|Read quoted source 2');
  sourceButtons[1].click();
  await wait(()=>fixture.querySelector('section[aria-label="Quoted source excerpt"]')?.textContent?.includes('synthetic-second-message')===true);
  check('identical_quote_reads_the_selected_second_origin',calls.at(-1)?.source?.source_id===secondSourceRef.source_id&&fixture.querySelector('section[aria-label="Quoted source excerpt"] blockquote')?.textContent===quote);
  failDetail=true;click('Refresh record detail');await wait(()=>!!fixture.querySelector('section[aria-label="Catalog record detail"] [role=alert]'));
  check('detail_failure_withdraws_previous_source',!fixture.querySelector('section[aria-label="Quoted source excerpt"]'));
  click('Refresh record detail');await wait(()=>!!button('Read quoted source'));
  holdSource=true;click('Read quoted source');await wait(()=>releaseSource!==null);
  click('调试偏好');await wait(()=>!!button('Read quoted source'));
  releaseSource!();releaseSource=null;await sleep(40);
  check('late_source_cannot_publish_under_another_record',!fixture.querySelector('section[aria-label="Quoted source excerpt"]'));
  holdDetail=true;click('Synthetic item 1');await wait(()=>releaseDetail!==null);
  click('调试偏好');await wait(()=>!!button('Read quoted source'));
  releaseDetail!();releaseDetail=null;await sleep(40);
  check('late_detail_cannot_replace_current_record',fixture.querySelector('section[aria-label="Catalog record detail"]')!.textContent!.includes('synthetic-memory-2')&&!fixture.querySelector('section[aria-label="Catalog record detail"]')!.textContent!.includes('synthetic-memory-1'));
  click('Next catalog page');await wait(()=>text().includes('1 shown · 3 matching authorized records'));
  check('page_change_withdraws_detail_and_source',!fixture.querySelector('section[aria-label="Catalog record detail"]'));
  check('next_page_uses_core_cursor_and_replaces_rows',!text().includes('Synthetic item 1')&&text().includes('Synthetic item 3')&&!button('Next catalog page')&&calls.filter(c=>c.operation==='page').at(-1)!.cursor.after==='synthetic-memory-2');
  const input=fixture.querySelector<HTMLInputElement>('input')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'调试');
  input.dispatchEvent(new Event('input',{bubbles:true}));await sleep(30);input.focus();
  const beforeLanguage=reads(),row=fixture.querySelector('li');
  for(const [language,heading] of [['zh-Hans','原生记忆目录'],['ja','ネイティブ記憶カタログ'],['en','Native memory catalog']]){
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
  click('调试偏好');await wait(()=>!!button('Read quoted source'));
  holdSource=true;click('Read quoted source');await wait(()=>releaseSource!==null);
  holdStatus=true;await wait(()=>releaseStatus!==null);
  click('Lock synthetic library');await wait(()=>text().includes('Library: locked'));
  releaseStatus!();releaseStatus=null;releaseSource!();releaseSource=null;await sleep(60);
  check('late_source_cannot_reappear_after_lock',!fixture.querySelector('section[aria-label="Catalog record detail"]')&&!fixture.querySelector('section[aria-label="Quoted source excerpt"]'));
  check('late_open_status_cannot_reverse_local_lock',text().includes('Library: locked')&&!fixture.querySelector('li'));
  check('lock_control_was_sent_once',calls.filter(c=>c.operation==='lock').length===1);
  click('Unlock synthetic library');await wait(()=>text().includes('1 shown · 1 matching authorized records'));
  input.focus();busyStatus=true;await wait(()=>!busyStatus);await sleep(30);
  check('busy_status_hides_observations_but_keeps_draft_and_focus',!fixture.querySelector('li')&&fixture.querySelector('input')===input&&input.value==='调试'&&document.activeElement===input);
  check('failed_status_is_unknown_not_still_reading',text().includes('Library state is unknown.')&&!text().includes('Reading library state…'));
  const busyReads=reads();
  for(const [language,error]of [['zh-Hans','自动记忆正忙。请稍后再读取。'],['ja','自動記憶は処理中です。少ししてから読み直してください。'],['en','Automatic Memory is busy. Try the read again shortly.']]){
    await setLang(language as Lang);await wait(()=>!!fixture.querySelector('[role=alert]')?.textContent?.includes(error));
    check(`${language}_busy_error_translates_without_read_replay`,reads()===busyReads&&input.value==='调试');
  }
  await wait(()=>!!fixture.querySelector('li'));
  check('successful_status_restores_same_held_page_without_replay',reads()===busyReads);
  holdStats=true;expired=true;scope='e'.repeat(64);
  await wait(()=>releaseStats!==null);
  // The stats request can precede React's commit of the withdrawal; it stays held here.
  await wait(()=>!fixture.querySelector('li')&&!text().includes('matching authorized records'));
  check('changed_authorized_scope_withdraws_old_rows_before_new_stats',releaseStats!==null&&input.value==='调试');
  releaseStats!();releaseStats=null;
  await wait(()=>text().includes('0 shown · 0 matching authorized records'));
  check('scope_change_can_be_empty_without_a_new_commit_or_draft_loss',!fixture.querySelector('li')&&input.value==='调试');
  const noMatch='No authorized record matches this search. Search with an empty field to see the whole catalog.';
  check('empty_search_result_explains_next_step',text().includes(noMatch));
  const emptyReads=reads();
  for(const [language,message]of [['zh-Hans','没有授权记录与这次检索匹配。清空检索框再检索，可查看整个目录。'],['ja','この検索に一致する許可済みの記録はありません。検索欄を空にして検索すると、カタログ全体を表示できます。'],['en',noMatch]]){
    await setLang(language as Lang);await sleep(30);
    check(`${language}_empty_search_notice_translates_without_replay`,text().includes(message)&&reads()===emptyReads);
  }
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'');
  input.dispatchEvent(new Event('input',{bubbles:true}));await sleep(30);
  fixture.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  const noRecords='This synthetic catalog has no records in the current authorized scope.';
  let emptyCatalog=false;for(let n=0;n<100&&!emptyCatalog;n++){emptyCatalog=text().includes(noRecords)&&calls.filter(c=>c.operation==='page').at(-1)!.filter.text==='';await sleep(20);}
  check('empty_catalog_without_search_says_no_records',emptyCatalog&&!text().includes(noMatch));
  mode='registered_owner_readonly';scope='f'.repeat(64);
  await wait(()=>text().includes('Registered library · read only'));
  await wait(()=>text().includes('0 shown · 0 matching authorized records'));
  check('registered_mode_is_explicit_without_fictional_library_claim',text().includes('explicitly registered library')&&!text().includes('fixed fictional records')&&!text().includes('synthetic subject'));
  const registeredEmpty='This registered catalog has no records in the current authorized scope.';
  check('registered_empty_scope_does_not_claim_a_synthetic_catalog',text().includes(registeredEmpty)&&!text().includes(noRecords));
  const registeredEmptyReads=reads();
  for(const [language,message]of [['zh-Hans','此已登记目录的当前授权范围内没有记录。'],['ja','この登録済みカタログの現在の許可範囲には記録がありません。'],['en',registeredEmpty]]){
    await setLang(language as Lang);await sleep(30);
    check(`${language}_registered_empty_scope_translates_without_replay`,text().includes(message)&&reads()===registeredEmptyReads);
  }
  click('Lock registered library');await wait(()=>text().includes('Library: locked'));
  check('registered_lock_requires_explicit_native_reopen_without_page_unlock',!button('Unlock synthetic library')&&text().includes('Exit Runtime')&&!fixture.querySelector('li'));
  check('only_closed_read2_operations_were_used',calls.every(c=>['status','page','stats','detail','source','lock','unlock'].includes(c.operation)));
}catch(error){checks.push({id:String(error),ok:false});}
finally{releaseStats?.();releaseStatus?.();releaseDetail?.();releaseSource?.();root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),calls});}
