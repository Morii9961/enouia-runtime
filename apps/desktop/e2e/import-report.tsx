// Existing import summaries through the actual Memory surface; synthetic IPC only.
import { createRoot } from "react-dom/client";
import MemorySurface from "../src/memory/MemorySurface";
import { MemoryStatusProvider, useStatus } from "../src/memory/status";
import { setTransport, type J } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!, root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [], calls: { command: string; key: unknown }[] = [];
let fail = false, hold = true, changing = false, release: (() => void) | null = null;
const releaseRead = () => { const next = release; release = null; next?.(); };
const first = () => ({ importId: "import-first", revision: 2, status: "completed", inputKind: "chatgpt_conversations_json",
  accountScope: "fixture-account", inputSizeBytes: 1200, receivedAt: "2026-10-18T00:00:00Z", updatedAt: "2026-10-18T00:01:00Z",
  counts: { sources_created: 4, sources_revised: 1, sources_unchanged: 2, conversations: 2, branches: 3, missing_parents: 1,
    unparseable: 2, attachments_present: 3, attachments_missing: 1, attachments_external: 2, attachments_quarantined: 1 },
  conversationsCovered: 2, membersQuarantined: 1, warnings: ["import.partial", "<b data-warning>untrusted warning</b>"], duplicateOf: null });
