import { createRoot } from "react-dom/client";
import { Context } from "../src/memory/ContextSurface";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: Record<string, unknown> }[] = [];
let wrongCapsule: "capsule" | "inspection" | null = "capsule";
let wrongRequest: "dispatch" | "capsule" | "hash" | "flag" | null = "dispatch";
let verified: unknown = true;
let failCapsule = false;
let delivery = "dispatched";
let holdFirst = false;
let releaseFirst: (() => void) | null = null;
const releasePending = () => releaseFirst?.();
const hash = (id: string) => `synthetic-hash-${id}`;
setTransport(async (native, args) => {
  if (native !== "memory_call") throw new Error(`Unexpected command ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown> };
  calls.push({ command: r.command, args: r.arguments }); let result: unknown;
  if (r.command === "context_inspect") {
    if (r.arguments.capsuleId !== "capsule-one") throw new Error("Wrong capsule request");
    if (failCapsule) return { kind: "memory_error", error: { code: "storage_failed", retryable: false, rules: [] } };
    result = { capsule: { capsule_id: wrongCapsule === "capsule" ? "other-capsule" : "capsule-one", query: "Saved synthetic question", destination: { kind: "local_mock" }, budget: { estimated_tokens: 3, max_tokens: 100 } }, inspection: { capsule_id: wrongCapsule === "inspection" ? "other-capsule" : "capsule-one", decisions: [] }, delivery: "dispatched", dispatches: ["dispatch-one", "dispatch-two"].map(dispatchId => ({ dispatchId, state: "completed", preparedAt: "2026-10-13T00:00:00Z", sentAt: null, completedAt: null, requestHash: hash(dispatchId) })) };
    (result as { delivery: string }).delivery = delivery;
  } else if (r.command === "dispatch_inspect") {
    const id = String(r.arguments.dispatchId);
    if (holdFirst && id === "dispatch-one") { holdFirst = false; await new Promise<void>(resolve => { releaseFirst = resolve; }); }
    result = { dispatchId: wrongRequest === "dispatch" ? "other-dispatch" : id, capsuleId: wrongRequest === "capsule" ? "other-capsule" : "capsule-one", verified: wrongRequest === "flag" ? "true" : verified, requestHash: wrongRequest === "hash" ? "other-hash" : hash(id), destination: { kind: "local_mock" }, tools: 0, messages: [{ role: "user", text: `Synthetic request ${id}` }] };
  } else throw new Error(`Unexpected mutation ${r.command}`);
  return { kind: "memory_page", result, error: null };
});
const root = createRoot(fixture); root.render(<Context capsuleId="capsule-one" />);
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI wait timed out: ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
function click(label: string) { const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable ${label}`); b.click(); }
function show(id: string) { const scope = fixture.querySelector(`aside code[title="${id}"]`)!.closest(".mem-stack")!; scope.querySelector<HTMLButtonElement>("button")!.click(); }
const hasRequest = () => !!fixture.querySelector("aside pre");
try {
  await wait(() => !!fixture.querySelector('[role="alert"]') || text().includes("Saved synthetic question"));
  check("another_capsule_is_not_the_selected_observation", !text().includes("Saved synthetic question") && !!button("Read saved capsule again") && !button("Show the actual request"));
  wrongCapsule = "inspection"; click("Read saved capsule again"); await sleep(30);
  check("another_inspection_is_not_the_selected_observation", !!fixture.querySelector('[role="alert"]') && !text().includes("Saved synthetic question"));
  wrongCapsule = null; click("Read saved capsule again"); await wait(() => !!button("Show the actual request"));
  check("valid_saved_capsule_recovers_without_compiling", text().includes("Saved synthetic question") && calls.every(c => c.command === "context_inspect"));
  for (const mode of ["dispatch", "capsule", "hash", "flag"] as const) {
    wrongRequest = mode; if (mode === "dispatch") show("dispatch-one"); else click("Read actual request again"); await sleep(30);
    check(`wrong_request_${mode}_is_not_shown_as_verified`, !hasRequest() && !!fixture.querySelector('[role="alert"]') && !!button("Read actual request again"));
  }
  wrongRequest = "hash"; verified = false; click("Read actual request again"); await wait(hasRequest);
  check("actual_hash_mismatch_is_reported_without_verification", text().includes("hash mismatch") && !text().includes("hash-checked"));
  wrongRequest = null; verified = true; click("Read actual request again"); await wait(() => text().includes("hash-checked"));
  check("valid_request_recovers_with_saved_identity", text().includes("Synthetic request dispatch-one"));
  holdFirst = true; show("dispatch-one"); await wait(() => releaseFirst != null); show("dispatch-two"); await wait(() => text().includes("Synthetic request dispatch-two")); releasePending(); await sleep(50);
  check("late_request_cannot_replace_selected_dispatch", text().includes("Synthetic request dispatch-two") && !text().includes("Synthetic request dispatch-one"));
  const input = fixture.querySelector<HTMLInputElement>("#mem-cq")!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Unsent preview draft"); input.dispatchEvent(new Event("input", { bubbles: true })); await sleep(30);
  failCapsule = true; click("Read saved capsule again"); await wait(() => !!fixture.querySelector('[role="alert"]'));
  check("failed_capsule_refresh_drops_old_request_and_keeps_draft", !hasRequest() && !button("Read actual request again") && !text().includes("Saved synthetic question") && input.value === "Unsent preview draft");
  failCapsule = false; click("Read saved capsule again"); await wait(() => !!button("Show the actual request"));
  check("capsule_reread_requires_new_request_selection", !hasRequest() && input.value === "Unsent preview draft");
  delivery = "constructor"; click("Read saved capsule again"); await wait(() => text().includes("Unknown saved delivery state"));
  check("unknown_delivery_never_uses_inherited_labels", !fixture.querySelector('[role="alert"]') && text().includes("Saved synthetic question"));
  check("all_recovery_is_read_only", calls.every(c => ["context_inspect", "dispatch_inspect"].includes(c.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
