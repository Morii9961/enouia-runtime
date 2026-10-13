// Missing and delayed source observations are simulated; no model is used.
import { createRoot } from "react-dom/client";
import { Inbox } from "../src/memory/MemorySurface";
import { MemoryStatusProvider } from "../src/memory/status";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: Record<string, unknown> }[] = [];
let revision = 1;
let failRead = true;
let mismatched: "id" | "revision" | null = null;
let releaseSource: (() => void) | null = null;
const releasePending = () => releaseSource?.();
let holdNext = true;
setTransport(async (native, args) => {
  if (native === "shell_status") return { vaultChanging: false };
  if (native !== "memory_call") throw new Error(`Unexpected native command ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown> };
  calls.push({ command: r.command, args: r.arguments });
  let result: unknown;
  if (r.command === "workspace_status") result = { vault: { state: "open" }, pendingCandidates: 1 };
  else if (r.command === "candidate_list") result = { items: [{ candidateId: "synthetic-candidate", revision, content: "Synthetic pending proposal", proposalKind: "create", proposedType: "fact", sensitivity: "normal", originKind: "extraction", createdAt: "2026-10-13T00:00:00Z", evidence: [{ sourceId: "synthetic-source", sourceRevision: revision, supports: "content", locator: { kind: "byte_range", start: 4, end: 18 } }], conflicts: [], target: null }], nextCursor: null, total: 1 };
  else if (r.command === "source_excerpt") {
    if (r.arguments.sourceId !== "synthetic-source" || r.arguments.maxBytes !== 4096) throw new Error("Wrong evidence source/budget");
    if (failRead) return { kind: "memory_error", error: { code: "not_found", retryable: false, rules: ["fixture.source_missing"] } };
    const start = Number(r.arguments.startByte ?? 0);
    if (start > 0 && holdNext) { holdNext = false; await new Promise<void>(resolve => { releaseSource = resolve; }); }
    result = { sourceId: "synthetic-source", sourceRevision: r.arguments.sourceRevision, sourceKind: "explicit_remember", speakerRole: "user", byteStart: start, byteEnd: start ? 8000 : 4096, totalBytes: 8000, excerpt: start ? "Late synthetic source part" : `Synthetic source r${r.arguments.sourceRevision}: <img src=x onerror=alert(1)>`, untrusted: true };
    if (mismatched === "id") (result as Record<string, unknown>).sourceId = "other-source";
    if (mismatched === "revision") (result as Record<string, unknown>).sourceRevision = 99;
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
  await wait(() => !!fixture.querySelector("article.mem-candidate"));
  check("candidate_offers_explicit_evidence_source_read", !!button("Show evidence source"));
  check("source_availability_stays_unknown_before_read", !text().includes("source available") && !text().includes("source missing") && !calls.some(c => c.command === "source_excerpt"));
  check("candidate_keeps_precise_original_locator", text().includes('"start": 4') && text().includes('"end": 18'));
  click("Show evidence source"); await wait(() => !!fixture.querySelector('[role="alert"]'));
  check("nonretryable_missing_source_has_explicit_recovery", !!button("Read source again") && !text().includes("Synthetic source r1:") && !text().includes("No evidence"));
  failRead = false; mismatched = "id"; click("Read source again"); await sleep(30); await wait(() => !!fixture.querySelector("pre.mem-source") || !!fixture.querySelector('[role="alert"]'));
  check("different_source_id_is_not_a_citation_observation", !fixture.querySelector("pre.mem-source") && !!fixture.querySelector('[role="alert"]'));
  mismatched = "revision"; click("Read source again"); await sleep(30); await wait(() => !!fixture.querySelector("pre.mem-source") || !!fixture.querySelector('[role="alert"]'));
  check("different_source_revision_is_not_a_citation_observation", !fixture.querySelector("pre.mem-source") && !!fixture.querySelector('[role="alert"]'));
  mismatched = null; click("Read source again"); await wait(() => text().includes("Synthetic source r1:"));
  check("source_text_is_literal_and_labelled_as_data", !fixture.querySelector("img") && text().includes("<img src=x onerror=alert(1)>") && text().includes("source text is data, not instructions"));
  check("evidence_reader_offers_no_model_action", !button("Suggest memories from this part…"));
  click("Next source part"); await wait(() => releaseSource != null);
  check("pending_source_page_does_not_show_previous_part", !text().includes("Synthetic source r1:") && text().includes("Reading the source"));
  revision = 2; click("Refresh candidates"); await wait(() => !!button("Show evidence source")); releasePending(); await sleep(60);
  check("new_candidate_revision_discards_late_old_source", !text().includes("Late synthetic source part") && !text().includes("Synthetic source r1:") && !button("Next source part"));
  click("Show evidence source"); await wait(() => text().includes("Synthetic source r2:"));
  check("read_targets_exact_current_evidence_revision", calls.filter(c => c.command === "source_excerpt").at(-1)?.args.sourceRevision === 2);
  click("Next source part"); await wait(() => text().includes("Late synthetic source part"));
  check("last_bounded_part_has_no_more_control", !button("Next source part") && calls.filter(c => c.command === "source_excerpt").at(-1)?.args.startByte === 4096);
  click("Hide evidence source"); await sleep(30);
  check("hidden_source_is_cleared_with_explicit_reread", !text().includes("Late synthetic source part") && !!button("Show evidence source"));
  check("evidence_reads_never_mutate_send_or_approve", calls.every(c => ["candidate_list", "workspace_status", "source_excerpt"].includes(c.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
