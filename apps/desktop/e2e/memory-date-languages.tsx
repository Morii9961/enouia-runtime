// Native Memory list with synthetic receipts. A language switch must keep focus.
import { createRoot } from 'react-dom/client';
import MemorySurface from '../src/memory/MemorySurface';
import { MemoryStatusProvider } from '../src/memory/status';
import { setTransport } from '../src/memory/client';
import { setLang, useLang, type Lang } from '../src/i18n';

const fixture = document.getElementById('fixture')!, root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [], calls: string[] = [];
const items = ['2026-11-01T10:00:00Z', '2026-10-31T10:00:00Z'].map((updatedAt, i) => ({ memoryId: `mem_synthetic_${i}`, type: 'fact', status: 'active', currency: 'current', snippet: `Literal saved English memory ${i}.`, revision: 1, updatedAt }));
setTransport(async (native, args) => {
  if (native === 'shell_status') return { vaultChanging: false };
  if (native !== 'memory_call') throw Error(native);
  const r = args.request as { command: string }; calls.push(r.command);
  if (r.command === 'workspace_status') return { kind: 'memory_page', result: { vault: { state: 'open', vaultId: 'synthetic-date-vault' }, pendingCandidates: 0 } };
  if (r.command === 'memory_list') return { kind: 'memory_page', result: { items, nextCursor: null, total: 2 } };
  throw Error(`Unexpected detail or write ${r.command}`);
});
function Surface() { useLang(); return <MemoryStatusProvider><MemorySurface /></MemoryStatusProvider>; }
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(test: () => boolean) { for (let i = 0; i < 250; i++) { if (test()) return; await sleep(20); } throw Error('Memory date fixture timeout'); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw Error(id); }
try {
  await setLang('en'); root.render(<Surface />); await wait(() => fixture.querySelectorAll('button.qr43').length === 2);
  const first = fixture.querySelector<HTMLButtonElement>('button.qr43')!, clock = first.querySelector('.qr34')!.textContent;
  first.focus();
  for (const [language, pattern] of [['en', /Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday/], ['zh-Hans', /星期/], ['ja', /曜日/]] as [Lang, RegExp][]) {
    await setLang(language); await wait(() => pattern.test(fixture.querySelector('.qr33')?.textContent ?? ''));
    check(`${language}_date_headers_follow_interface_language`, [...fixture.querySelectorAll('.qr33')].length === 2 && pattern.test(fixture.querySelector('.qr33')!.textContent!));
    check(`${language}_language_switch_keeps_row_node_and_focus`, fixture.querySelector('button.qr43') === first && document.activeElement === first);
    check(`${language}_saved_snippets_and_time_are_unchanged`, [...fixture.querySelectorAll('.qr39')].map(n => n.textContent).join('|') === items.map(i => i.snippet).join('|') && first.querySelector('.qr34')!.textContent === clock);
  }
  const collection=fixture.querySelector<HTMLButtonElement>('button.qr26[aria-pressed="true"]')!;
  collection.focus();
  for(const [language,label] of [['en','Current memories'],['zh-Hans','当前记忆'],['ja','現在の記憶']] as [Lang,string][]){
    await setLang(language);await sleep(30);
    check(`${language}_collection_navigation_keeps_node_and_focus`,fixture.querySelector('button.qr26[aria-pressed="true"]')===collection&&document.activeElement===collection);
    check(`${language}_collection_navigation_label_follows_language`,collection.querySelector('.qr24')!.textContent===label&&collection.getAttribute('aria-pressed')==='true');
  }
  check('language_changes_do_not_reload_or_inspect_memories', calls.filter(c => c === 'memory_list').length === 1 && calls.every(c => c === 'workspace_status' || c === 'memory_list'));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
