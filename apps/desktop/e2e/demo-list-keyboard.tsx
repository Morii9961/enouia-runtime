// Actual demo shell, synthetic data, DOM-model keyboard evidence only. No native IPC.
import { createRoot } from "react-dom/client";
import App from "../src/App";
import "../src/quiet-runtime.css";

const fixture = document.getElementById("fixture")!;
const root = createRoot(fixture);
const checks: { id: string; ok: boolean }[] = [];
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(test: () => boolean) { for (let n = 0; n < 250; n++) { if (test()) return; await sleep(20); } throw new Error(`UI timeout: ${fixture.textContent?.slice(0, 160)}`); }
const check = (id: string, ok: boolean) => checks.push({ id, ok });
const main = () => document.getElementById("runtime-content")!;
const memoryRows = () => [...fixture.querySelectorAll<HTMLButtonElement>(".qr44 .qr43")];
const selected = () => fixture.querySelector<HTMLButtonElement>('.qr43[aria-pressed="true"]');
const press = (target: HTMLElement, key: string, ctrlKey = false) => {
  target.focus();
  const event = new KeyboardEvent("keydown", { key, ctrlKey, bubbles: true, cancelable: true });
  target.dispatchEvent(event); return event;
};
async function resetMemory() { const first = memoryRows()[0]; first.click(); await wait(() => selected() === first); return first; }
root.render(<App memoryConnected={false} startPage="memory" breathing={false} />);
try {
  await wait(() => memoryRows().length > 1);
  for (const [name, target] of [
    ["main", main()], ["inspector", fixture.querySelector<HTMLElement>(".qr88 .qr49")!],
    ["collection", fixture.querySelector<HTMLElement>(".qr26")!],
  ] as const) {
    const first = await resetMemory(); const event = press(target, "ArrowDown"); await sleep(30);
    check(`memory_${name}_does_not_move_or_prevent`, selected() === first && !event.defaultPrevented);
  }
  await resetMemory(); const [first, second] = memoryRows();
  const down = press(first, "ArrowDown"); await wait(() => selected() === second);
  check("memory_list_down_moves_and_prevents", down.defaultPrevented);
  const up = press(first, "ArrowUp"); await wait(() => selected() === first);
  check("memory_list_up_moves_and_prevents", up.defaultPrevented);
  const input = fixture.querySelector<HTMLInputElement>(".qr21")!;
  const inputKey = press(input, "ArrowDown"); await sleep(30);
  check("search_field_owns_its_keys", !inputKey.defaultPrevented && selected() === first);
  fixture.querySelector<HTMLButtonElement>(".am-entry")!.click(); await wait(() => !!fixture.querySelector(".am-h1"));
  const previewKey = press(fixture.querySelector<HTMLElement>(".am-view")!, "ArrowDown"); await sleep(30);
  check("synthetic_preview_keeps_its_keys", !previewKey.defaultPrevented && memoryRows().length === 0);
  fixture.querySelector<HTMLButtonElement>(".am-back")!.click(); await wait(() => memoryRows().length > 1);
  check("hidden_demo_selection_unchanged", selected() === memoryRows()[0]);
  const shortcut = press(main(), "4", true); await wait(() => !!fixture.querySelector(".qr135 .qr134"));
  check("global_page_shortcut_preserved", shortcut.defaultPrevented);
  const sessions = [...fixture.querySelectorAll<HTMLButtonElement>(".qr135 .qr134")];
  const outsideKey = press(main(), "ArrowDown"); await sleep(30);
  check("session_main_does_not_move_or_prevent", !outsideKey.defaultPrevented && sessions[0].getAttribute("aria-pressed") === "true");
  sessions[0].click(); await wait(() => sessions[0].getAttribute("aria-pressed") === "true");
  const sessionDown = press(sessions[0], "ArrowDown"); await wait(() => sessions[1].getAttribute("aria-pressed") === "true");
  check("session_list_down_moves_and_prevents", sessionDown.defaultPrevented);
  const sessionUp = press(sessions[0], "ArrowUp"); await wait(() => sessions[0].getAttribute("aria-pressed") === "true");
  check("session_list_up_moves_and_prevents", sessionUp.defaultPrevented);
  const nav = [...fixture.querySelectorAll<HTMLButtonElement>("nav button")];
  const navKey = press(nav[0], "ArrowDown");
  check("navigation_rail_keeps_its_keys", navKey.defaultPrevented && document.activeElement === nav[1]);
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok) }); }
