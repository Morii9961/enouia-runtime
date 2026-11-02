// Actual local-admission form; synthetic read-only model metadata only.
import { createRoot } from "react-dom/client";
import { HistoryTaskForm } from "../src/memory/HistoryTaskForm";
import { historyPage } from "../tests/history-fixture";
import type { HistoryTaskRequest } from "../src/memory/historyTasks";
import type { call } from "../src/memory/client";
import { setLang, useLang, type Lang } from "../src/i18n";

const fixture = document.getElementById("fixture")!, root = createRoot(fixture), checks: { id: string; ok: boolean }[] = [];
let vaultId = "synthetic-vault", busy = false, hold = false, release: (() => void) | null = null;
const releasePending = () => { const next = release; release = null; next?.(); };
const calls: string[] = [], submissions: HistoryTaskRequest[] = [];
const request: typeof call = async command => {
  calls.push(command);
  if (command !== "provider_status") throw new Error("Unexpected write or Provider call");
  const old = vaultId;
  if (hold) { hold = false; await new Promise<void>(resolve => { release = resolve; }); }
  return { configured: true, destinations: [{ api: "openai", model: old === "synthetic-vault" ? "synthetic-model" : "other-model", verifiedAt: "2026-10-20T00:00:00.000Z" }] };
};
function Surface(){useLang();return <HistoryTaskForm vaultId={vaultId} plan={historyPage()} selected={[1, 0]} busy={busy} request={request} onCreate={args => submissions.push(args)}/>;}
const render = () => root.render(<Surface/>);
const sleep = () => new Promise(resolve => setTimeout(resolve, 20));
const text = () => fixture.textContent ?? "";
async function wait(test: () => boolean) { for (let n = 0; n < 250; n++) { if (test()) return; await sleep(); } throw new Error(text()); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
const submit = () => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.startsWith("Create 2"))!;
async function edit(label: string, value: string) {
  const field = [...fixture.querySelectorAll<HTMLLabelElement>("label")].find(l => l.textContent === label)!;
  const input = document.getElementById(field.htmlFor) as HTMLInputElement | HTMLSelectElement;
  Object.getOwnPropertyDescriptor(input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); await sleep();
}
try {
  render(); await wait(() => text().includes("openai · synthetic-model"));
  check("model_selection_is_explicit_and_does_not_default", submit().disabled && submissions.length === 0);
  await edit("History task model", "openai/synthetic-model"); submit().click(); await sleep();
  check("selection_order_and_unknown_cost_are_preserved", submissions.length === 1 && submissions[0].batchIndices.join() === "1,0" && submissions[0].maxReservedCostMicrousd === null);
  await edit("Cost ceiling per batch (USD, optional)", "0"); submit().click(); await sleep();
  check("zero_cost_is_an_explicit_zero_ceiling", submissions[1].maxReservedCostMicrousd === 0);
  await edit("Cost ceiling per batch (USD, optional)", "1.000001"); submit().click(); await sleep();
  check("decimal_cost_has_exact_microdollar_precision", submissions[2].maxReservedCostMicrousd === 1000001);
  const cost=fixture.querySelector<HTMLInputElement>('input[id$="-cost"]')!,model=fixture.querySelector('select')!,create=submit(),modelReads=calls.length;
  cost.focus();
  for(const [language,order] of [['en','Selected order: 2 → 1'],['zh-Hans','所选顺序：2 → 1'],['ja','選択順序：2 → 1']] as [Lang,string][]){
    await setLang(language);await sleep();await sleep();
    check(`${language}_task_selection_order_is_localized`,text().includes(order)&&text().includes('2/32'));
    check(`${language}_language_keeps_exact_limits_model_and_focus`,cost.isConnected&&cost.value==='1.000001'&&document.activeElement===cost&&fixture.querySelector('select')===model&&model.value==='openai/synthetic-model'&&create.isConnected&&!create.disabled);
  }
  check('task_form_language_does_not_read_models_or_submit',calls.length===modelReads&&submissions.length===3);
  await setLang('en');await sleep();await sleep();
  await edit("Maximum suggestions per batch (1–32)", "33");
  check("invalid_per_batch_bounds_block_admission", submit().disabled);
  await edit("Maximum suggestions per batch (1–32)", "2");
  busy = true; render(); await sleep(); submit().click();
  check("owner_busy_blocks_duplicate_admission_and_model_refresh", submit().disabled && submissions.length === 3);
  busy = false; render(); await sleep(); hold = true;
  [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Read configured history models")!.click();
  await wait(() => release !== null); vaultId = "other-vault"; render(); await wait(() => text().includes("other-model"));
  releasePending(); await sleep();
  check("late_model_observation_cannot_cross_vaults", !text().includes("openai · synthetic-model") && submit().disabled);
  check("form_only_reads_model_metadata", calls.every(command => command === "provider_status"));
  document.getElementById("results")!.textContent = JSON.stringify({ fixture: "history-task-form", passed: checks.every(c => c.ok), checks });
} finally { releasePending(); root.unmount(); }
