// The actual Memory surface and Vault gate inside a shell-like main region; Vault state, picker and IPC are synthetic.
import { createRoot } from "react-dom/client";
import MemorySurface from "../src/memory/MemorySurface";
import { MemoryStatusProvider } from "../src/memory/status";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const outside = document.createElement("input"); document.body.appendChild(outside);
const checks: { id: string; ok: boolean }[] = [];
const calls: string[] = [];
let state = "open", holdNext = false, release: (() => void) | null = null;
const releasePending = () => { const resolve = release; release = null; resolve?.(); };
setTransport(async (native, args) => {
  if (native === "shell_status") return { vaultChanging: false };
  if (native === "memory_pick") { calls.push("memory_pick"); return { token: "synthetic-root", displayName: "synthetic-vault", bytes: null }; }
  if (native !== "memory_call") throw new Error(`Unexpected native ${native}`);
  const r = args.request as { command: string; arguments: Record<string, unknown> };
  calls.push(r.command); let result: unknown = {};
  if (["vault_lock", "vault_unlock", "vault_open"].includes(r.command) && holdNext) { holdNext = false; await new Promise<void>(resolve => { release = resolve; }); }
  if (r.command === "workspace_status") result = { vault: { state, rootName: state === "none" ? undefined : "synthetic-vault", health: "ok", headSequence: 1, lastCommitAt: "2026-10-13T00:00:00Z" }, pendingCandidates: 0, operationsRunning: 0 };
  else if (r.command === "memory_list") result = { items: [], total: 0, nextCursor: null };
  else if (r.command === "vault_lock") state = "locked";
  else if (r.command === "vault_unlock" || r.command === "vault_open") state = "open";
  else throw new Error(`Unexpected command ${r.command}`);
  return { kind: "memory_page", result };
});
const root = createRoot(fixture);
root.render(<MemoryStatusProvider><main id="runtime-content" tabIndex={-1} aria-label="Memory Vault content"><MemorySurface /></main></MemoryStatusProvider>);
const main = () => document.getElementById("runtime-content");
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const heading = () => fixture.querySelector<HTMLElement>(".mem-card h2");
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 300; n++) { if (p()) return; await sleep(20); } throw new Error(`UI wait timed out: ${document.activeElement?.tagName} ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
function press(label: string) { const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable ${label}`); b.focus(); b.click(); }
async function openVaultPanel() {
  await wait(() => [...fixture.querySelectorAll<HTMLButtonElement>("button")].some(b => b.textContent?.startsWith("Vault & recovery")));
  [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.startsWith("Vault & recovery"))!.click();
  await wait(() => !!button("Lock Vault"));
}
try {
  await openVaultPanel();
  press("Lock Vault"); await wait(() => !!button("Unlock")); await sleep(30);
  check("lock_announces_locked_vault", document.activeElement === heading() && heading()?.textContent === "Vault locked · synthetic-vault");
  check("locked_heading_adds_no_tab_stop", heading()?.tabIndex === -1);
  press("Unlock"); await wait(() => !!button("Lock Vault")); await sleep(30);
  check("unlock_continues_in_vault_surface", document.activeElement === main());
  holdNext = true; press("Lock Vault"); await wait(() => release != null);
  outside.focus(); releasePending(); await wait(() => !!button("Unlock")); await sleep(30);
  check("lock_respects_moved_focus", document.activeElement === outside);
  holdNext = true; press("Unlock"); await wait(() => release != null);
  outside.focus(); releasePending(); await wait(() => !!button("Lock Vault")); await sleep(30);
  check("unlock_respects_moved_focus", document.activeElement === outside);
  state = "none"; await wait(() => !!button("Open an existing Vault…")); await sleep(30);
  check("status_change_does_not_take_moved_focus", document.activeElement === outside);
  press("Open an existing Vault…"); await wait(() => !!button("Lock Vault")); await sleep(30);
  check("open_continues_in_vault_surface", document.activeElement === main());
  check("gate_issues_only_requested_vault_commands", calls.filter(c => !["workspace_status", "memory_list"].includes(c)).join() === "vault_lock,vault_unlock,vault_lock,vault_unlock,memory_pick,vault_open");
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { releasePending(); root.unmount(); outside.remove(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok) }, null, 2); }
