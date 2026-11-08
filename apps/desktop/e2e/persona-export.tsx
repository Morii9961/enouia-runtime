// Actual Memory surface -> Public persona export. The Core replies are
// Enouia Memory's synthetic fixtures (pin 731edd5); no picker, folder or
// Vault is used.
import { createRoot } from 'react-dom/client';
import MemorySurface from '../src/memory/MemorySurface';
import { MemoryStatusProvider } from '../src/memory/status';
import { setTransport } from '../src/memory/client';
import { EXPORTED_AT_SLOT, fileText } from '../src/memory/persona';
import options from '../tests/fixtures/persona/options.json';
import preview from '../tests/fixtures/persona/preview.json';
import receipt from '../tests/fixtures/persona/receipt.json';
import '../src/quiet-runtime.css';
import '../src/memory/memory.css';

type Request = { command: string; arguments: Record<string, unknown>; idempotencyKey: string | null };
const fixture = document.getElementById('fixture')!;
const checks: { id: string; ok: boolean }[] = [], calls: Request[] = [];
const root = createRoot(fixture);
let picks = 0, cancelPick = false;
let exportReply: 'refuse' | 'lost' | 'storage' | 'receipt' = 'refuse';
setTransport(async (native, args) => {
  if (native === 'shell_status') return { vaultChanging: false };
  if (native === 'memory_pick') {
    picks++;
    if (args.kind !== 'persona_destination') throw new Error(`Unexpected pick ${String(args.kind)}`);
    return cancelPick ? { cancelled: true } : { token: `token-${picks}`, displayName: 'Synthetic folder', bytes: null };
  }
  if (native !== 'memory_call') throw new Error(`Unexpected native ${native}`);
  const r = args.request as Request; calls.push(r); let result: unknown;
  switch (r.command) {
    case 'workspace_status': result = { vault: { state: 'open', vaultId: 'vlt-synthetic' }, pendingCandidates: 0 }; break;
    case 'memory_list': result = { items: [], total: 0, nextCursor: null }; break;
    case 'persona_options': result = options; break;
    case 'persona_preview': result = preview; break;
    case 'persona_export':
      if (exportReply === 'refuse') return { kind: 'memory_error', error: { code: 'invalid_request', retryable: false, rules: ['persona.destination_rejected', 'root.inside_repository'] } };
      if (exportReply === 'lost') throw 'worker_failed';
      if (exportReply === 'storage') return { kind: 'memory_error', error: { code: 'storage_failed', retryable: false, rules: ['fault.io'] } };
      result = receipt; break;
    default: throw new Error(`Unexpected command ${r.command}`);
  }
  return { kind: 'memory_page', result };
});
const text = () => fixture.textContent ?? '';
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label);
const box = (label: string) => [...fixture.querySelectorAll<HTMLLabelElement>('label.mem-choice')].find(l => l.textContent?.includes(label))?.querySelector('input') as HTMLInputElement;
const exportButton = () => button('Choose folder and export…')!;
const exports = () => calls.filter(r => r.command === 'persona_export');
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(test: () => boolean) { for (let n = 0; n < 250; n++) { if (test()) return; await sleep(20); } throw new Error(`UI timeout: ${text().slice(0, 400)}`); }
function click(control: HTMLElement | undefined) { if (!control || (control as HTMLButtonElement).disabled) throw new Error('Unavailable control'); control.click(); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
const acknowledge = async () => {
  click(box('model providers')); click(box('asking questions'));
  await wait(() => !exportButton().disabled);
};
const previewAgain = async () => {
  click(button('Preview the file') ?? button('Preview again'));
  await wait(() => !!fixture.querySelector('pre.mem-pre-file'));
};
function Surface() { return <MemoryStatusProvider><MemorySurface /></MemoryStatusProvider>; }
try {
  root.render(<Surface />);
  await wait(() => !!button('Public persona export'));
  click(button('Public persona export'));
  await wait(() => text().includes('（合成公开）喜欢看星星。'));
  const knowledge = [...fixture.querySelectorAll('fieldset')].find(f => f.querySelector('legend')?.textContent === 'Public knowledge')!;
  const listed = knowledge.querySelectorAll('input[type="checkbox"]');
  check('lists_exactly_the_public_records_memory_offers', listed.length === options.publicMemories.length);
  check('prefills_the_last_identity_and_only_listed_last_records', (fixture.querySelector('input[type="radio"]') as HTMLInputElement).checked
    && box('喜欢看星星').checked && box('番茄炒蛋').checked && !box('没有被勾选').checked && !box('爬山').checked);
  check('last_records_no_longer_listed_are_named_not_sent', text().includes('2 records from the last export are no longer listed'));
  check('no_export_before_preview', exportButton().disabled && text().includes('No export in this window yet.'));

  await previewAgain();
  const sent = calls.find(r => r.command === 'persona_preview')!;
  check('preview_sends_the_exact_selection_without_a_key', sent.idempotencyKey === null && JSON.stringify(sent.arguments) === JSON.stringify({
    audience: 'public_group', identityId: options.identities[0].identityId, identityRevision: 1,
    memoryIds: ['mem_00000000-0000-4000-8000-00000000b01f', 'mem_00000000-0000-4000-8000-00000000b05f'] }));
  const shown = fixture.querySelector('pre.mem-pre-file')!;
  const slot = shown.querySelector('.mem-slot')!.textContent!;
  const [before, after] = fileText(preview, EXPORTED_AT_SLOT, preview.memoryVersion).split(JSON.stringify(EXPORTED_AT_SLOT));
  check('preview_shows_every_character_of_the_file_except_exported_at', shown.textContent === before + slot + after);
  const removed = [...fixture.querySelectorAll('.mem-diff-list li')].find(li => li.textContent?.includes('pkn_d3fe70390312c9e982b7cd4bd3acedea'))!;
  check('removed_item_row_shows_ids_only', removed.textContent!.includes('text not shown') && !removed.textContent!.includes('（合成'));
  check('diff_and_exclusion_counts_are_shown', text().includes('Changes since the last export (v1)') && text().includes('pkn_d3fe70390312c9e982b7cd4bd3acedea') && text().includes('text not shown')
    && text().includes('Records not public (private)') && text().includes('Checked but unavailable') && text().includes('3 public items name people'));

  click(box('model providers')); await sleep(30);
  check('one_acknowledgement_is_not_enough', exportButton().disabled);
  click(box('asking questions')); await wait(() => !exportButton().disabled);
  check('both_acknowledgements_enable_export', !exportButton().disabled);
  click(box('爬山')); await sleep(30);
  check('selection_change_withdraws_preview_and_acknowledgements', !fixture.querySelector('pre.mem-pre-file') && !box('model providers').checked && !box('asking questions').checked && exportButton().disabled);

  await previewAgain(); await acknowledge();
  cancelPick = true; click(exportButton()); await sleep(60);
  check('cancelled_picker_sends_nothing', exports().length === 0 && picks === 1);
  cancelPick = false;

  click(exportButton()); await wait(() => text().includes('Memory answered:'));
  check('memory_refusal_is_shown_as_given', text().includes('invalid_request · persona.destination_rejected · root.inside_repository') && text().includes('Memory refused this folder'));
  check('refusal_is_not_an_export_and_keeps_no_request', !text().includes('Outcome unknown') && text().includes('No export in this window yet.') && !exportButton().disabled);

  exportReply = 'lost'; click(exportButton()); await wait(() => text().includes('Outcome unknown'));
  const lost = exports().at(-1)!;
  await sleep(200);
  check('lost_response_is_kept_and_never_resent_automatically', exports().length === 2 && !!button('Send the same request again') && exportButton().disabled && text().includes('No export in this window yet.'));
  check('host_failure_is_not_presented_as_memory_answer', text().includes('Runtime reported: worker_failed') && !text().includes('Memory answered: worker_failed'));
  check('kept_request_locks_the_selection', box('爬山').closest('fieldset')!.disabled && box('model providers').checked);

  click(button('Current memories')); await wait(() => !button('Send the same request again'));
  click(button('Public persona export')); await wait(() => !!button('Send the same request again'));
  check('kept_request_survives_a_page_switch', text().includes('Outcome unknown') && !!fixture.querySelector('pre.mem-pre-file'));

  exportReply = 'storage'; click(button('Send the same request again')); await wait(() => text().includes('fault.io'));
  check('failed_resend_keeps_the_request', !!button('Send the same request again') && exports().length === 3);

  exportReply = 'receipt'; click(button('Send the same request again')); await wait(() => text().includes('Memory wrote'));
  const resends = exports().slice(1);
  check('resend_uses_the_same_key_and_arguments', resends.every(r => r.idempotencyKey === lost.idempotencyKey && JSON.stringify(r.arguments) === JSON.stringify(lost.arguments))
    && lost.idempotencyKey !== exports()[0].idempotencyKey);
  await wait(() => text().includes('has the same SHA-256 as the written file'));
  check('receipt_shows_sha256_and_version', text().includes(receipt.fileSha256) && text().includes('v2') && text().includes(receipt.fileName));
  check('receipt_verifies_the_previewed_text', !text().includes('does not match the file SHA-256'));
  check('written_file_text_replaces_the_slot', !fixture.querySelector('.mem-slot') && fixture.querySelector('pre.mem-pre-file')!.textContent === fileText(preview, receipt.exportedAt, receipt.memoryVersion));
  check('acknowledgements_are_cleared_after_export', !box('model providers').checked && exportButton().disabled);
  check('another_export_needs_a_new_preview', box('model providers').closest('fieldset')!.disabled && text().includes('preview again before another export'));
  await previewAgain(); await acknowledge();
  check('fresh_preview_allows_a_new_decision', !exportButton().disabled && !!fixture.querySelector('.mem-slot'));
  check('journey_uses_only_persona_and_status_reads', calls.every(r => ['workspace_status', 'memory_list', 'persona_options', 'persona_preview', 'persona_export'].includes(r.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), picks, exports: exports().length }, null, 2); }