let rows: J[] = [first(), { ...first(), importId: "import-duplicate", revision: 1, duplicateOf: "import-first", counts: { sources_created: 0, attachments_missing: 0 } }];
setTransport(async (native, args) => {
  if (native === "shell_status") return { vaultChanging: changing };
  if (native !== "memory_call") throw new Error(`Unexpected native ${native}`);
  const request = args.request as { command: string; idempotencyKey: unknown };
  calls.push({ command: request.command, key: request.idempotencyKey });
  let result: unknown;
  if (request.command === "workspace_status") result = { vault: { state: "open" }, pendingCandidates: 0 };
  else if (request.command === "memory_list") result = { items: [], total: 0, nextCursor: null };
  else if (request.command === "history_task_list") result = { identity: { commitId: "synthetic-head" }, items: [], nextCursor: null, readOnly: true };
  else if (request.command === "operation_list") result = { items: [] };
  else if (request.command === "import_list") {
    const captured = structuredClone(rows);
    if (hold) { hold = false; await new Promise<void>(resolve => { release = resolve; }); }
    if (fail) return { kind: "memory_error", error: { code: "storage_failed", retryable: false, rules: [] } };
    result = { items: captured };
  } else throw new Error(`Unexpected Memory command ${request.command}`);
  return { kind: "memory_page", result };
});
function Control() { const { refresh } = useStatus(); return <button id="fixture-status" onClick={() => void refresh()}>Fixture status</button>; }
root.render(<MemoryStatusProvider><Control /><MemorySurface /></MemoryStatusProvider>);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const text = () => fixture.textContent ?? "";
const report = () => fixture.querySelector<HTMLElement>('[aria-label="Import report"]');
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const inspect = (id: string) => fixture.querySelector<HTMLButtonElement>(`[aria-label="Inspect import ${id}"]`);
const value = (label: string) => [...(report()?.querySelectorAll("dt") ?? [])].find(dt => dt.textContent === label)?.nextElementSibling?.textContent;
async function wait(predicate: () => boolean) {
  for (let n = 0; n < 250; n++) { if (predicate()) return; await sleep(20); }
  throw new Error(`UI timeout: ${text()}`);
}
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
function click(control: HTMLButtonElement | undefined | null) { if (!control || control.disabled) throw new Error("Unavailable control"); control.click(); }
try {
  await wait(() => !!button("Import")); click(button("Import"));
  await wait(() => release != null);
  check("pending_imports_do_not_invent_reports", !report() && !inspect("import-first"));
  releaseRead(); await wait(() => !!inspect("import-first"));
  click(inspect("import-first")); await wait(() => value("Sources created") === "4");
  check("report_has_explicit_identity_and_read_only_counts", report()!.textContent!.includes("import-first") && value("Report revision") === "2" && value("Sources revised") === "1" && value("Sources unchanged") === "2" && value("Input bytes") === "1200");
  check("coverage_and_gaps_are_distinct", value("Conversations") === "2" && value("Branches") === "3" && value("Missing parents") === "1" && value("Unparseable items") === "2" && value("Coverage entries") === "2" && value("Quarantined archive members") === "1");
  check("attachment_outcomes_remain_separate", value("Attachments present") === "3" && value("Attachments missing") === "1" && value("External attachments") === "2" && value("Attachments quarantined") === "1");
  check("completion_does_not_claim_complete_history_or_review", report()!.textContent!.includes("does not establish complete platform history or approved memories"));
  check("warning_codes_are_literal", report()!.textContent!.includes("<b data-warning>") && !report()!.querySelector("b"));
  const before = calls.length; click(inspect("import-duplicate"));
  await wait(() => !!button("Inspect original import"));
  check("duplicate_report_points_to_original_without_reparsing", value("Sources created") === "0" && report()!.textContent!.includes("does not parse them again") && calls.length === before);
  click(button("Inspect original import")); await wait(() => value("Sources created") === "4");
  check("original_navigation_uses_existing_list_only", calls.length === before && inspect("import-first")?.getAttribute("aria-pressed") === "true");
  fail = true; click(button("Refresh import list"));
  await wait(() => !!button("Read import list again"));
  check("failed_refresh_withholds_old_report_fields", report()!.textContent!.includes("current result is unknown") && value("Sources created") == null && inspect("import-first")!.disabled);
  fail = false; hold = true; rows[0] = { ...first(), revision: 3, counts: { ...first().counts, sources_created: 7 } };
  click(button("Read import list again")); await wait(() => release != null);
  check("pending_refresh_keeps_identity_but_withholds_counts", report()!.textContent!.includes("import-first") && value("Sources created") == null);
  releaseRead(); await wait(() => value("Sources created") === "7");
  check("reobservation_updates_the_same_selected_import", value("Report revision") === "3");
  rows = rows.slice(1); click(button("Refresh import list"));
  await wait(() => report()!.textContent!.includes("not in the latest list"));
  check("missing_selection_never_substitutes_another_import", value("Sources created") == null && !report()!.textContent!.includes("import-duplicate"));
  click(inspect("import-duplicate")); await wait(() => value("Sources created") === "0");
  check("missing_original_is_not_invented", !button("Inspect original import") && report()!.textContent!.includes("original import is not in the latest list"));
  rows = [{ ...first(), status: "archived", inputKind: "unknown", counts: { sources_created: 0, unparseable: false, attachments_missing: 0 } }];
  click(button("Refresh import list")); await wait(() => !!inspect("import-first"));
  click(inspect("import-first")); await wait(() => value("Status") === "archived");
  check("unfinished_unsupported_input_does_not_claim_parsed_content", report()!.textContent!.includes("unfinished") && report()!.textContent!.includes("format was not recognized"));
  check("absent_or_invalid_counts_stay_unknown", value("Unparseable items") === "unknown" && value("Sources revised") === "unknown" && value("Sources created") === "0");
  click(button("Close report")); await wait(() => !report());
  check("closing_report_returns_to_its_trigger", document.activeElement === inspect("import-first"));
  click(inspect("import-first")); await wait(() => !!report());
  changing = true; click(fixture.querySelector<HTMLButtonElement>("#fixture-status"));
  await wait(() => text().includes("Finishing Vault change"));
  check("vault_lifecycle_unmounts_the_report", !report());
  check("inspection_never_sends_writes_or_model_calls", calls.every(c => ["history_task_list", "workspace_status", "memory_list", "import_list", "operation_list"].includes(c.command) && c.key === null));
} finally {
  releaseRead(); root.unmount();
  document.getElementById("results")!.textContent = JSON.stringify({ passed: checks.length > 0 && checks.every(c => c.ok), checks });
}
