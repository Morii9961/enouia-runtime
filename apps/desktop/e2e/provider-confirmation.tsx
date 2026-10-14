// Actual Runtime component; synthetic IPC and setup only.
import { createRoot } from "react-dom/client";
import { ExternalPanel } from "../src/memory/ExternalPanel";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: Record<string, unknown>; key: unknown }[] = [];
let scenario = "retryable", attempts = 0, saved = false, owned = false, changed = 0;
const native = {
  setup: async () => ({ state: "configured" }),
  reload: async () => { throw new Error("Unexpected settings reload"); },
  key: async () => { throw new Error("Unexpected credential action"); },
};
setTransport(async (command, args) => {
  if (command !== "memory_call") throw new Error(command);
  const r = args.request as { command: string; arguments: Record<string, unknown>; idempotencyKey: unknown };
  calls.push({ command: r.command, args: r.arguments, key: r.idempotencyKey });
  const reply = (result: unknown) => ({ kind: "memory_page", result });
  if (r.command === "provider_status") return reply({ configured: true,
    destinations: [{ api: "openai", model: "synthetic", maxOutputTokens: 4096 }],
    grants: saved ? [{ active: true, policyId: "synthetic-policy", maxSensitivity: "private", destinations: [{ provider: "openai", model: "synthetic" }] }] : [] });
  if (r.command === "egress_grant_plan") return reply({ kind: "grant", planId: `${scenario}-plan`, diffHash: `${scenario}-hash`, inspection: "Exact synthetic grant" });
  if (r.command === "provider_confirm") {
    attempts++; saved = true;
    if (scenario === "blocked" || attempts < 3) return { kind: "memory_error", error: {
      code: scenario === "blocked" ? "permission_denied" : "busy", retryable: scenario !== "blocked", rules: [] } };
    return reply({ kind: "grant", committed: true });
  }
  throw new Error(`Unexpected command ${r.command}`);
});
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI timeout: ${text()}`); }
function click(label: string) { const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable: ${label}`); b.click(); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
let root = createRoot(fixture);
function render() { root.render(<ExternalPanel branch={{ sessionId: "synthetic", branchId: "synthetic" }} text="Unsent draft" invocations={[]}
  native={native} onChanged={async () => { changed++; }} onBusyChange={v => { owned = v; }} consumeText={() => { throw new Error("Unexpected prepare"); }} />); }
try {
  render(); await wait(() => button("Review a grant…")?.disabled === false);
  click("Review a grant…"); await wait(() => button("Confirm")?.disabled === false);
  check("review_owns_session_until_settled", owned);
  check("held_review_withholds_model_permissions_keys_and_replacement", !!fixture.querySelector<HTMLSelectElement>("select")?.disabled &&
    !!fixture.querySelector<HTMLInputElement>("input[type=checkbox]")?.disabled && button("Set key…")?.disabled === true &&
    button("Remove key")?.disabled === true && button("Review a grant…")?.disabled === true && button("Reload settings")?.disabled === true);
  click("Confirm"); await wait(() => !!button("Retry"));
  check("lost_receipt_keeps_exact_plan_visible", text().includes("Exact synthetic grant"));
  click("Confirm"); await sleep(20); await wait(() => attempts === 2 && button("Confirm")?.disabled === false && !!button("Retry"));
  click("Retry"); await wait(() => !button("Confirm") && !owned);
  const confirmations = calls.filter(c => c.command === "provider_confirm");
  check("explicit_confirm_and_retry_keep_payload_and_key", confirmations.length === 3 && confirmations.every(c => c.key === confirmations[0].key && JSON.stringify(c.args) === JSON.stringify(confirmations[0].args)));
  check("successful_confirmation_reads_saved_state", text().includes("Allowed by grant") && changed === 1);
  root.unmount(); root = createRoot(fixture);
  scenario = "blocked"; attempts = 0; saved = false; changed = 0;
  render(); await wait(() => button("Review a grant…")?.disabled === false);
  click("Review a grant…"); await wait(() => button("Confirm")?.disabled === false);
  click("Confirm"); await wait(() => text().includes("cannot be retried"));
  check("nonretryable_refusal_withholds_confirm", button("Confirm")?.disabled === true && !button("Retry") && owned);
  const writesBeforeCancel = calls.filter(c => c.command === "provider_confirm").length;
  click("Cancel"); await wait(() => !button("Confirm") && !owned && text().includes("Allowed by grant"));
  check("cancel_reads_saved_outcome_and_clears_old_retry", changed === 1 && !button("Retry"));
  check("cancel_does_not_repeat_confirmation", calls.filter(c => c.command === "provider_confirm").length === writesBeforeCancel);
  check("fixture_never_prepares_or_sends", calls.every(c => ["provider_status", "egress_grant_plan", "provider_confirm"].includes(c.command)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok) }, null, 2); }
