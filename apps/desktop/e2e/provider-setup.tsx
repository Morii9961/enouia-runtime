// Browser-mounted controls with synthetic IPC only. Never mounts the app,
// opens a Vault, accesses Credential Manager or uses a provider transport.
import { createRoot } from "react-dom/client";
import { ExternalPanel } from "../src/memory/ExternalPanel";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const sent: string[] = [];
const preview = new URLSearchParams(location.search).has("preview");
let mode = "absent";
let next = "ready";
let failRead = false;
const status = () => ({ configured: mode === "ready", destinations: mode === "ready"
  ? [{ api: "openai", model: "synthetic-model", streaming: "supported", maxOutputTokens: 4096 }] : [], grants: [] });
setTransport(async (command, args) => {
  const request = args.request as { command: string } | undefined;
  sent.push(command === "memory_call" ? request!.command : command);
  if (command === "memory_provider_setup") return { state: mode, rule: mode === "invalid" ? "provider_setup.limits" : undefined };
  if (command === "memory_provider_reload") {
    if (next === "busy") throw "provider.call_running";
    if (next === "delivery") { mode = "absent"; throw "worker_failed"; }
    mode = next;
    return { state: mode };
  }
  if (command === "memory_call" && request?.command === "provider_status") {
    if (failRead) throw "worker_failed";
    return { kind: "memory_page", result: status(), error: null };
  }
  throw new Error(`Unexpected synthetic call: ${command}`);
});
const root = createRoot(document.getElementById("fixture")!);
root.render(<ExternalPanel branch={{ sessionId: "synthetic-session", branchId: "synthetic-branch" }}
  text="Unsent synthetic question" invocations={[]} onChanged={async () => {}} consumeText={() => {}} />);
const checks: { id: string; ok: boolean }[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = () => document.getElementById("fixture")!.textContent ?? "";
const check = (id: string, ok: boolean) => { checks.push({ id, ok }); if (!ok) throw new Error(id); };
async function wait(predicate: () => boolean) {
  for (let n = 0; n < 100; n++) { if (predicate()) return; await sleep(20); }
  throw new Error("Synthetic UI wait timed out");
}
function click(label: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("#fixture button")].find(b => b.textContent === label);
  if (!button || button.disabled) throw new Error(`Button unavailable: ${label}`);
  button.click();
}
try {
  if (!preview) {
  await wait(() => text().includes("External providers are off"));
  await sleep(250);
  check("initial_status_read_once", sent.filter(c => c === "provider_status").length === 1);
  check("initial_native_read_once", sent.filter(c => c === "memory_provider_setup").length === 1);
  click("Reload settings");
  await wait(() => text().includes("synthetic-model"));
  check("reload_ready", mode === "ready");
  check("ready_is_not_key_or_permission", text().includes("Set key") && text().includes("No grant allows sending"));
  next = "busy";
  click("Reload settings");
  await wait(() => text().includes("still running"));
  check("busy_preserves_ready", text().includes("synthetic-model"));
  next = "invalid";
  click("Reload settings");
  await wait(() => text().includes("output limit"));
  check("invalid_removes_actions", ![...document.querySelectorAll("#fixture button")].some(b => b.textContent === "Set key…"));
  next = "absent";
  click("Reload settings");
  await wait(() => text().includes("External providers are off"));
  check("removed_file_disables", !text().includes("synthetic-model"));
  failRead = true;
  click("Reload settings");
  await wait(() => text().includes("stopped unexpectedly"));
  check("read_failure_has_recovery", [...document.querySelectorAll("#fixture button")].some(b => b.textContent === "Read status again"));
  failRead = false;
  click("Read status again");
  await wait(() => text().includes("External providers are off"));
  check("read_recovery", !text().includes("stopped unexpectedly"));
  next = "ready";
  click("Reload settings");
  await wait(() => text().includes("synthetic-model"));
  next = "delivery";
  click("Reload settings");
  await wait(() => text().includes("External providers are off") && text().includes("stopped unexpectedly"));
  check("lost_reload_reply_reobserves_core", ![...document.querySelectorAll("#fixture button")].some(b => b.textContent === "Set key…"));
  check("no_key_egress_or_vault_calls", sent.every(c => ["provider_status", "memory_provider_setup", "memory_provider_reload"].includes(c)));
  }
} catch (error) {
  checks.push({ id: String(error), ok: false });
} finally {
  if (!preview) root.unmount();
  document.getElementById("results")!.textContent = preview ? "Synthetic UI preview; no account, Vault or provider access." : JSON.stringify({ checks, passed: checks.every(c => c.ok), calls: sent.length }, null, 2);
}
