import { createRoot } from "react-dom/client";
import { Inbox } from "../src/memory/MemorySurface";
import { MemoryStatusProvider } from "../src/memory/status";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: Record<string, unknown> }[] = [];
let candidateRevision = 1;
let fail = true;
let mismatched = false;
let held = false;
let releaseRead: (() => void) | null = null;
const releasePending = () => releaseRead?.();
setTransport(async (native, args) => {
  if (native === "shell_status") return { vaultChanging: false };
  if (native !== "memory_call") throw new Error(`Unexpected native command ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown> };
  calls.push({ command: r.command, args: r.arguments }); let result: unknown;
  if (r.command === "workspace_status") result = { vault: { state: "open" }, pendingCandidates: 1 };
  else if (r.command === "candidate_list") result = { items: [{ candidateId: "synthetic-candidate", revision: candidateRevision, content: "Synthetic proposal", proposalKind: "create", proposedType: "fact", sensitivity: "normal", originKind: "owner_manual", createdAt: "2026-10-13T00:00:00Z", evidence: [], conflicts: [{ memory_id: "synthetic-memory", revision: 1, conflict_group_id: null }], target: null }], nextCursor: null, total: 1 };
  else if (r.command === "memory_read") {
    if (r.arguments.memoryId !== "synthetic-memory") throw new Error("Wrong conflict owner");
    if (held) await new Promise<void>(resolve => { releaseRead = resolve; });
    if (fail) return { kind: "memory_error", error: { code: "not_found", retryable: false, rules: [] } };
    result = { record: { memory_id: "synthetic-memory", revision: 2, status: "forgotten", content: "Synthetic conflicting content <script>ignored</script>" }, summary: { memoryId: "synthetic-memory" } };
    if (mismatched) (result as { record: { memory_id: string } }).record.memory_id = "other-memory";
  } else throw new Error(`Unexpected mutation ${r.command}`);
  return { kind: "memory_page", result, error: null };
});
const root = createRoot(fixture); root.render(<MemoryStatusProvider><Inbox /></MemoryStatusProvider>);
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI wait timed out: ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
function click(label: string) { const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable ${label}`); b.click(); }
try {
  await wait(() => !!button("Read current conflicting memory"));
  check("conflict_ref_is_shown_without_inventing_current_record", text().includes("Reported conflict:") && text().includes("synthetic-memory") && !text().includes("Current saved observation") && !calls.some(c => c.command === "memory_read"));
  click("Read current conflicting memory"); await wait(() => !!fixture.querySelector('[role="alert"]'));
  check("failed_read_keeps_reported_conflict_and_recovery", text().includes("Reported conflict:") && !!button("Read conflicting memory again") && !text().includes("Current saved observation"));
  fail = false; mismatched = true; click("Read conflicting memory again"); await sleep(30); await wait(() => text().includes("Current saved observation") || !!fixture.querySelector('[role="alert"]'));
  check("another_memory_is_not_a_conflict_observation", !text().includes("Current saved observation") && !!fixture.querySelector('[role="alert"]'));
  mismatched = false; click("Read conflicting memory again"); await wait(() => text().includes("Synthetic conflicting content"));
  check("current_revision_is_distinct_from_reported_revision", text().includes("Current saved observation · r2") && text().includes("changed since the reported conflict") && text().includes("still names r1"));
  check("current_status_and_text_stay_literal", text().includes("forgotten") && text().includes("<script>ignored</script>") && fixture.querySelectorAll("script").length === 0);
  held = true; releaseRead = null; click("Read conflicting memory again"); await wait(() => releaseRead != null);
  check("pending_read_clears_previous_current_observation", !text().includes("Synthetic conflicting content") && text().includes("Reading the conflicting memory"));
  click("Hide conflicting memory"); releasePending(); await sleep(60);
  check("hidden_reader_rejects_late_reply", !text().includes("Synthetic conflicting content") && !!button("Read current conflicting memory"));
  releaseRead = null; click("Read current conflicting memory"); await wait(() => releaseRead != null); candidateRevision = 2; click("Refresh candidates");
  await wait(() => !!button("Read current conflicting memory")); releasePending(); await sleep(60);
  check("revised_candidate_discards_old_conflict_read", !text().includes("Synthetic conflicting content") && !text().includes("Current saved observation"));
  held = false; click("Read current conflicting memory"); await wait(() => text().includes("Synthetic conflicting content"));
  check("conflict_reads_target_only_referenced_memory", calls.filter(c => c.command === "memory_read").every(c => JSON.stringify(c.args) === JSON.stringify({ memoryId: "synthetic-memory" })));
  check("comparison_does_not_merge_approve_or_send", calls.every(c => ["candidate_list", "workspace_status", "memory_read"].includes(c.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
