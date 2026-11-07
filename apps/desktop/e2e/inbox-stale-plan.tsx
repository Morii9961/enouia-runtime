// Actual candidate inbox and review dialog; a stale plan is synthetic, all IPC is mocked.
import { createRoot } from 'react-dom/client';
import { Inbox } from '../src/memory/MemorySurface';
import { MemoryStatusProvider } from '../src/memory/status';
import { setTransport } from '../src/memory/client';
import { setLang, useLang, type Lang } from '../src/i18n';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';

type Request = { command: string; arguments: Record<string, unknown>; idempotencyKey: string | null };
const fixture = document.getElementById('fixture')!;
const checks: { id: string; ok: boolean }[] = [], calls: Request[] = [];
let revision = 1;
const candidate = () => ({ candidateId: 'candidate-synthetic', revision, content: revision === 1 ? 'Original synthetic proposal' : 'Synthetic proposal changed elsewhere', proposalKind: 'create', proposedType: 'fact', sensitivity: 'normal', originKind: 'manual', createdAt: '2026-10-15T00:00:00Z', evidence: [], conflicts: [], target: null });
setTransport(async (native, args) => {
  if (native === 'shell_status') return { vaultChanging: false };
  if (native !== 'memory_call') throw new Error(`Unexpected native ${native}`);
  const r = args.request as Request; calls.push(structuredClone(r));
  let result: unknown;
  switch (r.command) {
    case 'workspace_status': result = { vault: { state: 'open' }, pendingCandidates: 1 }; break;
    case 'candidate_list': result = { items: [candidate()], total: 1, nextCursor: null }; break;
    case 'review_plan': result = { planId: `plan-synthetic-r${revision}`, operationKind: 'review', diffHash: 'synthetic-hash', confirmCode: 'FIXTURE', expiresAt: '2030-01-01T00:00:00Z', records: [] }; break;
    case 'review_confirm': revision = 2; return { kind: 'memory_error', error: { code: 'revision_conflict', retryable: false, rules: ['review.stale_plan'] } };
    case 'review_discard': result = null; break;
    default: throw new Error(`Unexpected command ${r.command}`);
  }
  return { kind: 'memory_page', result };
});
function Surface() { useLang(); return <MemoryStatusProvider><Inbox /></MemoryStatusProvider>; }
const root = createRoot(fixture); root.render(<Surface />);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const text = () => fixture.textContent ?? '';
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label);
const textarea = () => fixture.querySelector<HTMLTextAreaElement>('article textarea')!;
const sent = (command: string) => calls.filter(c => c.command === command);
async function wait(test: () => boolean) { for (let n = 0; n < 250; n++) { if (test()) return; await sleep(20); } throw new Error(`UI timeout: ${text()}`); }
function click(control: HTMLButtonElement | undefined) { if (!control || control.disabled) throw new Error('Unavailable control'); control.click(); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
const draft = 'Owner draft that must survive — 中文と日本語';
const stale = 'The content changed since you reviewed it. Review it again';
try {
  await wait(() => !!fixture.querySelector('article textarea') && button('Refresh candidates')?.disabled === false);
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea(), draft);
  textarea().dispatchEvent(new Event('input', { bubbles: true })); await sleep(30);
  click(button('Accept with edits…'));
  await wait(() => !!button('Confirm (FIXTURE)'));
  check('plan_uses_draft_and_observed_revision', (sent('review_plan')[0].arguments.decisions as any[])[0].editedContent === draft && (sent('review_plan')[0].arguments.decisions as any[])[0].revision === 1);
  click(button('Confirm (FIXTURE)'));
  await wait(() => !!fixture.querySelector('dialog [role="alert"]'));
  check('stale_plan_is_explained_inside_the_dialog', fixture.querySelector('dialog [role="alert"]')!.textContent!.includes(stale));
  check('stale_plan_blocks_confirm_and_offers_no_retry', button('Confirm (FIXTURE)')?.disabled === true && !button('Retry') && text().includes('This confirmation cannot be retried.'));
  check('stale_plan_confirm_is_sent_once_without_replanning', sent('review_confirm').length === 1 && sent('review_plan').length === 1);
  const held = calls.length;
  for (const [language, message] of [['zh-Hans', '你审阅之后内容变了。请重新审阅'], ['ja', 'レビューした後に内容が変わりました。もう一度レビューしてください'], ['en', stale]]) {
    await setLang(language as Lang); await sleep(30);
    check(`${language}_stale_plan_translates_without_resend`, !!fixture.querySelector('dialog [role="alert"]')?.textContent?.includes(message) && calls.slice(held).every(c => c.command === 'workspace_status'));
  }
  click(button('Cancel'));
  await wait(() => !button('Confirm (FIXTURE)') && sent('candidate_list').length >= 2 && !!fixture.querySelector('article') && fixture.querySelector('article')!.textContent!.includes('r2'));
  check('cancel_discards_the_stale_plan', sent('review_discard').length === 1 && sent('review_discard')[0].arguments.planId === 'plan-synthetic-r1');
  check('refreshed_revision_is_visible_and_unsent_draft_is_kept', textarea().value === draft);
  const saved = 'Saved proposal (r2): Synthetic proposal changed elsewhere';
  check('kept_draft_shows_the_changed_saved_proposal', text().includes(saved));
  for (const [language, message] of [['zh-Hans', '已保存的提议（r2）：Synthetic proposal changed elsewhere'], ['ja', '保存済みの提案（r2）：Synthetic proposal changed elsewhere'], ['en', saved]]) {
    await setLang(language as Lang); await sleep(30);
    check(`${language}_saved_proposal_label_translates_with_literal_content`, text().includes(message) && textarea().value === draft);
  }
  click(button('Accept with edits…'));
  await wait(() => sent('review_plan').length === 2);
  const second = (sent('review_plan')[1].arguments.decisions as any[])[0];
  check('new_plan_uses_kept_draft_against_fresh_revision', second.editedContent === draft && second.revision === 2);
  await wait(() => !!button('Cancel')); click(button('Cancel'));
  await wait(() => !button('Confirm (FIXTURE)') && sent('review_discard').length === 2);
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea(), 'Synthetic proposal changed elsewhere');
  textarea().dispatchEvent(new Event('input', { bubbles: true })); await sleep(30);
  check('matching_draft_hides_the_saved_proposal_line', !text().includes('Saved proposal (r2)'));
  check('only_review_reads_and_one_confirm_were_sent', calls.every(c => ['workspace_status', 'candidate_list', 'review_plan', 'review_confirm', 'review_discard'].includes(c.command)) && sent('review_confirm').length === 1);
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls: calls.map(c => c.command) }); }
