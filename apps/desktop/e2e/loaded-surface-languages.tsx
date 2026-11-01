// Real App / saved event and request presentation. Every receipt is synthetic.
import { createRef } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import { setTransport } from '../src/memory/client';
import { setLang, useLang, type Lang } from '../src/i18n';

const fixture = document.getElementById('fixture')!, root = createRoot(fixture), app = createRef<App>();
const checks: { id: string; ok: boolean }[] = [], calls: string[] = [];
const hash = 'a'.repeat(64), statement = 'Literal saved answer: <example> stays in English.', requestText = 'Literal actual request: <example> stays in English.';
const recorded = JSON.stringify({ status: 'no_supported_evidence', dispatch_id: 'dsp_synthetic', request_hash: hash, statements: [statement], sources: [], memories: [] });
setTransport(async (native, args) => {
  if (native === 'shell_status') return { vaultChanging: false };
  if (native === 'memory_provider_setup') return { state: 'absent' };
  if (native !== 'memory_call') throw Error(native);
  const r = args.request as { command: string; arguments: Record<string, unknown> }; calls.push(r.command);
  let result: unknown;
  if (r.command === 'workspace_status') result = { vault: { state: 'open', vaultId: 'synthetic-language-vault', rootName: 'Synthetic', headSequence: 1 }, companion: { exiting: false } };
  else if (r.command === 'operation_list') result = { items: [] };
  else if (r.command === 'provider_status') result = { configured: false, destinations: [], grants: [] };
  else if (r.command === 'session_list') result = { items: [{ sessionId: 'ses_synthetic', updatedAt: '2026-11-01T00:00:00Z', branches: [{ branchId: 'br_synthetic', lastEventSeq: 2 }] }] };
  else if (r.command === 'session_detail') result = { ...r.arguments, transcript: [
    { eventId: 'evt_user', kind: 'user_message', deliveryState: 'not_applicable', occurredAt: '2026-11-01T00:00:00Z', text: 'Literal saved user question.' },
    { eventId: 'evt_answer', kind: 'assistant_completed', deliveryState: 'completed', occurredAt: '2026-11-01T00:20:00Z', text: recorded }],
    turns: [], checkpoints: [], invocations: [], extractionJobs: [], lastSavedEventId: 'evt_answer' };
  else if (r.command === 'context_inspect') result = { capsule: { capsule_id: 'cap_synthetic', query: 'Literal saved question.', destination: { kind: 'local_mock' }, budget: { estimated_tokens: 50, max_tokens: 100, counting_method: 'utf8_bytes_v1' } },
    inspection: { capsule_id: 'cap_synthetic', decisions: [true, false].map((reachable, i) => ({ record_id: `mem_synthetic_${i}`, record_kind: 'memory', revision: 1, decision: 'included', reason: 'Literal saved reason.', source_reachable: reachable })) },
    delivery: 'dispatched', dispatches: [{ dispatchId: 'dsp_synthetic', requestHash: hash, state: 'completed', preparedAt: '2026-11-01T00:00:00Z', sentAt: '2026-11-01T00:01:00Z', completedAt: '2026-11-01T00:02:00Z' }] };
  else if (r.command === 'dispatch_inspect') result = { dispatchId: 'dsp_synthetic', capsuleId: 'cap_synthetic', verified: true, requestHash: hash, tools: 1, destination: { kind: 'local_mock' }, messages: [{ role: 'user', text: requestText }] };
  else throw Error(`Unexpected write ${r.command}`);
  return { kind: 'memory_page', result };
});
function Surface() { useLang(); return <App ref={app} startPage="sessions" memoryConnected breathing={false} />; }
root.render(<Surface />);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(test: () => boolean) { for (let i = 0; i < 250; i++) { if (test()) return; await sleep(20); } throw Error('loaded-language fixture timeout'); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw Error(id); }
const languages = [
  { language: 'en', branch: 'Branch', mock: 'Local Mock', events: 'events', yes: 'yes', no: 'no', prepared: 'prepared', tools: 'tool', reader: 'Read saved answer context' },
  { language: 'zh-Hans', branch: '分支', mock: '本地 Mock', events: '事件', yes: '是', no: '否', prepared: '准备于', tools: '工具', reader: '读取已保存回答的上下文' },
  { language: 'ja', branch: '分岐', mock: 'ローカル Mock', events: 'イベント', yes: 'はい', no: 'いいえ', prepared: '準備', tools: 'ツール', reader: '保存済み回答のコンテキストを読み取る' },
];
try {
  await wait(() => !!fixture.querySelector('.mem-session-row')); fixture.querySelector<HTMLButtonElement>('.mem-session-row')!.click();
  await wait(() => !!fixture.querySelector('#mem-ask') && !fixture.querySelector<HTMLTextAreaElement>('#mem-ask')!.disabled);
  for (const row of languages) {
    await setLang(row.language as Lang); await sleep(30);
    check(`${row.language}_loaded_branch_count_and_composer_are_localized`, fixture.querySelector('.mem-session-heading [title="br_synthetic"]')!.textContent!.startsWith(row.branch) && fixture.querySelector('.mem-session-row .qr25')!.textContent!.includes(row.events) && fixture.querySelector('label[for="mem-ask"]')!.textContent!.toLowerCase().includes(row.mock.toLowerCase()));
    check(`${row.language}_mock_status_and_context_reader_are_localized`, fixture.querySelector('.mem-response-status')!.textContent!.startsWith(row.mock) && fixture.querySelector('.mem-response-status')!.parentElement!.querySelector('button')!.textContent === row.reader);
    check(`${row.language}_saved_answer_bytes_are_preserved`, fixture.querySelector('.mem-recorded-response pre')!.textContent === recorded && fixture.querySelector('.mem-response-status')!.parentElement!.textContent!.includes(statement));
  }
  app.current!.inspectCapsule('cap_synthetic'); await wait(() => !!fixture.querySelector('.mem-saved-query'));
  fixture.querySelector<HTMLButtonElement>('.mem-context>.qr88 button')!.click(); await wait(() => !!fixture.querySelector('.mem-context>.qr88 pre'));
  for (const row of languages) {
    await setLang(row.language as Lang); await sleep(30);
    const cells = [...fixture.querySelectorAll('.mem-table td:last-child')].map(c => c.textContent);
    check(`${row.language}_source_reachability_uses_interface_language`, cells.join('|') === `${row.yes}|${row.no}`);
    check(`${row.language}_dispatch_time_and_tool_labels_are_localized`, fixture.querySelector('.mem-context>.qr88')!.textContent!.includes(row.prepared) && [...fixture.querySelectorAll('.mem-context>.qr88 p.mem-muted')].some(p => p.textContent!.includes(row.tools)));
    check(`${row.language}_saved_request_and_technical_destination_are_preserved`, fixture.querySelector('.mem-context>.qr88 pre')!.textContent === requestText && fixture.querySelector('.mem-state-line')!.textContent!.includes('local_mock'));
  }
  check('language_changes_do_not_send_or_recompute', calls.every(c => ['workspace_status', 'session_list', 'session_detail', 'operation_list', 'provider_status', 'context_inspect', 'dispatch_inspect'].includes(c)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
