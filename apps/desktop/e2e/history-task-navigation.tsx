// Actual App -> Memory task -> Sessions routing, with synthetic IPC only.
import { createRoot } from "react-dom/client";
import App from "../src/App";
import { setTransport, type J } from "../src/memory/client";
import { historyTask } from "../tests/history-task-fixture";

const fixture = document.getElementById("fixture")!, root = createRoot(fixture), checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: J; key: unknown }[] = [];
let vaultId = "synthetic-vault", holdDetail = false, release: (() => void) | null = null;
const releasePending = () => { const next = release; release = null; next?.(); };
setTransport(async (native, args) => {
  if (native === "shell_status") return { vaultChanging: false, closing: false };
  if (native === "memory_provider_setup") return { state: "absent" };
  if (native !== "memory_call") throw new Error(native);
  const r = args.request as J; calls.push({ command: r.command, args: structuredClone(r.arguments), key: r.idempotencyKey });
  let result: J;
  switch (r.command) {
    case "workspace_status": result = { vault: { state: "open", vaultId }, pendingCandidates: 0, components: [] }; break;
    case "memory_list": result = { items: [], total: 0, nextCursor: null }; break;
    case "import_list": case "operation_list": result = { items: [] }; break;
    case "history_task_list": result = { identity: { vaultId, commitId: "synthetic-head" }, items: [historyTask()], nextCursor: null, readOnly: true }; break;
    case "history_task_get": result = historyTask(); result.identity.vaultId = vaultId; break;
    case "provider_status": result = { configured: false, destinations: [], grants: [] }; break;
    case "session_list": result = { items: (vaultId === "synthetic-vault" ? ["synthetic-child-1", "synthetic-child-0", "synthetic-coordinator"] : ["other-vault-session"]).map(sessionId => ({
      sessionId, updatedAt: "2026-10-20T00:00:00.000Z", branches: [{ branchId: `branch-${sessionId}`, lastEventSeq: 1 }],
    })) }; break;
    case "session_detail": {
      const captured = { ...r.arguments, transcript: [{ eventId: "synthetic-event", kind: "user_message", deliveryState: "not_applicable", text: `Saved task session ${r.arguments.sessionId}` }],
        turns: [], checkpoints: [], invocations: [], extractionJobs: [] };
      if (holdDetail) { holdDetail = false; await new Promise<void>(resolve => { release = resolve; }); }
      result = captured; break;
    }
    default: throw new Error(`Unexpected write or read ${r.command}`);
  }
  return { kind: "synthetic", result };
});
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(el => el.textContent === label);
const nav = (label: string) => fixture.querySelector<HTMLButtonElement>(`nav button[aria-label="${label}"]`)!;
const rows = () => [...fixture.querySelectorAll<HTMLButtonElement>(".mem-session-row")];
const filter = () => fixture.querySelector<HTMLInputElement>("#mem-session-filter");
const text = () => fixture.textContent ?? "", sleep = () => new Promise(resolve => setTimeout(resolve, 20));
async function wait(test: () => boolean) { for (let n = 0; n < 300; n++) { if (test()) return; await sleep(); } throw new Error(`timeout ${text()}`); }
function click(control: HTMLButtonElement | undefined) { if (!control || control.disabled) throw new Error("Unavailable control"); control.click(); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
async function task() {
  nav("Memory").click(); await wait(() => !!button("Import")); click(button("Import"));
  await wait(() => !!button("Read task synthetic-history-task")); click(button("Read task synthetic-history-task"));
  await wait(() => !!button("View batch 2 session"));
}
try {
  root.render(<App memoryConnected startPage="memory" breathing={false} />);
  await wait(() => !!button("Import")); await task();
  check("task_links_come_from_observed_core_children", !!button("View coordinator session") && !!button("View batch 1 session"));
  button("View batch 2 session")!.focus(); click(button("View batch 2 session")); await wait(() => filter()?.value === "synthetic-child-1" && rows().length === 1 && !filter()!.disabled);
  check("batch_navigation_only_filters_the_exact_saved_session", rows()[0].title.startsWith("synthetic-child-1 · ") && !calls.some(c => c.command === "session_detail"));
  check("removed_task_control_continues_focus_in_sessions", document.activeElement === document.getElementById("runtime-content"));
  rows()[0].click(); await wait(() => text().includes("Saved task session synthetic-child-1"));
  check("owner_explicitly_reads_the_selected_session_branch", calls.some(c => c.command === "session_detail" && c.args.sessionId === "synthetic-child-1" && c.args.branchId === "branch-synthetic-child-1"));
  await task(); nav("Sessions").focus(); click(button("View coordinator session")); await wait(() => filter()?.value === "synthetic-coordinator" && rows().length === 1 && !filter()!.disabled);
  check("coordinator_navigation_uses_its_own_saved_identity", rows()[0].title.startsWith("synthetic-coordinator · "));
  check("task_navigation_respects_focus_kept_in_primary_rail", document.activeElement === nav("Sessions"));
  holdDetail = true; rows()[0].click(); await wait(() => release !== null);
  vaultId = "other-vault"; await wait(() => rows().some(row => row.title.startsWith("other-vault-session · ")) && !filter()!.disabled);
  releasePending(); await sleep(); await sleep();
  check("new_vault_discards_old_target_and_late_session_detail", filter()!.value === "" && !text().includes("Saved task session synthetic-coordinator") && !fixture.querySelector("#mem-ask"));
  nav("Memory").click(); await wait(() => !!button("Import")); nav("Sessions").click(); await wait(() => filter() !== null && !filter()!.disabled);
  check("ordinary_navigation_does_not_restore_task_filter", filter()!.value === "");
  check("navigation_never_creates_sends_or_approves", calls.every(c => c.key === null && ["workspace_status","memory_list","import_list","operation_list","history_task_list","history_task_get","provider_status","session_list","session_detail"].includes(c.command)));
  document.getElementById("results")!.textContent = JSON.stringify({ fixture: "history-task-navigation", passed: checks.every(c => c.ok), checks });
} finally { releasePending(); root.unmount(); }
