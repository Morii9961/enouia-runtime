// Browser demo of the shared navigation. No native transport or personal data.
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import { setLang, useLang, type Lang } from '../src/i18n';

const fixture = document.getElementById('fixture')!, root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [];
function Surface() { useLang(); return <App memoryConnected={false} breathing={false} />; }
root.render(<Surface />);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(test: () => boolean) { for (let i = 0; i < 250; i++) { if (test()) return; await sleep(20); } throw Error('navigation fixture timeout'); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw Error(id); }
try {
  for (const [language, name] of [['en', 'Primary'], ['zh-Hans', '主导航'], ['ja', 'メインナビゲーション']] as [Lang, string][]) {
    await setLang(language);
    await wait(() => fixture.querySelector('[data-runtime-nav="primary"]')?.getAttribute('aria-label') === name);
    const nav = fixture.querySelector('[data-runtime-nav="primary"]')!;
    check(`${language}_stable_hook_retains_localized_accessible_name`, nav.getAttribute('aria-label') === name && fixture.querySelectorAll('[data-runtime-nav="primary"]').length === 1);
    check(`${language}_page_hooks_are_language_independent`, [...nav.querySelectorAll('button')].map(b => b.dataset.runtimePage).join(',') === 'home,memory,context,sessions,runtime,settings');
    nav.querySelector<HTMLButtonElement>('[data-runtime-page="sessions"]')!.click();
    await wait(() => nav.querySelector('[data-runtime-page="sessions"]')?.getAttribute('aria-current') === 'page');
    check(`${language}_stable_sessions_hook_reaches_actual_surface`, fixture.querySelector('[data-screen-label]')?.getAttribute('data-screen-label') === 'Sessions');
    nav.querySelector<HTMLButtonElement>('[data-runtime-page="home"]')!.click();
    await wait(() => nav.querySelector('[data-runtime-page="home"]')?.getAttribute('aria-current') === 'page');
  }
  fixture.querySelector<HTMLButtonElement>('[data-runtime-page="settings"]')!.click();
  await wait(()=>!!fixture.querySelector('[data-screen-label="Settings"] .qr173'));
  const reduced=fixture.querySelectorAll<HTMLButtonElement>('[data-screen-label="Settings"] .qr173 button')[1];
  reduced.click();await wait(()=>reduced.getAttribute('aria-pressed')==='true');reduced.focus();
  for(const language of ['en','zh-Hans','ja'] as Lang[]){
    await setLang(language);await sleep(30);
    check(`${language}_motion_preference_keeps_control_and_focus`,fixture.querySelectorAll('[data-screen-label="Settings"] .qr173 button')[1]===reduced&&document.activeElement===reduced);
    check(`${language}_motion_preference_remains_reduced`,reduced.getAttribute('aria-pressed')==='true'&&fixture.querySelector('.bg-app')?.getAttribute('data-motion')==='reduced');
  }
  fixture.querySelector<HTMLButtonElement>('[data-runtime-page="memory"]')!.click();
  await wait(()=>!!fixture.querySelector('button.qr26[aria-pressed="true"]'));
  const collection=fixture.querySelector<HTMLButtonElement>('button.qr26[aria-pressed="true"]')!;collection.focus();
  for(const language of ['en','zh-Hans','ja'] as Lang[]){
    await setLang(language);await sleep(30);
    check(`${language}_demo_collection_keeps_control_and_focus`,fixture.querySelector('button.qr26[aria-pressed="true"]')===collection&&document.activeElement===collection);
    check(`${language}_demo_collection_selection_is_unchanged`,collection.getAttribute('aria-pressed')==='true'&&fixture.querySelector('[data-screen-label]')?.getAttribute('data-screen-label')==='Memory Vault');
  }
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById('results')!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok) }, null, 2); }
