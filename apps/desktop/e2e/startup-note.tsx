// Actual Settings startup row with synthetic startup commands; the login setting is never changed.
import { createRoot } from "react-dom/client";
import { MemorySettings, MemoryStatusProvider } from "../src/memory/status";
import { setTransport } from "../src/memory/client";
import { setLang, useLang } from "../src/i18n";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: string[] = [];
let enabled = false, failWrite = false, failRead = false, holdWrite = false, release: (() => void) | null = null;
const releasePending = () => { const resolve = release; release = null; resolve?.(); };
const startup = () => ({ supported: true, state: enabled ? "enabled" : "disabled", enabled });
setTransport(async (native, args) => {
  calls.push(native);
  switch (native) {
    case "shell_status": return { vaultChanging: false };
    case "startup_status": if (failRead) throw "startup_unavailable"; return startup();
    case "memory_provider_setup": return { state: "absent", file: "memory-providers.json" };
    case "startup_set":
      if (holdWrite) { holdWrite = false; await new Promise<void>(resolve => { release = resolve; }); }
      if (failWrite) throw "startup_write";
      enabled = args.enabled === true; return startup();
    case "memory_call": return { kind: "memory_page", result: { vault: { state: "open", rootName: "Synthetic Vault", health: "clean", headSequence: 1, lastCommitAt: "2026-10-16T00:00:00Z" }, companion: { exiting: false }, components: [] } };
    default: throw new Error(`Unexpected native ${native}`);
  }
});
const root = createRoot(fixture);
function FixtureRoot() { useLang(); return <MemoryStatusProvider><MemorySettings openMemory={() => {}} /></MemoryStatusProvider>; }
root.render(<FixtureRoot />);
const toggle = () => fixture.querySelector<HTMLButtonElement>('[role="switch"]');
const note = () => fixture.querySelector(".mem-note[aria-atomic]")?.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === label);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI wait timed out: ${fixture.textContent}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
function click(control: HTMLButtonElement | null | undefined) { if (!control || control.disabled) throw new Error("Unavailable control"); control.click(); }
const reread = async () => { click(button("Read startup setting again")); await wait(() => toggle()?.disabled === false && button("Read startup setting again")?.disabled === false); await sleep(30); };
try {
  await wait(() => toggle()?.disabled === false);
  click(toggle()); await wait(() => toggle()?.getAttribute("aria-checked") === "true");
  check("successful_change_is_acknowledged", note() === "Runtime will start in the tray when you sign in.");
  const afterFirstWrite = calls.filter(c => c === "startup_set").length;
  await setLang('ja'); await wait(() => note() === "サインインすると Runtime がトレイで起動します。");
  check("cached_acknowledgement_follows_interface_language", note() === "サインインすると Runtime がトレイで起動します。");
  check("startup_description_is_localized", fixture.querySelector('#mem-startup-description')?.textContent?.includes('既定ではオフです。') === true);
  check("language_change_does_not_write_startup_setting", calls.filter(c => c === "startup_set").length === afterFirstWrite);
  await setLang('en'); await wait(() => !!button("Read startup setting again"));
  enabled = false; await reread();
  check("reread_shows_observed_state", toggle()?.getAttribute("aria-checked") === "false");
  check("reread_retires_contradicted_acknowledgement", !note().includes("will start"));
  click(toggle()); await wait(() => toggle()?.getAttribute("aria-checked") === "true" && note().includes("will start"));
  holdWrite = true; failWrite = true; click(toggle()); await wait(() => release != null);
  check("pending_change_retires_previous_acknowledgement", note() === "");
  releasePending(); await wait(() => !!fixture.querySelector('[role="alert"]')); await sleep(30);
  check("failed_change_claims_no_new_state", note() === "" && toggle()?.getAttribute("aria-checked") === "true");
  const beforeReadFailure = calls.filter(c => c === "startup_set").length;
  failWrite = false; failRead = true; click(button("Read startup setting again"));
  await wait(() => fixture.textContent?.includes('Previous startup observation.') === true);
  await setLang('zh-Hans'); await wait(() => fixture.textContent?.includes('这是上一次读取的启动设置。') === true);
  check("failed_reread_explains_previous_observation_in_current_language", fixture.textContent?.includes('读取不会改变登录启动选项。') === true && toggle()?.disabled === true);
  root.render(<FixtureRoot key="unknown-startup" />);
  await wait(() => fixture.textContent?.includes('启动设置尚未读取成功。') === true);
  check("failed_first_read_has_localized_unknown_state", toggle()?.disabled === true);
  check("read_failures_do_not_change_login_startup", calls.filter(c => c === "startup_set").length === beforeReadFailure);
  check("fixture_uses_only_startup_and_status_commands", calls.every(c => ["shell_status", "startup_status", "startup_set", "memory_call", "memory_provider_setup"].includes(c)));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok) }, null, 2); }
