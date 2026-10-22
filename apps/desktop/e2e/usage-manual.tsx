// Real components with a synthetic native transport; no local roots are read.
import {createRoot} from 'react-dom/client';
import {UsageProvider} from '../src/usage/UsageProvider';
import UsageSurface from '../src/usage/UsageSurface';
import {setUsageTransport} from '../src/usage/client';
import {overview,candidate,review,sealed} from '../tests/usage-fixtures.mjs';
import '../src/quiet-runtime.css';import '../src/memory/memory.css';import '../src/usage/usage.css';
const fixture=document.getElementById('fixture')!,root=createRoot(fixture),checks:{id:string;ok:boolean}[]=[];
const calls:{command:string;args:Record<string,unknown>}[]=[];
let choice=0,scanRelease:(()=>void)|null=null,scanReject:((e:unknown)=>void)|null=null,holdScan=false,stale=true,adopted=false;
setUsageTransport(async(command,args)=>{
  calls.push({command,args});
  if(command==='usage_pick')return{token:`usage-choice-${choice++}`};
  if(command==='usage_cancel'){scanReject?.('usage_cancelled');scanReject=null;return{stopped:true};}
  const r=args.request as {source:'codex_local'|'claude_local';action:{operation:string;cursor?:string|null;candidate?:ReturnType<typeof candidate>;review_token?:string}};
  if(r.action.operation==='scan'&&holdScan){holdScan=false;await new Promise<void>((resolve,reject)=>{scanRelease=resolve;scanReject=reject;});scanReject=null;}
  if(r.action.operation==='candidates'){const second=!!r.action.cursor,c=candidate(second?'e':'a');return{version:1,result:{page:{items:[c],next_cursor:second?null:sealed('page',c,r.source)}}};}
  if(r.action.operation==='inspect')return{version:1,result:review(r.action.candidate)};
  if(r.action.operation==='resolve'){if(stale){stale=false;throw'usage_stale_read';}adopted=true;}
  const v=overview(r.source);if(adopted){v.health.conflicts=0;v.health.revision=3;v.counts.input_total='13';v.counts.input_uncached='13';}
  if(r.action.operation==='export')return{version:1,result:{health:v.health,exported:true}};
  return{version:1,result:v};
});
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const text=()=>fixture.textContent??'';
const button=(label:string)=>[...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label);
const click=(b:HTMLButtonElement|null|undefined)=>{if(!b||b.disabled)throw new Error('Unavailable control');b.click();};
async function wait(test:()=>boolean){for(let i=0;i<250;i++){if(test())return;await sleep(20);}throw new Error(`UI timeout: ${text()}`);}
const check=(id:string,ok:boolean)=>checks.push({id,ok});
function mount(key:string,native=true){root.render(<UsageProvider key={key} native={native}><UsageSurface/></UsageProvider>);}
try{
  mount('native');await wait(()=>!!button('选择程序包…'));
  check('initial_state_has_no_automatic_native_reads',calls.length===0&&text().includes('尚未读取的数据不会以演示数字代替'));
  check('source_scan_disabled_until_explicit_roots',button('采集所选目录')?.disabled===true);
  click(button('选择程序包…'));await wait(()=>!!button('更换程序包…')&&!button('打开账本…')?.disabled);
  click(button('打开账本…'));await wait(()=>text().includes('9,007,199,254,740,993'));
  check('large_count_and_unknown_subset_are_literal',text().includes('9,007,199,254,740,993')&&text().includes('未报告')&&text().includes('其中：推理输出'));
  check('coverage_and_last_completed_are_visible',text().includes('保留但未重新观测的文件')&&text().includes('最近完成采集'));
  click(button('添加日志目录…'));await wait(()=>text().includes('已授权目录 1'));
  holdScan=true;click(button('采集所选目录'));await wait(()=>!!scanRelease);
  check('held_scan_disables_scope_and_duplicate_mutations',fixture.querySelector<HTMLSelectElement>('select')?.disabled===true&&button('采集所选目录')?.disabled===true&&button('更换程序包…')?.disabled===true);
  check('held_scan_keeps_confirmed_values_without_claiming_success',text().includes('9,007,199,254,740,993')&&!text().includes('本次采集已完成'));
  scanRelease?.();scanRelease=null;await wait(()=>text().includes('本次采集已完成')&&!button('读取冲突列表')?.disabled);
  const scanCall=calls.find(c=>(c.args.request as {action?:{operation?:string}}|undefined)?.action?.operation==='scan');
  check('scan_sends_only_selected_opaque_root_tokens',JSON.stringify(scanCall).includes('usage-choice-2')&&!JSON.stringify(scanCall).includes('C:\\'));
  holdScan=true;click(button('采集所选目录'));await wait(()=>!!scanReject);click(button('停止本次操作'));await wait(()=>text().includes('本次操作已停止')&&!button('刷新账本')?.disabled);scanRelease=null;
  check('stop_waits_for_owned_call_and_preserves_confirmed_values',text().includes('9,007,199,254,740,993')&&!text().includes('正在释放')&&calls.some(c=>c.command==='usage_cancel'));
  click(button('读取冲突列表'));await wait(()=>text().includes('版本 aaaaaaaaaa'));
  click(button('下一页'));await wait(()=>text().includes('版本 eeeeeeeeee'));
  check('conflicts_have_real_next_page_and_back_controls',!button('上一页')?.disabled&&button('下一页')?.disabled===true);
  click(button('上一页'));await wait(()=>text().includes('版本 aaaaaaaaaa'));
  click(button('查看计数'));await wait(()=>!!fixture.querySelector('input[type=checkbox]'));
  check('review_receipt_moves_focus_to_exact_measurement',document.activeElement?.textContent==='审阅所选计量版本'&&text().includes('fictional-model'));
  check('adoption_requires_explicit_review_acknowledgment',button('采用此计量版本')?.disabled===true&&button('排除此身份')?.disabled===true);
  fixture.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();await wait(()=>!button('采用此计量版本')?.disabled);
  click(button('采用此计量版本'));await wait(()=>!!fixture.querySelector('[role=alert]'));
  check('stale_review_clears_candidates_and_obsolete_confirmation',text().includes('重新审阅')&&!button('采用此计量版本')&&!text().includes('版本 aaaaaaaaaa'));
  click(button('读取冲突列表'));await wait(()=>!!button('查看计数'));click(button('查看计数'));await wait(()=>!!fixture.querySelector('input[type=checkbox]'));
  fixture.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();await wait(()=>!button('采用此计量版本')?.disabled);click(button('采用此计量版本'));
  await wait(()=>text().includes('已采用所选计量版本'));
  check('confirmed_correction_refreshes_count_without_adding_old_value',text().includes('13')&&!text().includes('9,007,199,254,740,993'));
  click(button('选择新文件并导出…'));await wait(()=>text().includes('聚合 JSON 已保存'));
  check('export_requires_native_new_file_choice_and_displays_boundary',calls.some(c=>c.command==='usage_pick'&&c.args.kind==='export')&&text().includes('导出只含聚合，不含源正文'));
  check('no_memory_activity_network_or_schedule_commands_are_sent',calls.every(c=>['usage_pick','usage_call','usage_cancel'].includes(c.command)));
  const source=fixture.querySelector<HTMLSelectElement>('select')!;source.value='claude_local';source.dispatchEvent(new Event('change',{bubbles:true}));await wait(()=>text().includes('尚未读取的数据不会以演示数字代替'));
  check('source_switch_clears_prior_counts_review_and_authorization_list',!text().includes('已授权目录 1')&&!button('采用此计量版本')&&button('采集所选目录')?.disabled===true);
  mount('browser',false);await wait(()=>text().includes('浏览器预览'));const before=calls.length;button('选择程序包…')?.click();await sleep(30);
  check('browser_preview_is_explicitly_disconnected_and_never_calls_native',calls.length===before&&button('选择程序包…')?.disabled===true);
  root.unmount();document.getElementById('results')!.textContent=JSON.stringify({passed:checks.every(c=>c.ok),checks},null,2);
}catch(error){root.unmount();throw error;}
