// Native-save admission/replies in the actual draft form. All IO is injected.
import { createRoot } from "react-dom/client";
import { ProviderConfigDraft } from "../src/memory/ProviderConfigDraft";
import { setTransport, type DraftSaveResult } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!, root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [], saved: string[] = [], native: string[] = [];
let cancelled = true, fail = false, hold = false, release: (() => void) | null = null;
const releaseSave = () => { const next = release; release = null; next?.(); };
setTransport(async command => { native.push(command); throw new Error("No other native operation is permitted in this fixture"); });
const save = async (draft: string): Promise<DraftSaveResult> => {
  saved.push(draft);
  if (hold) { hold = false; await new Promise<void>(resolve => { release = resolve; }); }
  if (fail) throw "provider_setup.draft_save_failed";
  return cancelled ? { cancelled: true } : { saved: true, file: "memory-providers.json" };
};
const copied: string[] = [];
const render = () => root.render(<ProviderConfigDraft save={save} copy={async draft => { copied.push(draft); }} />);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const text = () => fixture.textContent ?? "";
const button = (text: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === text);
const input = (text: string) => {
  const item = [...fixture.querySelectorAll<HTMLLabelElement>("label")].find(item => item.textContent?.trim() === text)!;
  return (item.htmlFor ? document.getElementById(item.htmlFor) : item.querySelector("input")) as HTMLInputElement | HTMLSelectElement;
};
const output = () => fixture.querySelector<HTMLTextAreaElement>("textarea");
async function wait(predicate: () => boolean) {
  for (let n = 0; n < 250; n++) { if (predicate()) return; await sleep(20); }
  throw new Error(`UI timeout: ${text()}`);
}
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
function click(label: string) { const control = button(label); if (!control || control.disabled) throw new Error(`Unavailable ${label}`); control.click(); }
async function edit(label: string, value: string) {
  const control = input(label), select = control instanceof HTMLSelectElement;
  Object.getOwnPropertyDescriptor(select ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(control, value);
  control.dispatchEvent(new Event(select ? "change" : "input", { bubbles: true })); await sleep(20);
}
async function fill() {
  (input("Configure openai") as HTMLInputElement).click(); await sleep(20);
  for (const [field, value] of [["Model ID", "synthetic-save"], ["Context window (tokens)", "128000"], ["Output limit (tokens)", "4096"], ["Capabilities verified at (UTC)", "2026-10-18T00:00:00.000Z"]]) await edit(`openai · ${field}`, value);
  await edit("openai · Streaming supported", "no"); await edit("Attempts per session (1–1000)", "10"); await edit("Reserved token budget per session", "100000");
  (input("I checked these models, capabilities and limits for my API account") as HTMLInputElement).click(); await sleep(20);
  click("Generate settings draft"); await wait(() => !!output());
}
try {
  render(); await wait(() => !!button("Generate settings draft"));
  check("native_save_is_unavailable_before_an_inspected_draft", !button("Save settings draft…") && saved.length === 0);
  await fill(); const draft = output()!.value;
  check("generation_does_not_open_a_save_dialog", saved.length === 0);
  click("Save settings draft…"); await wait(() => text().includes("Save cancelled"));
  check("cancellation_keeps_draft_and_does_not_claim_a_write", output()!.value === draft && !text().includes("Settings draft saved"));
  cancelled = false; click("Save settings draft…"); await wait(() => text().includes("Settings draft saved"));
  check("native_save_receives_the_exact_inspected_json", saved.length === 2 && saved.every(item => item === draft));
  check("saved_file_is_not_reported_as_loaded_or_sent", text().includes("running Core has not reloaded") && native.length === 0);
  click("Copy settings draft"); await wait(() => text().includes("Draft copied"));
  check("copy_after_save_does_not_deny_the_prior_save", copied[0] === draft && text().includes("Copying does not save or reload") && !text().includes("has not been saved"));
  fail = true; click("Save settings draft…"); await wait(() => text().includes("Save result is not confirmed"));
  check("ambiguous_save_error_retains_the_draft_without_false_success", output()!.value === draft && !text().includes("Settings draft saved") && !button("Save settings draft…")!.disabled);
  const afterFailure = saved.length; await sleep(25);
  check("save_failure_does_not_retry_automatically", saved.length === afterFailure);
  fail = false; hold = true; button("Save settings draft…")!.focus(); click("Save settings draft…"); await wait(() => release != null);
  const before = saved.length; button("Save settings draft…")!.click();
  check("held_save_cannot_duplicate_or_copy", saved.length === before && button("Save settings draft…")!.disabled && button("Copy settings draft")!.disabled);
  await edit("openai · Model ID", "must-not-change-during-save");
  fixture.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await sleep(20);
  check("save_holds_its_draft_against_programmatic_edits_and_generation", input("openai · Model ID").value === "synthetic-save" && output()!.value === draft);
  // Model native disabled-control focus fixup absent in Happy DOM.
  button("Save settings draft…")!.blur(); releaseSave();
  await wait(() => !button("Save settings draft…")!.disabled);
  check("save_completion_restores_owned_focus", document.activeElement === button("Save settings draft…"));
  hold = true; click("Save settings draft…"); await wait(() => release != null);
  output()!.focus(); releaseSave(); await wait(() => !button("Save settings draft…")!.disabled);
  check("save_completion_respects_focus_moved_elsewhere", document.activeElement === output());
  hold = true; click("Save settings draft…"); await wait(() => release != null);
  root.render(null); await sleep(20); render(); await wait(() => !!button("Generate settings draft"));
  releaseSave(); await sleep(25);
  check("late_save_reply_does_not_publish_into_a_new_form", !output() && !text().includes("Settings draft saved"));
  check("save_flow_never_reloads_requests_keys_or_calls_models", native.length === 0);
} finally {
  releaseSave(); root.unmount();
  document.getElementById("results")!.textContent = JSON.stringify({ passed: checks.length > 0 && checks.every(c => c.ok), checks });
}
