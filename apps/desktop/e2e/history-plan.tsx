// The actual Import report and history UI, with synthetic native IPC only.
import { createRoot } from "react-dom/client";
import { ImportReport } from "../src/memory/ImportReport";
import { setTransport, type J } from "../src/memory/client";
import { historyPage, historySelection, PLAN_HASH } from "../tests/history-fixture";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!, root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [], calls: { command: string; args: J; key: unknown }[] = [];
let current = true, duplicate = false, status = "completed", revision = 7, vaultId = historySelection.vaultId;
let vaultHead = "synthetic-observed-head-1";
let hold = false, fail = false, mismatch = false, release: (() => void) | null = null;
const releasePending = () => { const next = release; release = null; next?.(); };
setTransport(async (native, args) => {
  if (native !== "memory_call") throw new Error(`Unexpected native ${native}`);
  const request = args.request as { command: string; arguments: J; idempotencyKey: unknown };
  calls.push({ command: request.command, args: structuredClone(request.arguments), key: request.idempotencyKey });
  if (request.command !== "history_plan") throw new Error(`Unexpected Core ${request.command}`);
  const reply = historyPage({ ...request.arguments, vaultId });
  if (mismatch) reply.identity.importId = "another-import";
  if (hold) { hold = false; await new Promise<void>(resolve => { release = resolve; }); }
  if (fail) return { kind: "memory_error", error: { code: "revision_conflict", retryable: true, rules: ["history.plan_stale"] } };
  return { kind: "history_plan", result: reply };
});
const render = () => root.render(<ImportReport selected={historySelection.importId} current={current} vaultId={vaultId} vaultHead={vaultHead}
  row={{ importId: historySelection.importId, revision, status, duplicateOf: duplicate ? "synthetic-original" : null,
    inputKind: "chatgpt_conversations_json", warnings: [], counts: {} }} close={() => { current = false; render(); }} />);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === label);
const planButton = () => button("Plan archived history") ?? button("Read history plan again");
const details = () => fixture.querySelectorAll("details");
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
function click(control: HTMLButtonElement | undefined) { if (!control || control.disabled) throw new Error("Unavailable control"); control.click(); }
async function wait(predicate: () => boolean) { for (let n = 0; n < 250; n++) { if (predicate()) return; await sleep(20); } throw new Error(`UI timeout: ${text()}`); }
async function edit(label: string, value: string) {
  const field = [...fixture.querySelectorAll<HTMLLabelElement>("label")].find(item => item.textContent === label)!;
  const input = document.getElementById(field.htmlFor) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,value);
  input.dispatchEvent(new Event("input",{bubbles:true})); await sleep(20);
}
try {
  render(); await wait(() => !!planButton());
  check("opening_the_report_does_not_plan_or_send", calls.length === 0 && details().length === 0);
  click(planButton()); await wait(() => details().length === 10);
  check("explicit_planning_uses_only_observed_archive_revision_and_bounds", calls[0].args.importId === historySelection.importId && calls[0].args.importRevision === 7 && calls[0].args.messagesPerBatch === 15 && calls[0].args.maxPathReferences === 10000 && calls[0].args.cursor === null);
  check("coverage_unknowns_and_nonapproval_are_explicit", text().includes("Unknown time") && text().includes("Unparseable items") && text().includes("not all platform history") && text().includes("not owner approval"));
  check("source_roles_and_evidence_are_not_promoted", text().includes("assistant / model_claim") && text().includes("synthetic-source-1") && !button("Send once") && !button("Confirm"));
  click(button("Next history batches")); await wait(() => details().length === 2);
  check("next_page_uses_only_the_core_cursor_and_replaces_old_batches", calls[1].args.cursor === `${PLAN_HASH}:10` && [...details()].some(item => item.textContent?.includes("Batch 11")) && ![...details()].some(item => item.textContent?.startsWith("Batch 1 ·")) && !button("Next history batches"));
  await edit("Path reference budget (1–100000)","20000");
  check("editing_bounds_invalidates_the_old_plan", details().length === 0 && !text().includes(`Plan ${PLAN_HASH}`));
  await edit("Messages per batch (1–15)","0");
  check("invalid_bounds_cannot_submit_a_plan", planButton()!.disabled && calls.length === 2);
  await edit("Messages per batch (1–15)","15");
  hold = true; planButton()!.focus(); click(planButton()); await wait(() => release != null);
  const before = calls.length; planButton()!.click();
  await edit("Path reference budget (1–100000)","must-not-change");
  check("a_pending_read_cannot_duplicate_or_change_its_parameters", calls.length === before && planButton()!.disabled);
  planButton()!.blur(); releasePending(); await wait(() => details().length === 10);
  check("completion_restores_owned_focus_and_uses_held_bounds", document.activeElement === planButton() && calls.at(-1)!.args.maxPathReferences === 20000);
  fail = true; click(button("Next history batches")); await wait(() => text().includes("No plan is current"));
  check("a_stale_page_clears_old_references_and_offers_a_fresh_read", details().length === 0 && !button("Next history batches") && !button("Retry") && !!button("Read history plan again"));
  fail = false; click(planButton()); await wait(() => details().length === 10);
  check("recovery_starts_from_a_fresh_first_page", calls.at(-1)!.args.cursor === null);
  mismatch = true; click(planButton()); await wait(() => text().includes("No plan is current"));
  check("mixed_archive_replies_never_become_a_plan", details().length === 0);
  mismatch = false; hold = true; click(planButton()); await wait(() => release != null);
  current = false; render(); await wait(() => !planButton());
  releasePending(); await sleep(30);
  check("pending_or_failed_list_observation_withholds_late_plan_results", details().length === 0 && !planButton());
  current = true; render(); await wait(() => !!planButton());
  hold = true; click(planButton()); await wait(() => release != null);
  revision = 8; render(); await wait(() => !!button("Plan archived history")); releasePending(); await sleep(30);
  check("new_import_revision_gets_a_fresh_plan_instance", details().length === 0 && !text().includes(`Plan ${PLAN_HASH}`));
  hold = true; click(planButton()); await wait(() => release != null);
  vaultId = "another-vault"; render(); await wait(() => !!button("Plan archived history")); releasePending(); await sleep(30);
  check("vault_switch_invalidates_a_late_plan", details().length === 0);
  click(planButton()); await wait(() => details().length === 10);
  const headReadCount = calls.length;
  vaultHead = "synthetic-observed-head-2"; render(); await wait(() => !!button("Plan archived history"));
  check("observed_head_change_clears_references_without_automatic_planning", details().length === 0 && calls.length === headReadCount);
  hold = true; click(planButton()); await wait(() => release != null);
  vaultHead = "synthetic-observed-head-3"; render(); await wait(() => !!button("Plan archived history")); releasePending(); await sleep(30);
  check("observed_head_change_discards_a_late_plan", details().length === 0 && !text().includes(`Plan ${PLAN_HASH}`));
  duplicate = true; render(); await wait(() => !planButton());
  check("duplicate_imports_offer_no_planning_action", details().length === 0);
  duplicate = false; status = "parsing"; render(); await sleep(30);
  check("unfinished_imports_offer_no_planning_action", !planButton());
  check("all_planning_requests_are_argument_bounded_reads_without_keys", calls.every(call => call.command === "history_plan" && call.key === null
    && Object.keys(call.args).sort().join(',') === 'cursor,importId,importRevision,limit,maxPathReferences,messagesPerBatch'));
} finally { releasePending(); root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ passed: checks.length > 0 && checks.every(check => check.ok), checks }); }
