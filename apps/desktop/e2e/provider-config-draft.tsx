// The actual local settings-draft form; no native transport or Provider.
import { createRoot } from "react-dom/client";
import { ProviderConfigDraft } from "../src/memory/ProviderConfigDraft";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!, root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [], copied: string[] = [];
let failCopy = false, holdCopy = false, release: (() => void) | null = null;
const releaseCopy = () => { const next = release; release = null; next?.(); };
const copy = async (text: string) => {
  copied.push(text);
  if (holdCopy) { holdCopy = false; await new Promise<void>(resolve => { release = resolve; }); }
  if (failCopy) throw new Error("Synthetic clipboard refusal");
};
const render = (disabled = false) => root.render(<ProviderConfigDraft disabled={disabled} copy={copy} />);
const text = () => fixture.textContent ?? "";
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const label = (text: string) => [...fixture.querySelectorAll<HTMLLabelElement>("label")].find(item => item.textContent?.trim() === text)!;
const input = (text: string) => {
  const item = label(text);
  return (item.htmlFor ? document.getElementById(item.htmlFor) : item.querySelector("input")) as HTMLInputElement | HTMLSelectElement;
};
const output = () => fixture.querySelector<HTMLTextAreaElement>("textarea");
async function wait(predicate: () => boolean) {
  for (let n = 0; n < 250; n++) { if (predicate()) return; await sleep(20); }
  throw new Error(`UI timeout: ${text()}`);
}
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
function click(label: string) { const b = button(label); if (!b || b.disabled || b.matches(":disabled")) throw new Error(`Unavailable ${label}`); b.click(); }
async function edit(name: string, value: string) {
  const control = input(name), select = control instanceof HTMLSelectElement;
  Object.getOwnPropertyDescriptor(select ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(control, value);
  control.dispatchEvent(new Event(select ? "change" : "input", { bubbles: true }));
  await sleep(20);
}
async function toggle(name: string) { (input(name) as HTMLInputElement).click(); await sleep(20); }
async function generate() { click("Generate settings draft"); await wait(() => !!output() || !!fixture.querySelector('[role="alert"]')); }
try {
  render(); await wait(() => !!button("Generate settings draft"));
  check("initial_form_does_not_infer_a_model_or_capability", fixture.querySelectorAll("input[type=checkbox]:checked").length === 0 && !output() && !button("Copy settings draft"));
  await generate();
  check("incomplete_draft_cannot_produce_or_copy_configuration", !output() && text().includes("Choose at least one provider") && text().includes("Confirm that you checked"));
  await toggle("Configure openai");
  for (const [field, value] of [["Model ID", "synthetic-openai:v1"], ["Context window (tokens)", "128000"], ["Output limit (tokens)", "4096"], ["Capabilities verified at (UTC)", "2026-10-18T00:00:00.000Z"]]) await edit(`openai · ${field}`, value);
  await edit("openai · Streaming supported", "no");
  await edit("Attempts per session (1–1000)", "10"); await edit("Reserved token budget per session", "100000");
  await generate();
  check("complete_values_still_require_owner_verification", !output() && text().includes("Confirm that you checked"));
  await toggle("I checked these models, capabilities and limits for my API account"); await generate();
  const parsed = JSON.parse(output()!.value);
  check("generated_file_contains_only_explicit_verified_values", parsed.destinations.length === 1 && parsed.destinations[0].api === "openai" && parsed.destinations[0].model === "synthetic-openai:v1" && parsed.destinations[0].streaming === false && parsed.maxAttemptsPerSession === 10);
  check("generation_does_not_copy_save_load_or_activate", copied.length === 0 && output()!.readOnly && text().includes("does not save, load or activate") && !fixture.querySelector('input[type="password"]'));
  click("Copy settings draft"); await wait(() => text().includes("Draft copied"));
  check("copy_uses_the_inspected_exact_draft", copied[0] === output()!.value && text().includes("not been saved or loaded"));
  await edit("openai · Model ID", "synthetic-new");
  check("editing_invalidates_old_output_and_copy_acknowledgement", !output() && !text().includes("Draft copied") && !button("Copy settings draft"));
  await generate(); failCopy = true; click("Copy settings draft"); await wait(() => text().includes("Copy failed"));
  check("clipboard_failure_retains_selectable_draft", !!output() && output()!.value.includes("synthetic-new") && !text().includes("Draft copied"));
  failCopy = false; holdCopy = true; click("Copy settings draft"); await wait(() => release != null);
  const before = copied.length; button("Copy settings draft")?.click();
  check("pending_copy_does_not_submit_a_second_clipboard_write", copied.length === before && button("Copy settings draft")!.disabled);
  await edit("openai · Model ID", "synthetic-latest"); releaseCopy(); await sleep(30);
  check("late_copy_completion_cannot_acknowledge_an_edited_draft", !output() && !text().includes("Draft copied"));
  await generate();
  render(true); await sleep(30);
  // Happy DOM does not model inherited :disabled for fieldset children.
  check("disabled_host_withholds_generate_and_copy", button("Generate settings draft")!.closest("fieldset")!.disabled && button("Copy settings draft")!.disabled);
  render(); await sleep(30);
  check("host_status_rerender_preserves_unsubmitted_values", input("openai · Model ID").value === "synthetic-latest");
  holdCopy = true; click("Copy settings draft"); await wait(() => release != null);
  root.render(null); await sleep(20); render(); await wait(() => !!button("Generate settings draft"));
  releaseCopy(); await sleep(30);
  check("unmounted_copy_reply_cannot_publish_into_a_new_form", !output() && !text().includes("Draft copied") && !(input("Configure openai") as HTMLInputElement).checked);
} finally {
  releaseCopy(); root.unmount();
  document.getElementById("results")!.textContent = JSON.stringify({ passed: checks.length > 0 && checks.every(c => c.ok), checks });
}
