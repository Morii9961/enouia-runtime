// The actual candidate conflict reader; held records/errors never reach a real Vault.
import { createRoot } from 'react-dom/client';
import { CandidateConflict } from '../src/memory/CandidateConflict';
import { CallError, type call } from '../src/memory/client';
import { setLang, useLang, type Lang } from '../src/i18n';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';

const fixture = document.getElementById('fixture')!, root = createRoot(fixture);
const outside = document.createElement('input'); document.body.appendChild(outside);
const checks: { id: string; ok: boolean }[] = [], calls: { command: string; args: Record<string, unknown> }[] = [];
let failure: 'none' | 'retry' | 'permanent' = 'none', release: (() => void) | null = null;
const releasePending = () => { const resolve = release; release = null; resolve?.(); };
const request: typeof call = async (command, args = {}) => {
  calls.push({ command, args }); const fault = failure;
  await new Promise<void>(resolve => { release = resolve; });
  if (fault !== 'none') throw new CallError({ code: 'not_found', retryable: fault === 'retry', rules: [] });
  return { record: { memory_id: args.memoryId, revision: 2, status: 'forgotten', content: 'Synthetic conflicting content <script>literal</script>' }, summary: { memoryId: args.memoryId } };
};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label);
const content = () => fixture.querySelector<HTMLElement>('.mem-content');
const text = () => fixture.textContent ?? '';
async function wait(test: () => boolean) { for (let n = 0; n < 250; n++) { if (test()) return; await sleep(20); } throw new Error(`UI timeout: ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
function click(label: string) { const control = button(label); if (!control || control.disabled) throw new Error(`Unavailable ${label}`); control.focus(); control.click(); }
async function begin(label: string) { click(label); await wait(() => release != null); }
async function finish() { releasePending(); await wait(() => !text().includes('Reading the conflicting memory…')); await sleep(20); }
function Surface({revision}:{revision:number}){useLang();return <ul data-revision={revision}><CandidateConflict key={revision} conflict={{ memory_id: 'synthetic-memory', revision: 1 }} readPage={request} /></ul>;}
async function mount(revision: number) {
  // Match Inbox's existing key boundary for candidate revision changes.
  root.render(<Surface revision={revision}/>);
  await wait(() => fixture.firstElementChild?.getAttribute('data-revision') === String(revision)); await sleep(20);
}
try {
  outside.focus(); await mount(1);
  check('mount_waits_for_explicit_read', calls.length === 0 && document.activeElement === outside);
  await begin('Read current conflicting memory'); await finish();
  check('explicit_read_focuses_current_literal_record', document.activeElement === content() && content()?.textContent?.includes('<script>literal</script>') === true && !fixture.querySelector('script'));
  check('current_record_focus_target_adds_no_tab_stop', content()?.tabIndex === -1 && content()?.getAttribute('aria-label') === 'Current conflicting memory');
  const current=content()!,languageCalls=calls.length;
  for(const [language,label,warning] of [
    ['zh-Hans','当前保存记录的观察 · r2','上方候选引用仍指向 r1'],
    ['ja','現在の保存済み記録の観測 · r2','引き続き r1'],
    ['en','Current saved observation · r2','still names r1'],
  ]){
    await setLang(language as Lang);await wait(()=>text().includes(label)&&text().includes(warning));
    check(`${language}_current_and_reported_revisions_stay_distinct`,current===content()&&current.textContent==='Synthetic conflicting content <script>literal</script>'&&text().includes('forgotten'));
    check(`${language}_language_keeps_record_focus_without_reread`,document.activeElement===current&&calls.length===languageCalls);
  }
  await begin('Read conflicting memory again'); check('reread_clears_previous_record', !content()); await finish();
  check('reread_focuses_new_observation', document.activeElement === content());
  await begin('Read conflicting memory again'); outside.focus(); await finish();
  check('successful_read_respects_moved_focus', document.activeElement === outside);
  failure = 'permanent'; await begin('Read conflicting memory again'); await finish();
  check('permanent_error_keeps_manual_recovery_focus', document.activeElement === button('Read conflicting memory again') && !button('Retry'));
  const recovery=button('Read conflicting memory again')!,errorCalls=calls.length;
  for(const [language,label,explanation,errorText] of [
    ['zh-Hans','重新读取冲突记忆','候选中报告的冲突仍然保留','找不到。它可能已被删除，或令牌已过期'],
    ['ja','競合するメモリを再読み込み','報告された競合は候補に残っています','見つかりません。削除されたか、トークンの期限が切れた可能性があります'],
    ['en','Read conflicting memory again','Its reported conflict remains in the candidate','Not found. It may have been deleted, or its token expired'],
  ]){
    await setLang(language as Lang);await wait(()=>!!button(label)&&text().includes(explanation));
    check(`${language}_error_keeps_recovery_control_and_focus`,button(label)===recovery&&document.activeElement===recovery&&!!fixture.querySelector('[role="alert"]')&&!content()&&calls.length===errorCalls);
    check(`${language}_retained_read_error_follows_language`,fixture.querySelector('[role="alert"]')!.textContent!.includes(errorText));
  }
  failure = 'retry'; await begin('Read conflicting memory again'); await finish(); const original = calls.at(-1);
  failure = 'none'; await begin('Retry'); await finish();
  check('retry_focuses_original_record', document.activeElement === content() && JSON.stringify(calls.at(-1)) === JSON.stringify(original));
  failure = 'retry'; await begin('Read conflicting memory again'); outside.focus(); await finish();
  check('error_respects_moved_focus', document.activeElement === outside);
  failure = 'none'; await begin('Retry'); outside.focus(); await finish();
  check('retry_respects_moved_focus', document.activeElement === outside);
  await begin('Read conflicting memory again'); click('Hide conflicting memory'); await sleep(20);
  check('hide_returns_focus_to_read_control', document.activeElement === button('Read current conflicting memory') && !content());
  releasePending(); await sleep(30);
  check('late_hidden_reply_cannot_reclaim_focus', document.activeElement === button('Read current conflicting memory') && !content());
  await begin('Read current conflicting memory'); outside.focus(); await mount(2); releasePending(); await sleep(30);
  check('revised_candidate_discards_old_focus_and_content', document.activeElement === outside && !content());
  await begin('Read current conflicting memory'); outside.focus(); root.unmount(); releasePending(); await sleep(30);
  check('unmount_discards_pending_focus', document.activeElement === outside);
  check('conflict_focus_only_reads_referenced_memory', calls.every(c => c.command === 'memory_read' && JSON.stringify(c.args) === JSON.stringify({ memoryId: 'synthetic-memory' })));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); outside.remove(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok) }, null, 2); }
