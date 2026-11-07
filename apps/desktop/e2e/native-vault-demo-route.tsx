// SDK native marker only; no App/window module and no invoke bridge are installed.
const flags=globalThis as typeof globalThis & {isTauri?:boolean},old=flags.isTauri;
const checks:{id:string;ok:boolean}[]=[];
try{flags.isTauri=true;const {demoData}=await import('../src/demo-data');
checks.push({id:'native_ignores_browser_empty_vault_parameter',ok:demoData.MEM.length===14&&demoData.SESS.length===3&&demoData.CTX.length>0});
}catch(error){checks.push({id:String(error),ok:false});}
finally{if(old===undefined)delete flags.isTauri;else flags.isTauri=old;document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok)});}
