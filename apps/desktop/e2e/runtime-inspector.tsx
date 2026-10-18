// Actual App routing and native Inspector, with synthetic IPC only.
import { createRoot } from "react-dom/client";
import App from "../src/App";
import { setTransport } from "../src/memory/client";
import { setTransport as setActivityTransport, type Overview } from "../src/activity/client";
import { overview as activityOverview } from "../tests/activity-fixtures.mjs";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!, root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [], calls: string[] = [];
let memoryFailed = false, shellFailed = false, activityFailed = false, configured = false;
let changing = false, closing = false, state = "open", holdShell = true;
let releaseShell: (() => void) | null = null;
let holdActivity = false, releaseActivity: (() => void) | null = null;
let shellTray = "present";
const release = () => { const next = releaseShell; releaseShell = null; next?.(); };
const releaseActivityRead = () => { const next = releaseActivity; releaseActivity = null; next?.(); };
setTransport(async (native, args) => {
  if (native === "shell_status") {
    calls.push(native);
    const tray = shellTray;
    if (holdShell) { holdShell = false; await new Promise<void>(resolve => { releaseShell = resolve; }); }
    if (shellFailed) throw "worker_failed";
    return { tray, visible: true, closing, locking: false, vaultChanging: changing, hotkey: { state: "conflict", combo: "Ctrl+Alt+M" } };
  }
  if (native !== "memory_call") throw new Error(`Unexpected native ${native}`);
  const request = args.request as { command: string }; calls.push(request.command);
  if (request.command !== "workspace_status") throw new Error(`Unexpected Memory ${request.command}`);
  if (memoryFailed) return { kind: "memory_error", error: { code: "storage_failed", retryable: false, rules: [] } };
  return { kind: "memory_page", result: {
    vault: { state, rootName: "Synthetic Vault", headSequence: 12, lastCommitAt: "2026-10-18T00:00:00Z" },
    pendingCandidates: 3, operationsRunning: 2, companion: { exiting: closing },
    components: [{ component: "memory_index", state: "degraded", mode: "rebuilding" }, { component: "activity", state: "FORBIDDEN_FIXED_ACTIVITY" }],
  } };
});
let observed = activityOverview() as Overview;
setActivityTransport(async (native, args) => {
  if (native === "activity_setup") {
    calls.push(`activity_setup:${args.action}`);
    if (args.action !== "status") throw new Error("Inspector attempted to change Activity setup");
    return configured ? { configured: true, mode: "sandbox", taskName: "Enouia-Activity-Synthetic", folder: "synthetic" } : { configured: false };
  }
  if (native !== "activity_call") throw new Error(`Unexpected Activity native ${native}`);
  const request = args.request as { operation: string }; calls.push(request.operation);
  if (request.operation !== "activity_get_overview") throw new Error(`Inspector attempted Activity action ${request.operation}`);
  const captured = structuredClone(observed);
  if (holdActivity) { holdActivity = false; await new Promise<void>(resolve => { releaseActivity = resolve; }); }
  if (activityFailed) throw new Error("Synthetic Activity read failure");
  return captured;
});
const text = () => fixture.textContent ?? "";
const section = (id: string) => fixture.querySelector(`#${id}`)?.closest("section")?.textContent ?? "";
const fact = (id: string, name: string) => [...(fixture.querySelector(`#${id}`)?.closest("section")?.querySelectorAll(".qr199") ?? [])]
  .find(row => row.firstElementChild?.textContent === name)?.lastElementChild?.textContent;
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(predicate: () => boolean) {
  for (let n = 0; n < 250; n++) { if (predicate()) return; await sleep(20); }
  throw new Error(`UI timeout: ${text()}`);
}
function click(label: string) { const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable: ${label}`); b.click(); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
const mount = () => root.render(<App startPage="runtime" memoryConnected breathing={false} />);
async function rereadMemory() {
  click("Read Memory status again");
  await wait(() => memoryFailed ? section("runtime-memory-title").includes("Storage failed") : section("runtime-memory-title").includes(closing ? "Exiting, finishing operations" : changing ? "Finishing Vault change" : state === "open" ? "Latest commit" : "Vault locked"));
}
try {
  mount();
  await wait(() => releaseShell != null && text().includes("No Activity package connected"));
  check("app_routes_to_observed_inspector", text().includes("Observed component status") && !text().includes("Inspector demo") && !text().includes("frozen Runtime-local design"));
  check("unobserved_shell_is_not_healthy", section("runtime-shell-title").includes("Reading shell status") && !section("runtime-shell-title").includes("Running"));
  check("unconfigured_activity_never_runs_overview", !calls.includes("activity_get_overview"));
  release();
  await wait(() => section("runtime-memory-title").includes("Latest commit") && section("runtime-shell-title").includes("conflict"));
  check("memory_shows_backend_counts_and_health", section("runtime-memory-title").includes("#12") && section("runtime-memory-title").includes("Pending candidates3") && section("runtime-memory-title").includes("Running operations2") && section("runtime-memory-title").includes("degraded"));
  check("memory_fixed_activity_row_is_excluded", !text().includes("FORBIDDEN_FIXED_ACTIVITY"));
  check("shell_reads_actual_tray_and_hotkey", section("runtime-shell-title").includes("present") && section("runtime-shell-title").includes("Ctrl+Alt+M") && section("runtime-shell-title").includes("Observed"));
  configured = true;
  observed.delivery.state = "transported";
  observed.schedule.task = { registered: true, enabled: null };
  observed.schedule.nextTriggerAt = "2026-10-19";
  click("Read Activity status again");
  await wait(() => section("runtime-activity-title").includes("transported"));
  check("transport_and_unknown_schedule_do_not_claim_publication", fact("runtime-activity-title", "Scheduled task") === "registered · enabled state unknown" && fact("runtime-activity-title", "Delivery") === "transported" && fact("runtime-activity-title", "Publication observed") === "—");
  check("date_only_trigger_keeps_date_precision", section("runtime-activity-title").includes("Next trigger2026-10-19") && !section("runtime-activity-title").includes("2026-10-19 00:00"));
  activityFailed = true;
  click("Read Activity status again");
  await wait(() => section("runtime-activity-title").includes("Status unavailable"));
  check("activity_failure_clears_prior_observation_only", !section("runtime-activity-title").includes("transported") && section("runtime-memory-title").includes("#12") && section("runtime-shell-title").includes("present"));
  shellFailed = true;
  click("Read shell status again");
  await wait(() => section("runtime-shell-title").includes("Status unavailable"));
  check("shell_failure_withholds_previous_success", !section("runtime-shell-title").includes("present") && !section("runtime-shell-title").includes("LifecycleRunning"));
  shellFailed = false;
  click("Read shell status again");
  await wait(() => section("runtime-shell-title").includes("present"));
  holdShell = true;
  button("Read shell status again")!.focus(); click("Read shell status again");
  await wait(() => releaseShell != null && button("Read shell status again")!.disabled);
  // Model WebView2's focus loss when the submitted control is disabled.
  button("Read shell status again")!.blur(); release();
  await wait(() => !button("Read shell status again")!.disabled);
  check("completed_read_restores_owned_focus", document.activeElement === button("Read shell status again"));
  holdShell = true;
  click("Read shell status again");
  await wait(() => releaseShell != null && button("Read shell status again")!.disabled);
  button("Read Memory status again")!.focus(); release();
  await wait(() => !button("Read shell status again")!.disabled);
  check("completed_read_preserves_moved_focus", document.activeElement === button("Read Memory status again"));
  memoryFailed = true; await rereadMemory();
  check("memory_failure_withholds_old_vault_and_components", !section("runtime-memory-title").includes("#12") && !section("runtime-memory-title").includes("degraded") && section("runtime-shell-title").includes("present"));
  memoryFailed = false; changing = true; await rereadMemory();
  check("vault_change_withholds_previous_details", !section("runtime-memory-title").includes("#12") && !section("runtime-memory-title").includes("degraded"));
  changing = false; state = "locked"; await rereadMemory();
  check("locked_vault_hides_open_details", !section("runtime-memory-title").includes("Latest commit"));
  closing = true; await rereadMemory();
  check("exit_takes_precedence_and_hides_components", !section("runtime-memory-title").includes("degraded"));
  closing = false; state = "open"; activityFailed = false;
  holdShell = true; shellTray = "STALE_SHELL";
  click("Read shell status again");
  await wait(() => releaseShell != null);
  const before = calls.filter(c => c === "shell_status").length;
  check("pending_shell_read_withholds_another_read", button("Read shell status again")?.disabled === true);
  button("Read shell status again")?.click();
  await sleep(20);
  check("double_click_does_not_duplicate_shell_request", calls.filter(c => c === "shell_status").length === before);
  holdActivity = true; observed.delivery.state = "unverified";
  click("Read Activity status again");
  await wait(() => releaseActivity != null);
  root.render(null); await sleep(20);
  shellTray = "present"; observed.delivery.state = "idle";
  mount();
  await wait(() => section("runtime-shell-title").includes("present") && section("runtime-activity-title").includes("Deliveryidle"));
  release(); releaseActivityRead(); await sleep(30);
  check("unmounted_replies_cannot_replace_new_inspector", !text().includes("STALE_SHELL") && !section("runtime-activity-title").includes("unverified"));
  check("inspector_uses_read_only_facades", calls.every(c => ["workspace_status", "shell_status", "activity_setup:status", "activity_get_overview"].includes(c)));
  root.render(<App startPage="runtime" memoryConnected={false} breathing={false} />);
  await wait(() => !!fixture.querySelector('[title^="Fictional demo data"]'));
  check("browser_keeps_fictional_demo", text().includes("Demo · local only") && !text().includes("Observed component status") && text().includes("documentation reference"));
} finally {
  release(); releaseActivityRead(); root.unmount();
  document.getElementById("results")!.textContent = JSON.stringify({ passed: checks.length > 0 && checks.every(c => c.ok), checks });
}
