// Mounted surfaces with controlled read receipts; no OS or personal library.
import { createRoot } from 'react-dom/client';
import { MemoryStatusProvider, MemoryBadge, ConnectedHome, MemorySettings, VaultConnect, useStatus } from '../src/memory/status';
import MemorySurface from '../src/memory/MemorySurface';
import { NativeStrip } from '../src/theme/RecordStrip';
import RuntimeSurface from '../src/runtime/RuntimeSurface';
import { setTransport } from '../src/memory/client';
import { setCatalogTransport } from '../src/memory/catalog';
import { status, page, stats } from './fixtures/catalog.mjs';

const fixture=document.getElementById('fixture')!,root=createRoot(fixture);
const checks:{id:string;ok:boolean}[]=[],calls:string[]=[];
let state='open',fail=false,mismatch=false,hold=false,release:(()=>void)|null=null;
let releaseEntry:(()=>void)|null=null;
const initialEntry=new Promise<void>(resolve=>{releaseEntry=resolve;});
setTransport(async(command,args)=>{
  calls.push(command==='memory_call'?(args as any).request.command:command);
  if(command==='shell_status'){
    await initialEntry;
    return {vaultChanging:false,memoryEntry:'registered_owner_readonly'};
  }
  if(command==='startup_status')return {supported:false,enabled:false};
  if(command==='memory_call'&&(args as any).request.command==='workspace_status')return {
    kind:'memory_page',result:{vault:{state:'none'},pendingCandidates:0,components:[],companion:{exiting:false}}
  };
  throw new Error(`Unexpected command ${command}`);
});
setCatalogTransport(async(_command,args)=>{
  const query=(args as any).request.query;calls.push(`catalog:${query.operation}`);
  if(query.operation==='status'){
    const result={...status(state),mode:mismatch?'synthetic_segmented_only':'registered_owner_readonly'};
    if(hold){hold=false;await new Promise<void>(resolve=>{release=resolve;});}
    if(fail)throw 'catalog_read_refused';
    return result;
  }
  if(query.operation==='page')return page(query.filter.text,query.cursor);
  if(query.operation==='stats')return stats(query.selection,query.filter.text?1:3);
  if(query.operation==='lock'){state='locked';return {...status(state),mode:'registered_owner_readonly',effect:'native_control'};}
  throw new Error(`Unexpected catalog query ${query.operation}`);
});
function Control(){const value=useStatus();return <button id="refresh" data-workspace={value.status?.vault?.state??'unknown'} data-error={value.nativeError?.text??value.error?.text??''} onClick={()=>void value.refresh()}>Fixture refresh</button>;}
const nav=Object.fromEntries(['memory','context','sessions'].map(name=>[name,{go:()=>{}}]));
root.render(<MemoryStatusProvider><Control/><MemoryBadge/><NativeStrip page="home" nav={<nav/>}/><ConnectedHome nav={nav} ring={null}/><MemorySettings openMemory={()=>{}}/><VaultConnect/><MemorySurface/><RuntimeSurface/></MemoryStatusProvider>);
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const text=()=>fixture.textContent??'';
const badge=()=>fixture.querySelector('.qr224')?.textContent??'';
async function wait(test:()=>boolean){for(let i=0;i<350;i++){if(test())return;await sleep(20);}throw new Error(`UI timeout: ${text()}`);}
function check(id:string,ok:boolean){checks.push({id,ok});}
function refresh(){fixture.querySelector<HTMLButtonElement>('#refresh')!.click();}
try{
  await wait(()=>calls.includes('shell_status'));
  check('unknown_launch_mode_does_not_offer_workspace_navigation',!fixture.querySelector('[data-screen-label="Memory Vault"] .qr28 button'));
  releaseEntry!();
  await wait(()=>badge().includes('Registered library open')&&text().includes('2 shown · 3 matching authorized records'));
  check('real_native_status_does_not_rewrite_workspace_slot',fixture.querySelector('#refresh')?.getAttribute('data-workspace')==='none');
  check('badge_is_readonly_not_connected_workspace',badge().includes('Registered library · confirmed changes only')&&!badge().includes('Connected workspace'));
  const inspector=fixture.querySelector('[data-screen-label="Runtime Inspector"]')!;
  check('inspector_reports_native_scope_and_unavailable_operations',inspector.querySelector('#runtime-memory-panel')!.textContent!.includes('Registered library open')&&inspector.querySelector('#runtime-operations-panel')!.textContent!.includes('Unavailable in this read-only entry')&&!inspector.textContent!.includes('No Vault open'));
  check('home_does_not_offer_review_queue_or_saved_context',!fixture.querySelector('[data-screen-label=Home]')!.textContent!.includes('Open or create a Vault')&&!fixture.querySelector('[data-screen-label=Home]')!.textContent!.includes('Read saved Capsules')&&text().includes('Unavailable in this read-only entry'));
  check('no_fabricated_commit_or_time_trace',!fixture.querySelector('[data-kind="vault-commit"]')&&text().includes('Registered library · no time trace is available'));
  check('settings_and_gates_do_not_offer_writes_or_model_configuration',!text().includes('Create Vault…')&&!text().includes('Open an existing Vault…')&&!calls.some(c=>c.startsWith('memory_provider_')));
  check('memory_defaults_to_native_catalog',fixture.querySelector('[data-screen-label="Memory Vault"] button[aria-pressed=true]')?.textContent==='Native memory catalog');
  const memory=fixture.querySelector('[data-screen-label="Memory Vault"]')!;
  check('registered_entry_offers_only_read_workspaces',[...memory.querySelectorAll('.qr28 button')].map(button=>button.textContent).join('|')==='Native memory catalog|Time|Connections|Formation|Worth a look|Recall');
  check('registered_entry_only_offers_catalog_search',!memory.querySelector('.qr28 form[role=search]'));
  const catalogSearch=memory.querySelector<HTMLFormElement>('form:not(.qr22)')!;
  const input=catalogSearch.querySelector('input')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'调试');
  input.dispatchEvent(new Event('input',{bubbles:true}));
  await wait(()=>!catalogSearch.querySelector('button')!.disabled);
  await sleep(30);
  catalogSearch.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await wait(()=>text().includes('1 shown · 1 matching authorized records'));
  check('registered_search_keeps_catalog_selected',memory.querySelector('button[aria-pressed=true]')?.textContent==='Native memory catalog'&&input.value==='调试');
  state='locked';refresh();await wait(()=>badge().includes('Registered library closed'));
  check('closed_state_has_no_unlock_or_fresh_open_controls',!text().includes('Unlock synthetic library')&&!text().includes('Open an existing Vault…'));
  state='open';hold=true;refresh();await wait(()=>release!==null);
  state='locked';refresh();await wait(()=>badge().includes('Registered library closed'));
  release!();release=null;await sleep(50);
  check('late_open_status_cannot_replace_newer_close',badge().includes('Registered library closed'));
  fail=true;refresh();await wait(()=>badge().includes('Registered library status unknown'));
  check('failure_retains_readonly_configuration_but_withdraws_open_claim',!badge().includes('Registered library open')&&!text().includes('Create Vault…')&&!calls.some(c=>c.startsWith('memory_provider_'))&&fixture.querySelector('#refresh')?.getAttribute('data-workspace')==='none');
  check('inspector_withdraws_open_state_and_reports_native_error',inspector.querySelector('#runtime-memory-panel')!.textContent!.includes('Registered library status unknown')&&inspector.querySelector('#runtime-memory-panel [role=alert]')?.textContent==='The automatic Memory read was refused');
  fail=false;mismatch=true;refresh();await wait(()=>fixture.querySelector('#refresh')?.getAttribute('data-error')==='This automatic Memory version is unsupported');
  check('synthetic_status_cannot_impersonate_registered_entry',badge().includes('Registered library status unknown'));
  mismatch=false;state='open';refresh();await wait(()=>badge().includes('Registered library open'));
  check('fresh_status_recovers_without_a_write',calls.every(c=>['workspace_status','shell_status','startup_status','catalog:status','catalog:page','catalog:stats'].includes(c)));
  await wait(()=>Array.from(fixture.querySelectorAll('button')).some(button=>button.textContent==='Lock registered library'));
  hold=true;refresh();await wait(()=>release!==null);
  Array.from(fixture.querySelectorAll('button')).find(button=>button.textContent==='Lock registered library')!.click();
  await wait(()=>badge().includes('Registered library closed'));
  check('native_lock_receipt_updates_global_status',fixture.querySelector('#refresh')?.getAttribute('data-workspace')==='none');
  release!();release=null;await sleep(50);
  check('late_open_read_cannot_replace_native_lock_receipt',badge().includes('Registered library closed'));
}catch(error){checks.push({id:String(error),ok:false});}
finally{release?.();root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),calls});}
