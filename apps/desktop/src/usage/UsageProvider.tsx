import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {usage,describeUsage,UsageFailure,type Action,type Candidate,type CandidatePage,type Overview,type Review,type Scope,type Source} from './client';
type Phase='idle'|'choosing'|'reading'|'scanning'|'exporting'|'reviewing'|'resolving'|'replaying'|'stopping';
function useController(native:boolean){
  const [packageToken,setPackage]=useState<string|null>(null),[ledger,setLedger]=useState<string|null>(null),[source,setSourceValue]=useState<Source>('codex_local');
  const [roots,setRoots]=useState<Record<Source,string[]>>({codex_local:[],claude_local:[]}),[models,setModels]=useState('');
  const [overview,setOverview]=useState<Overview|null>(null),[page,setPage]=useState<CandidatePage|null>(null),[cursor,setCursor]=useState<string|null>(null),[previous,setPrevious]=useState<(string|null)[]>([]);
  const [review,setReview]=useState<Review|null>(null),[selected,setSelected]=useState<Candidate|null>(null),[acknowledged,setAcknowledged]=useState(false);
  const [phase,setPhase]=useState<Phase>('idle'),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);
  const busyRef=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const clearReview=()=>{setReview(null);setSelected(null);setAcknowledged(false);};
  const clearObservation=()=>{setOverview(null);setPage(null);setCursor(null);setPrevious([]);clearReview();setNotice(null);};
  const scope=(chosenLedger=ledger):Scope=>{if(!packageToken||!chosenLedger)throw new UsageFailure('usage_unconfigured');return{package:packageToken,ledger:chosenLedger,source};};
  async function task(stage:Phase,work:()=>Promise<void>){
    if(!native||busyRef.current)return;busyRef.current=true;setPhase(stage);setError(null);setNotice(null);
    try{await work();}catch(e){if(alive.current){setNotice(null);setError(describeUsage(e));if(e instanceof UsageFailure&&e.code==='usage_stale_read'){setPage(null);setCursor(null);setPrevious([]);clearReview();}}}
    finally{busyRef.current=false;if(alive.current)setPhase('idle');}
  }
  const observe=async(action:Action,chosenLedger=ledger)=>{const r=await usage.call(scope(chosenLedger),action);if(!('source'in r))throw new UsageFailure('usage_contract_invalid');if(alive.current){setOverview(r);setPage(null);setCursor(null);setPrevious([]);clearReview();}return r;};
  async function readPage(next:string|null){const r=await usage.call(scope(),{operation:'candidates',cursor:next});if(!('page'in r))throw new UsageFailure('usage_contract_invalid');if(alive.current){setPage(r.page);setCursor(next);clearReview();}}
  return {
    native,packageToken,ledger,source,roots,models,overview,page,cursor,previous,review,selected,acknowledged,phase,error,notice,busy:phase!=='idle',
    setModels:(text:string)=>{if(!busyRef.current)setModels(text);},setAcknowledged,
    setSource:(next:Source)=>{if(busyRef.current)return;setSourceValue(next);clearObservation();setError(null);},
    choosePackage:()=>task('choosing',async()=>{const token=await usage.pick('package');if(token&&alive.current){setPackage(token);clearObservation();setNotice('已连接独立 Usage 程序包。尚未开始采集。');}}),
    chooseLedger:(create:boolean)=>task('choosing',async()=>{if(!packageToken)throw new UsageFailure('usage_unconfigured');const token=await usage.pick(create?'new_ledger':'ledger');if(!token||!alive.current)return;setLedger(token);clearObservation();await observe(create?{operation:'init',confirm:true}:{operation:'overview'},token);}),
    addRoot:()=>task('choosing',async()=>{if(roots[source].length>=16)throw new UsageFailure('usage_budget_exceeded');const token=await usage.pick(source==='codex_local'?'codex_root':'claude_root');if(token&&alive.current)setRoots(old=>({...old,[source]:[...old[source],token]}));}),
    removeRoot:(token:string)=>{if(!busyRef.current)setRoots(old=>({...old,[source]:old[source].filter(r=>r!==token)}));},
    refresh:()=>task('reading',async()=>{await observe({operation:'overview'});}),
    scan:()=>task('scanning',async()=>{await observe({operation:'scan',roots:roots[source],models:models.split(/[\s,]+/).filter(Boolean)});if(alive.current)setNotice('本次采集已完成，请核对覆盖诊断。未归日用量仍不会计入每日账单。');}),
    replay:()=>task('replaying',async()=>{await observe({operation:'replay'});if(alive.current)setNotice('已从保留的计量证据重建，未重新读取源文件。');}),
    loadCandidates:()=>task('reading',async()=>{await readPage(null);setPrevious([]);}),
    nextPage:()=>task('reading',async()=>{if(!page?.next_cursor)return;const old=cursor;await readPage(page.next_cursor);if(alive.current)setPrevious(p=>[...p.slice(-127),old]);}),
    previousPage:()=>task('reading',async()=>{if(!previous.length)return;await readPage(previous.at(-1)??null);if(alive.current)setPrevious(p=>p.slice(0,-1));}),
    inspect:(candidate:Candidate)=>task('reviewing',async()=>{clearReview();const r=await usage.call(scope(),{operation:'inspect',candidate});if(!('review_token'in r))throw new UsageFailure('usage_contract_invalid');if(alive.current){setSelected(candidate);setReview(r);setAcknowledged(false);}}),
    resolve:(exclude:boolean)=>task('resolving',async()=>{if(!review||!acknowledged)return;await observe({operation:'resolve',review_token:review.review_token,exclude});if(alive.current)setNotice(exclude?'已排除此身份；旧计量证据仍保留。':'已采用所选计量版本；旧版本仍保留。');}),
    exportFile:(start:string,end:string)=>task('exporting',async()=>{const destination=await usage.pick('export');if(!destination)return;const r=await usage.call(scope(),{operation:'export',start,end_exclusive:end,destination});if(!('exported'in r))throw new UsageFailure('usage_contract_invalid');if(alive.current){setOverview(old=>old?{...old,health:r.health}:old);setNotice('聚合 JSON 已保存。导出只含聚合，不含源正文。');}}),
    cancel:async()=>{try{const stopped=await usage.cancel();if(alive.current){if(stopped&&busyRef.current){setNotice(null);setPhase('stopping');}else if(!stopped&&busyRef.current)setNotice('程序仍在准备，请稍后再试。');}}catch(e){if(alive.current)setError(describeUsage(e));}},
  };
}
type Controller=ReturnType<typeof useController>;
const Context=createContext<Controller|null>(null);
export function UsageProvider({native,children}:{native:boolean;children:ReactNode}){const value=useController(native);return <Context.Provider value={value}>{children}</Context.Provider>;}
export function useUsage(){const value=useContext(Context);if(!value)throw new Error('Usage provider is missing');return value;}
