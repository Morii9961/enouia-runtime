// Actual source suggestion panel; only synthetic provider-status reads occur.
import { createRoot } from "react-dom/client";
import { ExtractionPanel } from "../src/memory/ExtractionPanel";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: string[] = [];
let state: "failure" | "off" | "no-grant" | "granted" = "failure";
let held = false;
let release: (() => void) | null = null;
const releasePending = () => release?.();
let closed = 0;
setTransport(async (native, args) => {
  if (native !== "memory_call") throw new Error(`Unexpected native command ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown>; idempotencyKey: string | null };
  calls.push(r.command);
  if (r.command !== "provider_status" || r.idempotencyKey !== null || Object.keys(r.arguments).length) throw new Error("Unexpected mutation or payload");
  if (held) { held = false; await new Promise<void>(resolve => { release = resolve; }); }
  if (state === "failure") return { kind: "memory_error", error: { code: "storage_failed", retryable: false, rules: [] } };
  const result = { configured: state !== "off", destinations: state === "off" ? [] : ["openai", "anthropic"].map(api => ({ api, model: `synthetic-${api}` })), grants: state === "granted" ? [{ active: true, policyId: "synthetic-policy", purposes: ["extraction"], destinations: [{ provider: "anthropic", model: "synthetic-anthropic" }] }] : [] };
  return { kind: "memory_page", result, error: null };
});
const root = createRoot(fixture); root.render(<ExtractionPanel range={{ sourceId: "synthetic-source", revision: 1, start: 0, end: 20 }} onClose={() => { closed++; }} />);
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI wait timed out: ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
function click(label: string) { const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable ${label}`); b.click(); }
try {
  await wait(() => !!fixture.querySelector('[role="alert"]'));
  check("nonretryable_provider_read_has_explicit_recovery", !!button("Read provider status again") && !button("Prepare the request…") && !button("Send once"));
  state = "off"; held = true; click("Read provider status again"); await wait(() => release != null);
  check("pending_recovery_withholds_model_actions", text().includes("Reading provider setup") && !button("Prepare the request…") && !button("Send once"));
  releasePending(); await wait(() => text().includes("External providers are off"));
  check("off_status_recovers_without_reopening", closed === 0 && !!button("Read provider status again") && !fixture.querySelector('[role="alert"]'));
  state = "no-grant"; click("Read provider status again"); await wait(() => text().includes("No grant allows extraction"));
  check("configured_models_still_require_extraction_grant", !button("Prepare the request…") && fixture.querySelectorAll("select option").length === 2);
  const choice = fixture.querySelector<HTMLSelectElement>("select")!; choice.value = "anthropic"; choice.dispatchEvent(new Event("change", { bubbles: true })); await sleep(30);
  state = "failure"; click("Read provider status again"); await wait(() => !!fixture.querySelector('[role="alert"]'));
  check("failed_replacement_withholds_previous_setup", !fixture.querySelector("select") && !button("Prepare the request…") && !!button("Read provider status again"));
  state = "no-grant"; click("Read provider status again"); await wait(() => !!fixture.querySelector("select"));
  check("valid_reread_preserves_selected_configured_model", fixture.querySelector<HTMLSelectElement>("select")!.value === "anthropic");
  state = "granted"; click("Read provider status again"); await wait(() => !!button("Prepare the request…"));
  check("fresh_grant_unlocks_only_explicit_preparation", !button("Prepare the request…")!.disabled && !button("Send once") && !button("Read provider status again") && calls.every(c => c === "provider_status"));
  check("recovery_never_prepares_sends_or_changes_grants", calls.length === 6 && calls.every(c => c === "provider_status"));
  click("Close"); check("recovered_panel_can_close", closed === 1);
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
