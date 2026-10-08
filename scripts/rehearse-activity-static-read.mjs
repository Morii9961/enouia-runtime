// Optional C17 fixture acceptance, never part of Runtime's regular build.
// A freshly prepared synthetic package publishes only over loopback before
// this script runs. Remove only its copied author modules, then serve the
// existing public bytes from a separately spawned, read-only static worker.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, sep } from 'node:path';

const [packageArgument,curlArgument,reportArgument,...extra]=process.argv.slice(2);
assert(extra.length===0 && [packageArgument,curlArgument,reportArgument].every(value=>value && isAbsolute(value)), 'usage: rehearse-activity-static-read.mjs <fresh synthetic package> <absolute curl> <absolute report>');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const pkg=await realpath(packageArgument), base=dirname(pkg), temp=await realpath(tmpdir());
assert(base.startsWith(temp+sep) && basename(base).startsWith('enouia-handback-ui-') && basename(pkg)==='package','only a prepared temporary fixture is allowed');
assert.equal(await readFile(join(base,'ACTIVITY_SANDBOX_FIXTURE'),'utf8'),'enouia-activity-isolated-handback-v1');
const manifest=JSON.parse(await readFile(join(pkg,'install.json'),'utf8'));
assert.equal(manifest.mode,'sandbox');
assert.equal(await realpath(manifest.dataRoot),await realpath(join(base,'data')));
const curl=await realpath(curlArgument);
const checks=[];
const check=(id,ok)=>{assert(ok,id);checks.push(id);};
async function tree(root) {
  const entries=[];
  for(const entry of (await readdir(root,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const path=join(root,entry.name);
    assert(!entry.isSymbolicLink() && (await realpath(path)).startsWith(base+sep),'fixture tree escaped');
    if(entry.isDirectory()) entries.push(...(await tree(path)).map(value=>`${entry.name}/${value}`));
    else {assert(entry.isFile());entries.push(`${entry.name}:${hash(await readFile(path))}`);}
  }
  return entries;
}
function run(file,args,options={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(file,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],...options});
    const output=[];let size=0;
    const timer=setTimeout(()=>{child.kill();reject(new Error('bounded static-read subprocess timed out'));},15000);
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.stdout.on('data',bytes=>{size+=bytes.length;if(size>1024*1024){child.kill();reject(new Error('static-read output bound'));}else output.push(bytes);});
    child.stderr.on('data',()=>{});
    child.on('close',code=>{clearTimeout(timer);resolve({code,bytes:Buffer.concat(output)});});
  });
}
const publicRoot=join(base,'publisher','public');
const originalManifest=await readFile(join(publicRoot,'current.json'));
const current=JSON.parse(originalManifest);
assert.match(current.activity.hash,/^[a-f0-9]{64}$/);
const originalPayload=await readFile(join(publicRoot,'activity',`${current.activity.hash}.json`));
check('public manifest names the exact existing payload hash',hash(originalPayload)===current.activity.hash);
const publisherBefore=JSON.stringify(await tree(join(base,'publisher')));
const installedBefore=JSON.stringify(await tree(pkg));
const dataBefore=JSON.stringify(await tree(manifest.dataRoot));
const modules=['scripts/status-receive.mjs','scripts/status-publish.mjs','scripts/lib/status-store.mjs','scripts/lib/status-batch.mjs','src/lib/activity.ts','src/lib/status.ts'];
const copiedModules=[];
for(const name of [...modules.map(name=>`reference/${name}`),'publish.mjs']) {
  const path=join(base,...name.split('/'));
  assert(!(await lstat(path)).isSymbolicLink() && (await realpath(path)).startsWith(base+sep),'copied author module escaped');
  copiedModules.push({path:name,sha256:hash(await readFile(path))});
}
check('all copied publisher receiver and author modules belong to this fixture',copiedModules.length===7);
for(const entry of copiedModules) await rm(join(base,...entry.path.split('/')));
check('copied author modules are absent before static worker startup',await Promise.all(copiedModules.map(async entry=>{try{await lstat(join(base,...entry.path.split('/')));return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}})).then(results=>results.every(Boolean)));
const workerRoot=join(base,'independent-static-worker');
await mkdir(workerRoot);
const worker=join(workerRoot,'serve.mjs');
await writeFile(worker,`import{createServer}from'node:http';import{readFile}from'node:fs/promises';import{join}from'node:path';
const root=process.argv[2];const server=createServer(async(req,res)=>{try{const match=/^\\/status-data\\/activity\\/([a-f0-9]{64})\\.json$/.exec(req.url);const path=req.url==='/status-data/current.json'?join(root,'current.json'):match?join(root,'activity',match[1]+'.json'):null;if(!path){res.writeHead(404);res.end();return;}const bytes=await readFile(path);res.writeHead(200,{'Content-Type':'application/json'});res.end(bytes);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));console.log(JSON.stringify({port:server.address().port,path:process.env.PATH,cwd:process.cwd()}));process.stdin.resume();process.stdin.once('end',()=>{server.closeAllConnections();server.close();});`,{flag:'wx'});
const environment={PATH:join(process.env.SystemRoot,'System32')};
for(const key of ['SystemRoot','WINDIR','TEMP','TMP']) if(process.env[key]) environment[key]=process.env[key];
let child;
async function start() {
  child=spawn(process.execPath,[worker,publicRoot],{cwd:workerRoot,env:environment,windowsHide:true,stdio:['pipe','pipe','pipe']});
  child.exited=new Promise(resolve=>child.once('exit',resolve));
  return new Promise((resolve,reject)=>{
    let output='';const timer=setTimeout(()=>{child.kill();reject(new Error('static worker readiness timed out'));},10000);
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.stderr.on('data',()=>{});
    child.stdout.on('data',bytes=>{output+=bytes.toString();if(output.includes('\n')){clearTimeout(timer);resolve(JSON.parse(output.trim()));}});
  });
}
async function stop() {
  const owned=child;
  owned.stdin.end();
  let timer;
  try {
    const result=await Promise.race([owned.exited,new Promise((_,reject)=>{timer=setTimeout(()=>{owned.kill();reject(new Error('static worker exit timed out'));},5000);})]);
    assert.equal(result,0);
  } finally {clearTimeout(timer);}
}
try {
  let ready=await start();
  check('static worker uses its own outside-repository directory and system-only PATH',ready.cwd===workerRoot && ready.path===environment.PATH);
  const fetch=async path=>{
    const result=await run(curl,['--silent','--show-error','--noproxy','*','--max-time','5','--write-out','\n%{http_code}',`http://127.0.0.1:${ready.port}${path}`],{cwd:workerRoot,env:environment});
    assert.equal(result.code,0);
    const end=result.bytes.lastIndexOf(10);
    return {status:result.bytes.subarray(end+1).toString(),body:result.bytes.subarray(0,end)};
  };
  const manifestRead=await fetch('/status-data/current.json');
  check('actual curl reads byte-identical public manifest without copied authors',manifestRead.status==='200' && manifestRead.body.equals(originalManifest));
  const payloadRead=await fetch(`/status-data/activity/${current.activity.hash}.json`);
  check('actual curl reads byte-identical payload with its named hash',payloadRead.status==='200' && payloadRead.body.equals(originalPayload) && hash(payloadRead.body)===current.activity.hash);
  check('static worker refuses routes outside its public allowlist',(await fetch('/status-data/../state.json')).status==='404');
  await stop();
  check('first owned static worker exits without a publisher process',child.exitCode===0);
  ready=await start();
  check('fresh static worker restart still reads exact public bytes',(await fetch('/status-data/current.json')).body.equals(originalManifest) && (await fetch(`/status-data/activity/${current.activity.hash}.json`)).body.equals(originalPayload));
  check('static reads leave all publisher files unchanged',JSON.stringify(await tree(join(base,'publisher')))===publisherBefore);
  check('static reads leave installed package and Activity data unchanged',JSON.stringify(await tree(pkg))===installedBefore && JSON.stringify(await tree(manifest.dataRoot))===dataBefore);
  await stop();
  check('second owned static worker exits cleanly',child.exitCode===0);
  const report={schemaVersion:1,state:'passed',scope:'isolated_static_read_without_copied_authors',generatedAt:new Date().toISOString(),checks,checkCount:checks.length,harnessSha256:hash(await readFile(new URL(import.meta.url))),prepareHarnessSha256:hash(await readFile(new URL('./prepare-activity-surface-sandbox.mjs',import.meta.url))),runnerSha256:hash(await readFile(manifest.binary)),publicManifestSha256:hash(originalManifest),activitySha256:current.activity.hash,copiedModules,limitations:['Only copied author modules in this newly prepared fixture are removed; actual source checkouts remain on the host.','Actual HTTP is loopback with a minimal static Node worker, not deployed Nginx, real HTTPS or rendered About-page acceptance.','No real account, production task, public upload or Moriium checkout mutation is used.']};
  await writeFile(reportArgument,`${JSON.stringify(report,null,2)}\n`,{flag:'wx'});
  console.log(JSON.stringify({state:report.state,checks:checks.length}));
} finally {if(child && child.exitCode===null) child.kill();}
