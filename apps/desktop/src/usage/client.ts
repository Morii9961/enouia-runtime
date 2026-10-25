// A separate native command namespace. No Memory or Activity DTO/state imports.
import { invoke } from '@tauri-apps/api/core';
export type Source = 'codex_local' | 'claude_local';
export const COUNT_KEYS = ['input_total','input_uncached','input_cache_read','input_cache_write_5m','input_cache_write_1h','input_cache_write_30m','input_cache_write_unknown','output_total','output_reasoning_subset'] as const;
export type Counts = Record<typeof COUNT_KEYS[number],string|null>;
export type Coverage = Record<'files'|'complete_files'|'records'|'rejected'|'incomplete_tails'|'unreadable'|'retained_files'|'unsupported'|'unsafe_entries'|'counter_resets',number>;
export type Health = {revision:number;last_attempt:string|null;last_completed:string|null;last_successful:string|null;attempt_error:string|null;coverage:Coverage;conflicts:number;accepted_facts:number};
export type Overview = {source:Source;health:Health;counts:Counts|null;date_coverage:'unallocated';notice:string};
export type Candidate = {group:string;identity:string;digest:string};
export type CandidatePage = {items:Candidate[];next_cursor:string|null};
export type Measurement = {provider:string;model:string;effort:string;effort_evidence:string;observed_date:string|null;time_basis:string;service_tier:'unknown';context_class:'unknown';region:'unknown';classification:'unknown';cache_detail:'complete'|'missing';counts:Counts;quality:{state:'reported';reasons:{code:string;occurrences:string|null}[]}};
export type View = {kind:'checkpoint';counts:Counts;time_basis:'checkpoint_unknown'} | {kind:'step';before_counts:Counts;after_counts:Counts;measurement:Measurement} | {kind:'message';measurement:Measurement;sidechain:boolean};
export type Review = {view:View;review_token:string};
export type Action = {operation:'init';confirm:true}|{operation:'overview'}|{operation:'scan';roots:string[];models:string[]}|{operation:'replay'}|{operation:'candidates';cursor:string|null}|{operation:'inspect';candidate:Candidate}|{operation:'resolve';review_token:string;exclude:boolean}|{operation:'export';start:string;end_exclusive:string;destination:string};
export type Scope = {package:string;ledger:string;source:Source};
export type PickKind = 'package'|'ledger'|'new_ledger'|'codex_root'|'claude_root'|'export';
type Transport = (command:string,args:Record<string,unknown>)=>Promise<unknown>;
let transport:Transport=(command,args)=>invoke(command,args);
export function setUsageTransport(next:Transport){transport=next;}
export class UsageFailure extends Error {readonly code:string;constructor(code:string){super(code);this.code=code;}}
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const closed=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>object(v)&&keys.length===Object.keys(v).length&&keys.every(k=>Object.hasOwn(v,k));
const natural=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const decimal=(v:unknown)=>v===null||typeof v==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(v);
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const choice=(v:unknown)=>typeof v==='string'&&/^usage-choice-[0-9]{1,20}$/.test(v);
const timestamp=(v:unknown)=>v===null||typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T[0-9:.+-]+Z?$/.test(v)&&Number.isFinite(Date.parse(v));
const date=(v:unknown)=>v===null||typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(`${v}T00:00:00Z`))&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v;
const codes=['invalid_json','invalid_schema','invalid_counts','counter_reset','invalid_date','overflow','unsupported_source','conflict','stale_read','unsafe_path','budget_exceeded','cancelled','busy','storage_failed','unconfigured'];
const inList=(v:unknown,list:readonly string[])=>typeof v==='string'&&list.includes(v);
const counts=(v:unknown):v is Counts=>closed(v,COUNT_KEYS)&&COUNT_KEYS.every(k=>decimal(v[k]));
const health=(v:unknown):v is Health=>closed(v,['revision','last_attempt','last_completed','last_successful','attempt_error','coverage','conflicts','accepted_facts'])&&natural(v.revision)&&natural(v.conflicts)&&natural(v.accepted_facts)&&timestamp(v.last_attempt)&&timestamp(v.last_completed)&&timestamp(v.last_successful)&&(v.attempt_error===null||inList(v.attempt_error,codes))&&closed(v.coverage,['files','complete_files','records','rejected','incomplete_tails','unreadable','retained_files','unsupported','unsafe_entries','counter_resets'])&&Object.values(v.coverage).every(natural);
const candidate=(v:unknown):v is Candidate=>closed(v,['group','identity','digest'])&&hash(v.group)&&hash(v.identity)&&hash(v.digest);
function sealed(v:unknown,purpose:'page'|'review',source?:Source,expected?:Candidate):v is string {
  if(typeof v!=='string'||v.length>2048)return false;
  try{const s:unknown=JSON.parse(v);if(!closed(s,['payload','seal'])||typeof s.payload!=='string'||!hash(s.seal))return false;const p:unknown=JSON.parse(s.payload);return closed(p,['purpose','source','revision','evidence','candidate'])&&p.purpose===purpose&&inList(p.source,['codex_local','claude_local'])&&(!source||source===p.source)&&natural(p.revision)&&natural(p.evidence)&&candidate(p.candidate)&&(!expected||expected.group===p.candidate.group&&expected.identity===p.candidate.identity&&expected.digest===p.candidate.digest);}catch{return false;}
}
const reasonCodes=['counter_reset','retained_not_observed','checkpoint_unallocated','session_copy_conflict','source_missing','source_unreadable','source_deleted','incomplete_tail','request_start_unavailable','parse_rejected','unsupported_source','model_unresolved','effort_inferred','counts_unreported','pricing_conditions_unknown'];
function measurement(v:unknown):v is Measurement {
  return closed(v,['provider','model','effort','effort_evidence','observed_date','time_basis','service_tier','context_class','region','classification','cache_detail','counts','quality'])&&inList(v.provider,['openai','anthropic'])&&typeof v.model==='string'&&/^[a-z0-9][a-z0-9._-]{0,79}$/.test(v.model)&&inList(v.effort,['unknown','low','medium','high','xhigh','max'])&&inList(v.effort_evidence,['unknown','inferred'])&&date(v.observed_date)&&inList(v.time_basis,['usage_observation','checkpoint_unknown'])&&v.service_tier==='unknown'&&v.context_class==='unknown'&&v.region==='unknown'&&v.classification==='unknown'&&inList(v.cache_detail,['complete','missing'])&&counts(v.counts)&&closed(v.quality,['state','reasons'])&&v.quality.state==='reported'&&Array.isArray(v.quality.reasons)&&v.quality.reasons.length<=15&&v.quality.reasons.every(r=>closed(r,['code','occurrences'])&&inList(r.code,reasonCodes)&&decimal(r.occurrences));
}
function view(v:unknown):v is View {
  if(!object(v))return false;
  return v.kind==='checkpoint'?closed(v,['kind','counts','time_basis'])&&counts(v.counts)&&v.time_basis==='checkpoint_unknown':v.kind==='step'?closed(v,['kind','before_counts','after_counts','measurement'])&&counts(v.before_counts)&&counts(v.after_counts)&&measurement(v.measurement):v.kind==='message'&&closed(v,['kind','measurement','sidechain'])&&typeof v.sidechain==='boolean'&&measurement(v.measurement);
}
const overview=(v:unknown,source:Source):v is Overview=>closed(v,['source','health','counts','date_coverage','notice'])&&v.source===source&&health(v.health)&&(v.counts===null||counts(v.counts))&&v.date_coverage==='unallocated'&&v.notice==='导出只含聚合，不含源正文。';
function invalid():never{throw new UsageFailure('usage_contract_invalid');}
const hostCodes=[...codes.map(c=>`usage_${c}`),'usage_choice_expired','usage_unsafe_package','usage_binary_changed','usage_contract_invalid','usage_invalid_request','usage_runner_failed','usage_runner_timeout','usage_runtime_closing'];
async function send(command:string,args:Record<string,unknown>){try{return await transport(command,args);}catch(e){throw new UsageFailure(typeof e==='string'&&hostCodes.includes(e)?e:'usage_call_failed');}}
export const usage = {
  async pick(kind:PickKind):Promise<string|null>{const v=await send('usage_pick',{kind});if(closed(v,['cancelled'])&&v.cancelled===true)return null;if(closed(v,['token'])&&choice(v.token))return v.token as string;return invalid();},
  async cancel():Promise<boolean>{const v=await send('usage_cancel',{});if(closed(v,['stopped'])&&typeof v.stopped==='boolean')return v.stopped;return invalid();},
  async call(scope:Scope,action:Action):Promise<Overview|{page:CandidatePage}|Review|{health:Health;exported:true}>{
    const v=await send('usage_call',{request:{...scope,action}});if(!closed(v,['version','result'])||v.version!==1)return invalid();const r=v.result;
    switch(action.operation){
      case 'candidates':if(closed(r,['page'])&&closed(r.page,['items','next_cursor'])&&Array.isArray(r.page.items)&&r.page.items.length<=64&&r.page.items.every(candidate)&&(r.page.next_cursor===null||r.page.items.length>0&&sealed(r.page.next_cursor,'page',scope.source,r.page.items.at(-1))))return r as {page:CandidatePage};break;
      case 'inspect':if(closed(r,['view','review_token'])&&view(r.view)&&sealed(r.review_token,'review',scope.source,action.candidate))return r as Review;break;
      case 'export':if(closed(r,['health','exported'])&&health(r.health)&&r.exported===true)return r as {health:Health;exported:true};break;
      default:if(overview(r,scope.source))return r;
    }return invalid();
  },
};
export function describeUsage(error:unknown):string{
  const code=error instanceof UsageFailure?error.code:'';
  const messages:Record<string,string>={usage_busy:'另一个用量操作正在运行，请稍后刷新。',usage_choice_expired:'选择已失效，请重新选择程序包或目录。',usage_binary_changed:'程序包内容已变化，请重新选择经过核对的 Usage 程序包。',usage_unsafe_package:'所选目录不是受支持的 Usage 程序包，或包含不安全链接。',usage_unsafe_path:'所选位置不安全或无法只读打开，请换一个本地目录。',usage_unconfigured:'请先选择程序包、账本和当前来源目录。',usage_storage_failed:'账本或目标文件无法安全写入。旧记录已保留，请检查权限；导出请使用新文件。',usage_budget_exceeded:'本次操作达到安全上限。旧记录已保留，请缩小选择范围后重试。',usage_cancelled:'本次操作已停止。已确认的旧记录保留，请刷新查看。',usage_stale_read:'计量证据已变化，请刷新冲突列表并重新审阅。',usage_conflict:'当前候选无法确认，请重新读取冲突。',usage_invalid_date:'日期无效，或生成时间早于记录中的观测日期。',usage_runner_timeout:'用量程序未在时限内结束。请刷新核对旧记录后重试。',usage_runtime_closing:'应用正在退出，无法开始新的用量操作。',usage_contract_invalid:'用量程序返回了不兼容的数据，请核对程序包版本。'};
  return messages[code]??'用量操作未完成。请检查选择后重试。';
}
export function exactToken(value:string|null|undefined){return value==null?'未报告':value.replace(/\B(?=(\d{3})+(?!\d))/g,',');}
