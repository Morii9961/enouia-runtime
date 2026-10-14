// Record identity/read failures are controlled, never personal-Vault faults.
import { createRoot } from "react-dom/client";
import { MemoryDetail } from "../src/memory/MemorySurface";
import { MemoryStatusProvider } from "../src/memory/status";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: Record<string, unknown> }[] = [];
let wrongMemory: "record" | "summary" | null = "record";
let wrongSource: "id" | "revision" | null = "id";
let failRead = false;
let revision = 1;
setTransport(async (native, args) => {
  if (native === "shell_status") return { vaultChanging: false };
  if (native !== "memory_call") throw new Error(`Unexpected native command ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown> };
  calls.push({ command: r.command, args: r.arguments }); let result: unknown;
  if (r.command === "workspace_status") result = { vault: { state: "open" }, pendingCandidates: 0 };
  else if (r.command === "memory_read") {
    if (r.arguments.memoryId !== "synthetic-memory") throw new Error("Wrong memory request");
    if (failRead) return { kind: "memory_error", error: { code: "storage_failed", retryable: false, rules: [] } };
    result = {
      record: { memory_id: wrongMemory === "record" ? "other-memory" : "synthetic-memory", revision, content: wrongMemory ? "Wrong returned observation" : `Saved synthetic memory r${revision}`, approved_at: "2026-10-13T00:00:00Z", supersedes: [] },
      summary: { memoryId: wrongMemory === "summary" ? "other-memory" : "synthetic-memory", status: "active", type: "fact", expired: false, conflicted: false, sourceMissing: false },
      evidence: [{ sourceId: "synthetic-source", sourceRevision: 1, supports: "content", available: true }], supersededBy: [],
    };
  } else if (r.command === "source_excerpt") {
    if (r.arguments.sourceId !== "synthetic-source" || r.arguments.sourceRevision !== 1) throw new Error("Wrong source request");
    result = { sourceId: wrongSource === "id" ? "other-source" : "synthetic-source", sourceRevision: wrongSource === "revision" ? 99 : 1, sourceKind: "explicit_remember", speakerRole: "user", excerpt: "Synthetic saved source", byteStart: 0, byteEnd: 22, totalBytes: 22, untrusted: true };
  } else throw new Error(`Unexpected mutation ${r.command}`);
  return { kind: "memory_page", result, error: null };
});
const root = createRoot(fixture); root.render(<MemoryStatusProvider><MemoryDetail id="synthetic-memory" onChanged={() => {}} /></MemoryStatusProvider>);
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI wait timed out: ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
function click(label: string) { const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable ${label}`); b.click(); }
try {
  await wait(() => !!fixture.querySelector('[role="alert"]') || text().includes("Wrong returned observation"));
  check("wrong_memory_record_is_not_shown_or_writable", !text().includes("Wrong returned observation") && !button("Forget…") && !!button("Read memory again"));
  wrongMemory = "summary"; click("Read memory again"); await sleep(30); await wait(() => !!fixture.querySelector('[role="alert"]') || text().includes("Wrong returned observation"));
  check("wrong_memory_summary_is_not_shown_or_writable", !text().includes("Wrong returned observation") && !button("Forget…"));
  wrongMemory = null; click("Read memory again"); await wait(() => text().includes("Saved synthetic memory r1"));
  check("valid_memory_can_be_reobserved", !!button("Forget…") && !fixture.querySelector('[role="alert"]'));
  const input = fixture.querySelector<HTMLTextAreaElement>("#mem-fix")!;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Unsent synthetic correction"); input.dispatchEvent(new Event("input", { bubbles: true })); await sleep(30);
  failRead = true; click("Read memory again"); await wait(() => !!fixture.querySelector('[role="alert"]'));
  check("failed_reread_withholds_unobserved_write_controls", !text().includes("Saved synthetic memory r1") && !button("Propose correction") && !button("Forget…") && !!button("Read memory again"));
  failRead = false; revision = 2; click("Read memory again"); await wait(() => text().includes("Saved synthetic memory r2"));
  check("successful_reread_preserves_unsent_correction", fixture.querySelector<HTMLTextAreaElement>("#mem-fix")!.value === "Unsent synthetic correction" && !button("Propose correction")!.disabled);
  click("Show source"); await sleep(30); await wait(() => !!fixture.querySelector('[role="alert"]') || !!fixture.querySelector("pre.mem-source"));
  check("wrong_source_id_is_not_shown_or_extractable", !fixture.querySelector("pre.mem-source") && !button("Suggest memories from this part…"));
  wrongSource = "revision"; click("Show source"); await sleep(30); await wait(() => !!fixture.querySelector('[role="alert"]') || !!fixture.querySelector("pre.mem-source"));
  check("wrong_source_revision_is_not_shown_or_extractable", !fixture.querySelector("pre.mem-source") && !button("Suggest memories from this part…"));
  wrongSource = null; click("Show source"); await wait(() => text().includes("Synthetic saved source"));
  check("correct_source_read_recovers_existing_workflow", !!button("Suggest memories from this part…") && !fixture.querySelector('[role="alert"]'));
  check("observation_recovery_starts_no_mutation", calls.every(c => ["workspace_status", "memory_read", "source_excerpt"].includes(c.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
