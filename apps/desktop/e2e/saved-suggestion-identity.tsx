// Real saved-job controls with wrong read/write identities after local commits.
import { createRoot } from "react-dom/client";
import { SavedExtractionJobs } from "../src/memory/SavedExtractionJobs";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: Record<string, unknown> }[] = [];
let wrongPreview: "wrong" | "missing" | null = "wrong";
let wrongApply = false;
let wrongResume = false;
let cursor = 0;
let paused = false;
let routes = 0;
let parentReads = 0;
const runId = "selected-run";
const job = (identity: string | undefined = runId) => ({ run_id: identity, input_event_id: "saved-input", state: cursor === 2 ? "completed" : paused ? "paused" : "ready", cursor, candidates: [] });
setTransport(async (native, args) => {
  if (native !== "memory_call") throw new Error(`Unexpected native command ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown> };
  if (r.arguments.sessionId !== "selected-session" || r.arguments.runId !== runId) throw new Error("Wrong request owner");
  calls.push({ command: r.command, args: r.arguments }); let result: unknown;
  switch (r.command) {
    case "extraction_preview": result = {
      job: { ...job(), run_id: wrongPreview === "missing" ? undefined : wrongPreview === "wrong" ? "another-run" : runId },
      items: [0, 1].map(n => ({ responseIndex: n, proposedType: "fact", content: wrongPreview ? "Wrong job proposal" : `Selected proposal ${n}`, quote: "Synthetic quote", selectedText: "Synthetic source", application: n < cursor ? "candidate_recorded" : "awaiting_cursor", candidate: n < cursor ? { candidateId: `candidate-${n}`, revision: 1, status: "pending", content: `Selected proposal ${n}` } : null })),
    }; break;
    case "extraction_apply": cursor = Math.min(cursor + 1, 2); result = { job: job(wrongApply ? "another-run" : runId) }; break;
    case "extraction_pause":
      if (r.arguments.paused !== false) throw new Error("Expected local resume");
      paused = false; result = { job: job(wrongResume ? "another-run" : runId) }; break;
    default: throw new Error(`Unexpected command ${r.command}`);
  }
  return { kind: "memory_page", result, error: null };
});
let root = createRoot(fixture);
const render = () => root.render(<SavedExtractionJobs sessionId="selected-session" jobs={[job()]} onReview={() => { routes++; }} onChanged={async () => { parentReads++; }} />);
render();
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI wait timed out: ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
function click(label: string) { const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable ${label}`); b.click(); }
const count = (command: string) => calls.filter(c => c.command === command).length;
async function settled() { await sleep(30); await wait(() => button("Read saved suggestions again")?.disabled === false); }
try {
  await wait(() => !!button("Read saved suggestions")); click("Read saved suggestions"); await settled();
  check("wrong_run_preview_is_not_published_or_actionable", !text().includes("Wrong job proposal") && !!fixture.querySelector('[role="alert"]') && !button("Add remaining suggestions to the review queue") && !button("Open candidate inbox"));
  wrongPreview = "missing"; click("Read saved suggestions again"); await settled();
  check("missing_run_preview_is_not_actionable", !text().includes("Wrong job proposal") && !!fixture.querySelector('[role="alert"]') && !button("Add remaining suggestions to the review queue"));
  wrongPreview = null; click("Read saved suggestions again"); await settled();
  check("correct_saved_run_recovers_without_mutation", text().includes("Selected proposal 0") && !button("Add remaining suggestions to the review queue")!.disabled && count("extraction_apply") === 0);
  const previewsBefore = count("extraction_preview"); wrongApply = true; click("Add remaining suggestions to the review queue"); await settled();
  check("wrong_apply_receipt_stops_later_cursor_steps", cursor === 1 && count("extraction_apply") === 1 && count("extraction_preview") === previewsBefore);
  check("wrong_receipt_requires_read_before_another_action", !!fixture.querySelector('[role="alert"]') && !button("Retry") && button("Add remaining suggestions to the review queue")!.disabled && parentReads === 0 && text().includes("Previous suggestion observation"));
  wrongApply = false; click("Read saved suggestions again"); await settled();
  check("explicit_read_observes_committed_partial_cursor", text().includes("pending candidate") && !button("Add remaining suggestions to the review queue")!.disabled && count("extraction_apply") === 1);
  wrongPreview = "wrong"; click("Add remaining suggestions to the review queue"); await settled();
  check("wrong_final_preview_cannot_publish_or_release_writes", cursor === 2 && count("extraction_apply") === 2 && !text().includes("Wrong job proposal") && button("Add remaining suggestions to the review queue")!.disabled && button("Open candidate inbox")!.disabled && parentReads === 0);
  wrongPreview = null; click("Read saved suggestions again"); await settled();
  check("completed_saved_read_recovers_without_reapplying", !button("Add remaining suggestions to the review queue") && !button("Open candidate inbox")!.disabled && count("extraction_apply") === 2);
  click("Open candidate inbox"); check("review_navigation_is_explicit_and_starts_no_write", routes === 1 && count("extraction_apply") === 2);
  root.unmount(); root = createRoot(fixture); cursor = 0; paused = true; render(); await wait(() => !!button("Read saved suggestions")); click("Read saved suggestions"); await settled();
  const beforeResume = count("extraction_preview"); wrongResume = true; click("Resume local queue"); await settled();
  check("wrong_resume_receipt_starts_no_automatic_read_or_apply", !paused && count("extraction_pause") === 1 && count("extraction_preview") === beforeResume && count("extraction_apply") === 2 && parentReads === 0);
  check("wrong_resume_requires_fresh_saved_observation", !!fixture.querySelector('[role="alert"]') && !button("Retry") && button("Resume local queue")!.disabled);
  wrongResume = false; click("Read saved suggestions again"); await settled();
  check("resume_recovery_reads_without_replaying_mutation", !button("Resume local queue") && !button("Add remaining suggestions to the review queue")!.disabled && count("extraction_pause") === 1 && count("extraction_apply") === 2);
  check("every_command_keeps_selected_session_and_run", calls.every(c => c.args.sessionId === "selected-session" && c.args.runId === runId && ["extraction_preview", "extraction_apply", "extraction_pause"].includes(c.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
