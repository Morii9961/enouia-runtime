// The actual Settings status/reload component with synthetic native replies.
// No Vault, file, key, model or Activity operation is performed.
import { createRoot } from "react-dom/client";
import { ProviderSettingsStatus } from "../src/memory/ProviderSettingsStatus";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!, root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [], calls: { command: string; args: Record<string, unknown> }[] = [];
let mode = "absent", next = "ready", raw: unknown = null, failRead = false, failReload = false;
let holdRead = true, holdReload = false, disabled = false, release: (() => void) | null = null;
const releasePending = () => { const resolve = release; release = null; resolve?.(); };
setTransport(async (command, args) => {
  calls.push({ command, args });
  if (command === "memory_provider_setup") {
    const reply = raw ?? { state: mode, file: "memory-providers.json", ...(mode === "invalid" ? { rule: "provider_setup.limits" } : {}) };
    if (holdRead) { holdRead = false; await new Promise<void>(resolve => { release = resolve; }); }
    if (failRead) throw "synthetic-private-path-must-not-display";
    return reply;
  }
  if (command === "memory_provider_reload") {
    if (holdReload) { holdReload = false; await new Promise<void>(resolve => { release = resolve; }); }
    mode = next;
    if (failReload) throw "worker_failed";
    // A reload receipt is deliberately not an authoritative observation.
    return { state: "invalid", file: "memory-providers.json", rule: "provider_setup.model" };
  }
  throw new Error(`Unexpected native operation ${command}`);
});
const render = () => root.render(<ProviderSettingsStatus disabled={disabled} />);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === label)!;
const read = () => button("Read loaded settings again"), reload = () => button("Reload model settings");
const count = (name: string) => calls.filter(call => call.command === name).length;
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
async function wait(predicate: () => boolean) {
  for (let n = 0; n < 250; n++) { if (predicate()) return; await sleep(20); }
  throw new Error(`UI timeout: ${text()}`);
}
function click(control: HTMLButtonElement) { if (!control || control.disabled) throw new Error("Unavailable control"); control.click(); }
async function settled() { await sleep(20); await wait(() => !read().disabled); }
async function reread() { click(read()); await settled(); }
try {
  render(); await wait(() => release != null);
  check("initial_observation_does_not_claim_loaded_or_enable_reload", text().includes("Reading loaded") && reload().disabled && count("memory_provider_reload") === 0);
  releasePending(); await settled();
  check("absent_is_an_observed_off_state_without_opening_a_vault", text().includes("no settings file was loaded") && !reload().disabled);
  const initialReads = calls.length; render(); await sleep(30);
  check("parent_rerender_does_not_restart_setup_reads", calls.length === initialReads);
  mode = "invalid"; await reread();
  check("refused_settings_explain_the_known_rule", text().includes("Settings refused") && text().includes("smaller than the context window"));
  mode = "ready"; await reread();
  check("ready_describes_settings_without_claiming_key_or_request_success", text().includes("Settings loaded. Key access, grants and requests are separate") && text().includes("Observed"));
  holdRead = true; click(read()); await wait(() => release != null);
  const before = count("memory_provider_setup"); read().click(); reload().click();
  check("pending_read_clears_old_ready_and_refuses_overlapping_actions", !text().includes("Settings loaded.") && reload().disabled && count("memory_provider_setup") === before && count("memory_provider_reload") === 0);
  failRead = true; releasePending(); await settled();
  check("failed_read_withholds_reload_and_hides_raw_native_error", text().includes("Loaded model settings are unknown") && reload().disabled && !text().includes("synthetic-private-path"));
  failRead = false; await reread();
  check("explicit_read_recovers_without_reloading", text().includes("Settings loaded.") && count("memory_provider_reload") === 0);
  raw = { state: "ready", file: "unrelated.json" }; await reread();
  check("mismatched_setup_reply_cannot_claim_loaded_settings", !text().includes("Settings loaded.") && reload().disabled);
  raw = null; await reread();
  next = "absent"; holdReload = true; reload().focus(); click(reload()); await wait(() => release != null);
  const writes = count("memory_provider_reload"); reload().click(); read().click();
  check("explicit_reload_is_single_and_closes_both_controls", read().disabled && reload().disabled && count("memory_provider_reload") === writes && !text().includes("Settings loaded."));
  reload().blur(); releasePending(); await settled();
  check("reload_publishes_a_separate_host_read_not_its_receipt", text().includes("no settings file was loaded") && !text().includes("Settings refused"));
  check("reload_completion_restores_only_owned_focus", document.activeElement === reload());
  failReload = true; next = "ready"; click(reload()); await settled();
  check("lost_reload_ack_still_reobserves_the_loaded_state", text().includes("Reload was not acknowledged") && text().includes("Settings loaded."));
  const afterFailure = calls.length; await sleep(30);
  check("reload_failure_has_no_automatic_retry", calls.length === afterFailure);
  failReload = false; failRead = true; click(reload()); await settled();
  check("successful_ack_without_observation_cannot_claim_ready", reload().disabled && !text().includes("Settings loaded.") && text().includes("Loaded model settings are unknown"));
  failRead = false; await reread();
  holdRead = true; click(read()); await wait(() => release != null);
  disabled = true; render(); await wait(() => text().includes("Runtime is exiting"));
  releasePending(); await sleep(30);
  check("observed_exit_withholds_old_or_late_setup_and_actions", read().disabled && reload().disabled && !text().includes("Settings loaded.") && !text().includes("Observed"));
  disabled = false; mode = "absent"; render(); await wait(() => text().includes("no settings file was loaded"));
  mode = "ready"; holdRead = true; click(read()); await wait(() => release != null);
  root.render(null); await sleep(20); mode = "absent"; render(); await wait(() => text().includes("no settings file was loaded"));
  releasePending(); await sleep(30);
  check("late_observation_does_not_publish_into_a_new_settings_mount", !text().includes("Settings loaded.") && text().includes("no settings file was loaded"));
  check("fixture_uses_only_existing_setup_and_explicit_reload_ports", calls.every(call => ["memory_provider_setup", "memory_provider_reload"].includes(call.command) && Object.keys(call.args).length === 0));
} finally {
  releasePending(); root.unmount();
  document.getElementById("results")!.textContent = JSON.stringify({ passed: checks.length > 0 && checks.every(check => check.ok), checks });
}
