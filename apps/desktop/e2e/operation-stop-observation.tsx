// Actual operation watcher; cancellation errors and later reads are synthetic.
import { createRoot } from 'react-dom/client';
import { Operation, OperationFeedback } from '../src/memory/ui';
import { CallError, type call } from '../src/memory/client';
import { setLang, useLang, type Lang } from '../src/i18n';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';

const fixture = document.getElementById('fixture')!, root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [], calls: { command: string; operationId: unknown }[] = [];
let release: (() => void) | null = null;
const releasePending = () => { const resolve = release; release = null; resolve?.(); };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const text = () => fixture.textContent ?? '';
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label);
async function wait(test: () => boolean) { for (let n = 0; n < 250; n++) { if (test()) return; await sleep(20); } throw new Error(`UI timeout: ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
try {
  for (const kind of ['external_send', 'import']) for (const outcome of ['acknowledged', 'completed', 'late_error']) {
    const caseId = `${kind}_${outcome}`, id = `operation-${caseId}`, start = calls.length;
    let phase = 'running', callbacks = 0;
    const request: typeof call = async (command, args = {}) => {
      calls.push({ command, operationId: args.operationId });
      if (args.operationId !== id) throw new Error('Wrong operation owner');
      if (command === 'operation_cancel') {
        if (outcome === 'late_error') await new Promise<void>(resolve => { release = resolve; });
        throw new CallError({ code: 'busy', retryable: true, rules: [] });
      }
      if (command !== 'operation_get') throw new Error(`Unexpected ${command}`);
      return { operationId: id, kind, state: phase === 'completed' ? 'succeeded' : 'running', cancelRequested: phase === 'acknowledged',
        progress: { done: phase === 'completed' ? 1 : 0, total: 1 }, result: phase === 'completed' && kind === 'external_send' ? { finish: 'completed' } : null };
    };
    function Surface(){useLang();return <Operation id={id} kind={kind} request={request} onDone={() => { callbacks++; }} />;}
    root.render(<div key={caseId} data-case={caseId}><Surface/></div>);
    const label = kind === 'external_send' ? 'Stop locally' : 'Cancel';
    await wait(() => fixture.firstElementChild?.getAttribute('data-case') === caseId && !!button(label));
    button(label)!.click();
    if (outcome === 'late_error') await wait(() => release != null);
    else {
      await wait(() => !!button('Retry'));
      check(`${caseId}_unacknowledged_active_failure_is_recoverable`, !!fixture.querySelector('[role="alert"]') && callbacks === 0);
    }
    phase = outcome === 'acknowledged' ? 'acknowledged' : 'completed';
    await wait(() => phase === 'completed' ? callbacks === 1 : !!button(kind === 'external_send' ? 'Local stop requested' : 'Cancellation requested'));
    if (outcome === 'late_error') { releasePending(); await sleep(40); }
    if(outcome==='acknowledged'){
      const operation=fixture.querySelector('.mem-operation'),stops=calls.filter(c=>c.command==='operation_cancel').length;
      for(const [language,progress,waiting] of [
        ['zh-Hans','进度 0 / 1',kind==='external_send'?'正在等待本地调用停止。':'正在等待下一个安全停止点。'],
        ['ja','進捗 0 / 1',kind==='external_send'?'ローカル呼び出しの停止を待っています。':'次の安全な停止点を待っています。'],
        ['en','progress 0 / 1',kind==='external_send'?'Waiting for the local call to stop.':'Waiting for the next safe point.'],
      ]){
        await setLang(language as Lang);await wait(()=>text().includes(progress)&&text().includes(waiting));
        check(`${caseId}_${language}_language_keeps_acknowledged_stop`,fixture.querySelector('.mem-operation')===operation&&fixture.querySelector<HTMLButtonElement>('.mem-operation button')?.disabled===true&&callbacks===0&&calls.filter(c=>c.command==='operation_cancel').length===stops);
      }
    }
    check(`${caseId}_new_observation_retires_obsolete_stop_error`, !button('Retry') && !fixture.querySelector('[role="alert"]'));
    check(`${caseId}_observed_outcome_controls_actions`, phase === 'completed' ? callbacks === 1 && !button(label)
      : callbacks === 0 && button(kind === 'external_send' ? 'Local stop requested' : 'Cancellation requested')?.disabled === true);
    check(`${caseId}_observation_does_not_replay_cancellation`, calls.slice(start).filter(c => c.command === 'operation_cancel').length === 1);
  }
  const backup={kind:'backup_export',state:'succeeded',progress:{done:4,total:null},result:{sequence:23,files:41,destinationName:'Synthetic <img src=x> backup'}};
  function Backup(){useLang();return <OperationFeedback status={backup} onCancel={()=>{throw Error('Unexpected backup cancellation');}}/>;}
  root.render(<Backup/>);await wait(()=>text().includes('Backup saved:'));
  for(const [language,label,progress] of [['zh-Hans','备份已保存：提交 #23 · 41 个文件','进度 4'],['ja','バックアップを保存しました：コミット #23 · 41 ファイル','進捗 4'],['en','Backup saved: commit #23 · 41 files','progress 4']]){
    await setLang(language as Lang);await wait(()=>text().includes(label)&&text().includes(progress));
    check(`${language}_backup_preserves_literal_destination_without_controls`,text().includes('Synthetic <img src=x> backup')&&!fixture.querySelector('img')&&!fixture.querySelector('button'));
  }
  check('watchers_keep_operation_owner_and_existing_commands', calls.every(c => typeof c.operationId === 'string' && ['operation_get', 'operation_cancel'].includes(c.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
