// Actual App + installed Tauri SDK mocks; never a native window or host command.
import { createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { mockIPC, mockWindows, clearMocks } from '@tauri-apps/api/mocks';
import type AppType from '../src/App';
import { setLang, t, useLang, type Lang } from '../src/i18n';
const fixture=document.getElementById('fixture')!,root=createRoot(fixture),app=createRef<AppType>();
const flags=globalThis as typeof globalThis & {isTauri?:boolean},oldNative=flags.isTauri;
const checks:{id:string;ok:boolean}[]=[],calls:{command:string;args:unknown}[]=[];
let refuse=true;
const check=(id:string,ok:boolean)=>checks.push({id,ok});
const sleep=()=>new Promise(resolve=>setTimeout(resolve,20));
async function wait(test:()=>boolean){for(let i=0;i<250;i++){if(test())return;await sleep();}throw Error('Window feedback timeout');}
const actions=()=>calls.filter(c=>c.command!=='plugin:window|is_maximized');
try{
  // Window APIs read metadata at import/use time, so install both mocks before App.
  mockIPC((command,args)=>{
    calls.push({command,args:structuredClone(args)});
    if(command==='plugin:window|is_maximized')return false;
    if(['plugin:window|minimize','plugin:window|toggle_maximize','plugin:window|close'].includes(command)){
      if(refuse)throw Error('Synthetic window refusal');return;
    }
    throw Error('Unexpected mock command '+command);
  });
  mockWindows('main');flags.isTauri=true;
  const App=(await import('../src/App')).default;
  await setLang('en');document.documentElement.dataset.motion='reduced';
  function Surface(){useLang();return <App ref={app} memoryConnected={false} startPage="memory" breathing={false}/>;}
  root.render(<Surface/>);await wait(()=>app.current?.state.windowMaximized===false&&!!fixture.querySelector('.qr82'));
  fixture.querySelector<HTMLButtonElement>('.qr82')!.click();await wait(()=>!!fixture.querySelector('textarea.qr53'));
  const field=fixture.querySelector<HTMLTextAreaElement>('textarea.qr53')!,draft='Unsent synthetic draft <packet> unknown/key-03 原文';
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(field,draft);field.dispatchEvent(new Event('input',{bubbles:true}));
  await wait(()=>app.current!.state.draft===draft);
  const identity=fixture.querySelector('.qr51')!.textContent,memories=JSON.stringify(app.current!.state.mems);
  for(const [index,command] of ['plugin:window|minimize','plugin:window|toggle_maximize','plugin:window|close'].entries()){
    const button=fixture.querySelectorAll<HTMLButtonElement>('.window-control')[index];button.focus();button.click();
    await wait(()=>actions().length===index+1&&!!app.current!.state.windowError);await sleep();
    check(`${command}_one_explicit_rejected_request`,actions()[index].command===command);
    const raw=app.current!.state.windowError;
    for(const language of ['en','zh-Hans','ja','en'] as Lang[]){
      await setLang(language);await sleep();
      check(`${command}_${language}_error_follows_language`,fixture.querySelector('.bg-window-error')?.textContent===t('Window control failed. Try again.'));
      check(`${command}_${language}_keeps_draft_identity_focus_and_request_count`,document.activeElement===button&&fixture.querySelector('textarea.qr53')===field&&field.value===draft&&fixture.querySelector('.qr51')?.textContent===identity&&JSON.stringify(app.current!.state.mems)===memories&&app.current!.state.windowError===raw&&actions().length===index+1);
    }
  }
  refuse=false;fixture.querySelector<HTMLButtonElement>('.window-control')!.click();
  await wait(()=>actions().length===4&&!fixture.querySelector('.bg-window-error'));
  check('later_explicit_success_retires_error_without_losing_draft',app.current!.state.windowError===undefined&&field.value===draft&&fixture.querySelector('.qr51')?.textContent===identity);
  check('only_mock_window_commands_for_main',calls.every(c=>JSON.stringify(c.args)==='{"label":"main"}')&&calls.filter(c=>c.command==='plugin:window|is_maximized').length===1&&actions().length===4);
}catch(error){checks.push({id:String(error),ok:false});}
finally{root.unmount();clearMocks();if(oldNative===undefined)delete flags.isTauri;else flags.isTauri=oldNative;document.getElementById('results')!.textContent=JSON.stringify({checks,passed:checks.every(c=>c.ok),calls});}
