// The actual shell with its fictional demo surfaces; no native window, Vault or IPC is used.
import { createRoot } from "react-dom/client";
import App from "../src/App";
import "../src/quiet-runtime.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const root = createRoot(fixture);
root.render(<App memoryConnected={false} startPage="home" breathing={false} />);
const main = () => document.getElementById("runtime-content");
const label = () => main()?.getAttribute("aria-label") ?? "";
const rail = (name: string) => fixture.querySelector<HTMLButtonElement>(`nav button[aria-label="${name}"]`) ?? fixture.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
const inMain = (text: string) => [...(main()?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(b => b.textContent?.includes(text));
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI wait timed out: ${label()} ${document.activeElement?.tagName}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
function shortcut(target: Element, digit: string) { target.dispatchEvent(new KeyboardEvent("keydown", { key: digit, ctrlKey: true, bubbles: true, cancelable: true })); }
try {
  await wait(() => label() === "Home content" && !!inMain("Memory"));
  const card = inMain("Memory")!; card.focus(); card.click();
  await wait(() => label() === "Memory Vault content"); await sleep(30);
  check("home_route_continues_in_new_surface", document.activeElement === main());
  const control = main()!.querySelector<HTMLElement>("button, input")!; control.focus();
  shortcut(control, "3"); await wait(() => label() === "Context Surface content"); await sleep(30);
  check("shortcut_from_surface_continues_in_new_surface", document.activeElement === main());
  const sessions = rail("Sessions")!; sessions.focus(); sessions.click();
  await wait(() => label() === "Sessions content"); await sleep(30);
  check("rail_click_keeps_rail_focus", document.activeElement === sessions);
  shortcut(sessions, "6"); await wait(() => label() === "Settings content"); await sleep(30);
  check("shortcut_from_rail_keeps_rail_focus", document.activeElement === sessions);
  const field = document.createElement("input"); document.body.appendChild(field); field.focus();
  shortcut(field, "1"); await wait(() => label() === "Home content"); await sleep(30);
  check("shortcut_respects_focus_outside_shell", document.activeElement === field); field.remove();
  const dialog = document.createElement("dialog"); dialog.setAttribute("open", ""); document.body.appendChild(dialog);
  shortcut(document.body, "2"); await sleep(50);
  check("open_dialog_still_blocks_shortcut", label() === "Home content"); dialog.remove();
  check("main_target_adds_no_tab_stop", main()?.tabIndex === -1);
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok) }, null, 2); }
