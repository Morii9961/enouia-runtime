// Actual native Inspector routing with synthetic operation-list/detail IPC.
import { createRoot } from "react-dom/client";
import App from "../src/App";
import { setTransport, type J } from "../src/memory/client";
import { setTransport as setActivityTransport } from "../src/activity/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!, root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [], calls: { command: string; key: unknown; args: J }[] = [];
let vaultId = "synthetic-vault-A", changing = false;
let holdList = true, failList = false, duplicateList = false, releaseList: (() => void) | null = null;
let holdGet = false, failGet = false, wrongIdentity = false, releaseGet: (() => void) | null = null;
const releaseListRead = () => { const next = releaseList; releaseList = null; next?.(); };
const releaseOperationRead = () => { const next = releaseGet; releaseGet = null; next?.(); };
const operation = (id: string, kind = "vault_verify", state = "succeeded"): J => ({
  operationId: id, kind, state, progress: { done: state === "running" ? 1 : 10, total: 10 }, cancelRequested: false,
  result: { clean: false, raw: "PRIVATE_RESULT_NOT_FOR_INSPECTOR" }, error: null,
});
let rows: J[] = [operation("operation-active", "index_rebuild", "running"), ...Array.from({ length: 25 }, (_, n) => operation(`operation-${String(n).padStart(2, "0")}`))];
setTransport(async (native, args) => {
  if (native === "shell_status") return { tray: "present", visible: true, closing: false, locking: false, vaultChanging: changing, hotkey: { state: "registered" } };
  if (native !== "memory_call") throw new Error(`Unexpected native ${native}`);
  const request = args.request as { command: string; idempotencyKey: unknown; arguments: J };
  calls.push({ command: request.command, key: request.idempotencyKey, args: request.arguments });
  let result: unknown;
  if (request.command === "workspace_status") result = { vault: { state: "open", vaultId, rootName: "Synthetic", headSequence: 1 }, companion: { exiting: false }, components: [], pendingCandidates: 0, operationsRunning: 1 };
  else if (request.command === "operation_list") {
    const captured = structuredClone(rows);
    if (holdList) { holdList = false; await new Promise<void>(resolve => { releaseList = resolve; }); }
    if (failList) return { kind: "memory_error", error: { code: "storage_failed", retryable: false, rules: [] } };
    result = { items: duplicateList ? [captured[0], captured[0]] : captured };
  } else if (request.command === "operation_get") {
    const captured = structuredClone(rows.find(row => row.operationId === request.arguments.operationId));
    if (holdGet) { holdGet = false; await new Promise<void>(resolve => { releaseGet = resolve; }); }
    if (failGet) return { kind: "memory_error", error: { code: "storage_failed", retryable: false, rules: [] } };
    result = wrongIdentity ? { ...captured, operationId: "wrong-operation" } : captured;
  } else throw new Error(`Unexpected Memory command ${request.command}`);
  return { kind: "memory_page", result };
});
setActivityTransport(async (native, args) => {
  if (native !== "activity_setup" || args.action !== "status") throw new Error("Unexpected Activity action");
  return { configured: false };
});
root.render(<App startPage="runtime" memoryConnected breathing={false} />);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const list = () => fixture.querySelector<HTMLElement>('[aria-label="Memory operations"]');
const detail = () => fixture.querySelector<HTMLElement>('[aria-label="Observed operation"]');
const text = () => list()?.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const inspect = (id: string) => fixture.querySelector<HTMLButtonElement>(`[aria-label="Inspect operation ${id}"]`);
const choices = () => list()?.querySelectorAll<HTMLButtonElement>('[aria-label^="Inspect operation "]') ?? [];
async function wait(predicate: () => boolean) {
  for (let n = 0; n < 250; n++) { if (predicate()) return; await sleep(20); }
  throw new Error(`UI timeout: ${fixture.textContent}`);
}
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
function click(control: HTMLButtonElement | undefined | null) { if (!control || control.disabled) throw new Error("Unavailable control"); control.click(); }
async function refreshList() { click(button("Read Memory operations again")); await sleep(25); }
try {
  await wait(() => releaseList != null && !!list());
  check("unobserved_list_does_not_claim_empty", text().includes("Reading Memory operations") && !text().includes("No operations"));
  releaseListRead(); await wait(() => choices().length === 20);
  check("list_is_bounded_and_active_tasks_come_first", text().includes("showing 20 of 26") && choices()[0].getAttribute("aria-label") === "Inspect operation operation-active");
  check("listing_never_reads_a_detail_automatically", !calls.some(c => c.command === "operation_get"));
  const before = calls.length; click(button("Show more operations")); await wait(() => choices().length === 26);
  check("show_more_is_local_and_does_not_start_work", calls.length === before);
  holdGet = true; click(inspect("operation-active")); await wait(() => releaseGet != null);
  check("selected_progress_waits_for_its_own_observation", detail()!.textContent!.includes("Reading operation progress") && !detail()!.textContent!.includes("reported progress"));
  const gets = calls.filter(c => c.command === "operation_get").length;
  click(button("Read operation progress again")); await sleep(20);
  check("held_progress_read_is_not_duplicated", calls.filter(c => c.command === "operation_get").length === gets);
  releaseOperationRead(); await wait(() => detail()!.textContent!.includes("Running · reported progress 1 / 10"));
  check("raw_operation_results_are_not_rendered", !text().includes("PRIVATE_RESULT_NOT_FOR_INSPECTOR"));
  failGet = true; click(button("Read operation progress again")); await wait(() => !!detail()!.querySelector('[role="alert"]'));
  check("failed_progress_read_withholds_old_progress", !detail()!.textContent!.includes("reported progress 1"));
  failGet = false; wrongIdentity = true; click(button("Read operation progress again")); await sleep(30);
  check("foreign_operation_reply_is_refused", !!detail()!.querySelector('[role="alert"]') && !detail()!.textContent!.includes("wrong-operation") && !detail()!.textContent!.includes("reported progress"));
  wrongIdentity = false; rows[0] = operation("operation-active", "index_rebuild");
  click(button("Read operation progress again")); await wait(() => detail()!.textContent!.includes("Finished · reported progress 10 / 10"));
  check("terminal_execution_does_not_claim_domain_result", detail()!.textContent!.includes("Execution state does not establish") && !detail()!.textContent!.includes("Verification passed"));
  duplicateList = true; await refreshList(); await wait(() => !!list()!.querySelector('[role="alert"]'));
  check("duplicate_list_identity_is_not_treated_as_empty", choices().length === 0 && !text().includes("No operations"));
  duplicateList = false; failList = true; await refreshList();
  await wait(() => list()!.textContent!.includes("Storage failed"));
  check("list_failure_keeps_independent_selected_progress", choices().length === 0 && detail()!.textContent!.includes("Finished"));
  failList = false; await refreshList(); await wait(() => choices().length === 20);
  holdGet = true; click(inspect("operation-00")); await wait(() => releaseGet != null);
  click(inspect("operation-01")); await wait(() => detail()!.textContent!.includes("operation-01") && detail()!.textContent!.includes("Finished"));
  releaseOperationRead(); await sleep(25);
  check("late_detail_reply_cannot_replace_new_selection", detail()!.textContent!.includes("operation-01") && !detail()!.textContent!.includes("operation-00"));
  rows = [operation("operation-new", "constructor")]; await refreshList(); await wait(() => !!inspect("operation-new"));
  check("missing_operation_clears_selection_instead_of_substitution", !detail());
  check("unknown_kind_has_fixed_label", text().includes("Other Memory operation") && !text().includes("constructor"));
  holdList = true; await refreshList(); await wait(() => releaseList != null);
  vaultId = "synthetic-vault-B"; rows = [operation("operation-vault-B", "backup_export")];
  click(button("Read Memory status again")); await wait(() => !!inspect("operation-vault-B"));
  releaseListRead(); await sleep(25);
  check("vault_identity_change_discards_old_list_reply", !inspect("operation-new") && !!inspect("operation-vault-B"));
  changing = true; click(button("Read Memory status again")); await wait(() => !list());
  check("vault_lifecycle_withholds_operation_surface", !list() && !detail());
  check("observer_calls_only_existing_read_commands", calls.every(c => ["workspace_status", "operation_list", "operation_get"].includes(c.command) && c.key === null));
} finally {
  releaseListRead(); releaseOperationRead(); root.unmount();
  document.getElementById("results")!.textContent = JSON.stringify({ passed: checks.length > 0 && checks.every(c => c.ok), checks });
}
