// ADR-041 local Agent grants in Settings over controlled receipts. Synthetic only.
import { createRoot } from 'react-dom/client';
import { MemoryStatusProvider, MemorySettings } from '../src/memory/status';
import { setTransport } from '../src/memory/client';
import { setCatalogTransport } from '../src/memory/catalog';
import { envelope, status } from './fixtures/catalog.mjs';

const fixture=document.getElementById('fixture')!,root=createRoot(fixture);
const checks:{id:string;ok:boolean}[]=[],calls:any[]=[];
let registered=false;
const grants=()=>({...envelope,kind:'runtime_agent_grants',effect:'native_read',other_grants:[],vault_id:'vlt_synthetic',bridge:{path:'C:\\Program Files\\Enouia Runtime\\enouia-memory-mcp.exe',present:true,protocol:'automation-agent-v1'},agents:[
  {key:'claude_code',name:'Claude Code',registered,grant:registered?{grant_id:'pol_1',revision:1,active:true,max_sensitivity:'private',allow_requests:true,source_read:true,valid_from:'2026-11-22T00:00:00Z',valid_until:'2027-02-20T00:00:00Z',policies:44,sources:2149}:null,pipe:registered?'a'.repeat(64):null,coverage:registered?{policies:1,sources:3,refreshable:true}:null},
  {key:'codex',name:'Codex',registered:false,grant:null,pipe:null,coverage:null}]});
setTransport(async(command)=>{
  if(command==='shell_status')return {vaultChanging:false,memoryEntry:'registered_owner_readonly'};
  if(command==='startup_status')return {supported:false,enabled:false};
  if(command==='memory_call')return {kind:'memory_page',result:{vault:{state:'none'},pendingCandidates:0,components:[],companion:{exiting:false}}};
  throw new Error(`Unexpected ${command}`);
});
setCatalogTransport(async(_c,args)=>{
  const q=(args as any).request.query;calls.push(structuredClone(q));
  if(q.operation==='status')return {...status('open'),mode:'registered_owner_readonly',corrections:true};
  if(q.operation==='connector_status')return {...envelope,kind:'runtime_connector_status',effect:'native_read',windows:[]};
  if(q.operation==='agent_status')return grants();
  if(q.operation==='agent_plan')return {...envelope,kind:'runtime_agent_grant_plan',effect:'native_plan',plan_id:'req_plan',agent:q.agent,action:q.action,revision:1,active:true,max_sensitivity:'private',allow_requests:true,valid_until:'2027-02-20T00:00:00Z',expires_at:'2026-11-22T00:05:00Z',policies:44,sources:2149};
  if(q.operation==='agent_commit'){registered=true;return {...grants(),effect:'native_write'};}
  throw new Error(`Unexpected ${q.operation}`);
});
root.render(<MemoryStatusProvider><MemorySettings openMemory={()=>{}}/></MemoryStatusProvider>);
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const text=()=>fixture.textContent??'';
async function wait(test:()=>boolean){for(let i=0;i<400;i++){if(test())return;await sleep(20);}throw new Error(`UI timeout: ${text().slice(0,1200)}`);}
const check=(id:string,ok:boolean)=>checks.push({id,ok});
const button=(label:string)=>[...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label);
try{
  await wait(()=>text().includes('Local Agents')&&text().includes('Not registered'));
  check('agents_listed_with_honest_connection_state',text().includes('Claude Code')&&text().includes('Codex')&&text().includes('locking or exiting disconnects it'));
  button('Register…')!.click();
  await wait(()=>text().includes('Planned grant: Claude Code'));
  const plan=calls.find(c=>c.operation==='agent_plan');
  check('register_plans_claude_code_and_writes_nothing_yet',plan.agent==='claude_code'&&plan.action==='register'&&!calls.some(c=>c.operation==='agent_commit')&&text().includes('2149 sources'));
  button('Confirm and write')!.click();
  await wait(()=>text().includes('Registered · until'));
  check('confirm_commits_the_shown_plan_once',calls.filter(c=>c.operation==='agent_commit').length===1&&calls.find(c=>c.operation==='agent_commit').plan_id==='req_plan');
  const claude=fixture.querySelector('pre[data-agent=claude_code]')?.textContent??'';
  check('registered_agent_shows_mcp_config_for_its_pipe',claude.includes('claude mcp add enouia-memory -- "C:\\Program Files\\Enouia Runtime\\enouia-memory-mcp.exe" --protocol automation-agent-v1 --pipe '+'a'.repeat(64)+' --vault-id vlt_synthetic')&&
    text().includes("command = 'C:\\Program Files\\Enouia Runtime\\enouia-memory-mcp.exe'")&&text().includes('Up to four sessions of each Agent')&&!fixture.querySelector('pre[data-agent=codex]'));
  check('registered_agent_offers_renew_refresh_revoke',!!button('Renew for 90 days…')&&!!button('Include new sources…')&&text().includes('Missing 1 new windows and 3 new sources')&&!!button('Revoke…'));
}catch(error){checks.push({id:String(error),ok:false});}
finally{root.unmount();document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.length>0&&checks.every(c=>c.ok)});}
