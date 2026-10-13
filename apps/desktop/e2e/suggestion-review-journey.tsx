// Complete mounted App journey with synthetic Core replies and receipt loss.
// This checks frontend coordination, not real model or native acceptance.
import { createRoot } from "react-dom/client";
import App from "../src/App";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: Record<string, unknown>; key: string | null }[] = [];
let accepted = false;
let edited = "";
let lostReceipt = false;
let releaseConfirm: (() => void) | null = null;
const releasePending = () => releaseConfirm?.();
const original = "Synthetic source proposal";
const citation = { sourceId: "synthetic-source", sourceRevision: 1, supports: "content", locator: { kind: "manual_input" } };
const candidate = () => ({ candidateId: "synthetic-candidate", revision: accepted ? 2 : 1, status: accepted ? "accepted" : "pending", content: original, proposalKind: "create", proposedType: "fact", sensitivity: "normal", originKind: "extraction", createdAt: "2026-10-13T00:00:00Z", evidence: [citation], conflicts: [], target: null });
const job = { run_id: "synthetic-run", input_event_id: "synthetic-input", state: "completed", cursor: 1, candidates: ["synthetic-candidate"] };
setTransport(async (native, args) => {
  if (native === "shell_status") return { vaultChanging: false };
  if (native === "memory_provider_setup") return { state: "absent" };
  if (native !== "memory_call") throw new Error(`Unexpected native command ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown>; idempotencyKey: string | null };
  calls.push({ command: r.command, args: r.arguments, key: r.idempotencyKey });
  let result: unknown;
  switch (r.command) {
    case "workspace_status": result = { vault: { state: "open", rootName: "Synthetic Vault" }, components: [], pendingCandidates: accepted ? 0 : 1 }; break;
    case "operation_list": result = { items: [] }; break;
    case "provider_status": result = { configured: false, destinations: [], grants: [] }; break;
    case "session_list": result = { items: [{ sessionId: "synthetic-session", updatedAt: "2026-10-13T00:00:00Z", branches: [{ branchId: "synthetic-branch", lastEventSeq: 2 }] }] }; break;
    case "session_detail": result = { transcript: [], turns: [], checkpoints: [], invocations: [], lastSavedEventId: "synthetic-input", extractionJobs: [job] }; break;
    case "extraction_preview":
      if (r.arguments.sessionId !== "synthetic-session" || r.arguments.runId !== "synthetic-run") throw new Error("Wrong saved job");
      result = { job, items: [{ responseIndex: 0, proposedType: "fact", content: original, quote: "Synthetic source", selectedText: "Synthetic source supplied by owner", application: "candidate_recorded", candidate: candidate() }] }; break;
    case "candidate_list": result = { items: accepted ? [] : [candidate()], nextCursor: null, total: accepted ? 0 : 1 }; break;
    case "source_excerpt":
      if (r.arguments.sourceId !== citation.sourceId || r.arguments.sourceRevision !== 1) throw new Error("Wrong candidate citation");
      result = { sourceId: citation.sourceId, sourceRevision: 1, sourceKind: "explicit_remember", speakerRole: "user", excerpt: "Synthetic source supplied by owner", byteStart: 0, byteEnd: 34, totalBytes: 34, untrusted: true }; break;
    case "review_plan": {
      const decisions = r.arguments.decisions as { candidateId: string; revision: number; action: string; editedContent: string }[];
      if (decisions.length !== 1 || decisions[0].candidateId !== "synthetic-candidate" || decisions[0].revision !== 1 || decisions[0].action !== "edit_accept") throw new Error("Wrong review decision");
      edited = decisions[0].editedContent;
      result = { planId: "synthetic-plan", diffHash: "synthetic-diff", confirmCode: "SYNTHETIC", expiresAt: "2026-10-13T23:00:00Z", operationKind: "review", records: [{ content: edited }] }; break;
    }
    case "review_confirm":
      if (r.arguments.planId !== "synthetic-plan" || r.arguments.diffHash !== "synthetic-diff" || !r.idempotencyKey) throw new Error("Wrong confirmation");
      if (!lostReceipt) {
        await new Promise<void>(resolve => { releaseConfirm = resolve; }); accepted = true; lostReceipt = true;
        return { kind: "memory_error", error: { code: "busy", retryable: true, rules: ["fixture.receipt_lost"] } };
      }
      result = { committed: true }; break;
    case "memory_list": result = { items: accepted ? [{ memoryId: "synthetic-memory", type: "fact", status: "active", snippet: edited, updatedAt: "2026-10-13T00:00:00Z", evidenceCount: 1 }] : [], nextCursor: null, total: accepted ? 1 : 0 }; break;
    default: throw new Error(`Unexpected command ${r.command}`);
  }
  return { kind: "memory_page", result, error: null };
});
const root = createRoot(fixture); root.render(<App startPage="sessions" memoryConnected breathing={false} />);
const text = () => fixture.textContent ?? "";
const button = (label: string, scope: ParentNode = fixture) => [...scope.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === label);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI wait timed out: ${text().slice(-900)}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
function click(label: string, scope?: ParentNode) { const b = button(label, scope); if (!b || b.disabled) throw new Error(`Unavailable ${label}`); b.focus(); b.click(); }
const session = () => fixture.querySelector<HTMLButtonElement>('button[title="synthetic-session · synthetic-branch"]');
try {
  await wait(() => !!session()); session()!.click(); await wait(() => !!button("Read saved suggestions"));
  check("no_review_route_before_saved_observation", !button("Open candidate inbox"));
  click("Read saved suggestions"); await wait(() => !!button("Open candidate inbox"));
  check("observed_pending_suggestion_offers_review_route", text().includes(original) && !button("Open candidate inbox")!.disabled);
  const beforeRoute = calls.length; click("Open candidate inbox"); await wait(() => !!fixture.querySelector("article.mem-candidate"));
  check("route_opens_actual_candidate_inbox_without_write", fixture.querySelector('button[aria-label="Memory"]')?.getAttribute("aria-current") === "page" && calls.slice(beforeRoute).every(c => ["candidate_list", "workspace_status", "operation_list"].includes(c.command)));
  check("inbox_identifies_candidate_and_revision", fixture.querySelector('article code[title="synthetic-candidate"]')?.textContent === "synthetic-candidate" && fixture.querySelector("article .mem-row-meta")!.textContent!.includes("r1"));
  await wait(() => document.activeElement === fixture.querySelector("#mem-center-title")); check("review_route_focuses_inbox_title", true);
  click("Show evidence source"); await wait(() => !!fixture.querySelector("pre.mem-source"));
  check("candidate_source_can_be_read_before_review", fixture.querySelector("pre.mem-source")!.textContent === "Synthetic source supplied by owner" && !accepted);
  const input = fixture.querySelector<HTMLTextAreaElement>("article textarea")!;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Edited synthetic approved content"); input.dispatchEvent(new Event("input", { bubbles: true }));
  await wait(() => !!button("Accept with edits…")); click("Accept with edits…"); await wait(() => !!fixture.querySelector("dialog[open]"));
  check("edited_review_requires_separate_confirmation", !accepted && fixture.querySelector("dialog pre")!.textContent!.includes("Edited synthetic approved content"));
  click("Confirm (SYNTHETIC)"); await wait(() => releaseConfirm != null); await sleep(30);
  check("confirmation_holds_modal_dismissal", button("Cancel")!.disabled && !!fixture.querySelector("dialog[open]")); releasePending(); await wait(() => !!button("Retry"));
  check("lost_confirmation_receipt_keeps_plan", accepted && !!fixture.querySelector("dialog[open]") && calls.filter(c => c.command === "review_confirm").length === 1);
  click("Retry"); await wait(() => !fixture.querySelector("dialog[open]") && text().includes("Nothing waiting for review"));
  const confirms = calls.filter(c => c.command === "review_confirm");
  check("confirmation_retry_keeps_identical_payload_and_key", confirms.length === 2 && confirms[0].key === confirms[1].key && JSON.stringify(confirms[0].args) === JSON.stringify(confirms[1].args));
  click("Current memories"); await wait(() => text().includes("Edited synthetic approved content"));
  check("approved_content_read_is_separate_from_proposal", fixture.querySelector(".qr31")!.textContent!.includes("1 record") && text().includes(edited));
  fixture.querySelector<HTMLButtonElement>('button[aria-label="Sessions"]')!.click(); await wait(() => !!session()); session()!.click(); await wait(() => !!button("Read saved suggestions"));
  check("return_discards_old_suggestion_preview", !text().includes(original) && !button("Open candidate inbox"));
  click("Read saved suggestions"); await wait(() => text().includes("accepted candidate"));
  check("saved_read_observes_updated_review_status", text().includes(original) && !text().includes(edited) && !button("Open candidate inbox"));
  check("journey_never_sends_reextracts_or_auto_applies", !calls.some(c => ["external_send", "extraction_prepare", "extraction_apply", "extraction_pause", "remember"].includes(c.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
