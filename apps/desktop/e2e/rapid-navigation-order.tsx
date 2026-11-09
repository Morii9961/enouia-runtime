// The actual shell with its fictional demo surfaces; no native window, Vault or IPC is used.
// Happy DOM has no View Transitions, so a stand-in defers each update the way
// WebView2 does: the update runs only after the old frame is captured. The
// stand-in runs held updates in a chosen order to show that the last move wins
// however the engine orders a skipped transition's callback.
import { createRoot } from "react-dom/client";
import App from "../src/App";
import AutoMemory from "../src/screens/automemory/AutoMemory";
import "../src/quiet-runtime.css";

const held: { update: () => void; ran: boolean; done: () => void }[] = [];
(document as Document & { startViewTransition?: unknown }).startViewTransition = (update: () => void) => {
  let done = () => {};
  const finished = new Promise<void>(resolve => { done = resolve; });
  held.push({ update, ran: false, done });
  return { finished };
};
function runHeld(order: "newest-first" | "oldest-first") {
  const queue = order === "newest-first" ? [...held].reverse() : [...held];
  held.length = 0;
  for (const step of queue) { step.update(); step.done(); }
}

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const root = createRoot(fixture);
root.render(<App memoryConnected={false} startPage="home" breathing={false} />);
const main = () => document.getElementById("runtime-content");
const label = () => main()?.getAttribute("aria-label") ?? "";
const current = () => fixture.querySelector("nav [aria-current='page']")?.getAttribute("data-runtime-page") ?? "";
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI wait timed out: ${label()} ${current()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); }
function shortcut(digit: string) { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: digit, ctrlKey: true, bubbles: true, cancelable: true })); }
try {
  await wait(() => label() === "Home content");
  check("transition_defers_the_update", (shortcut("2"), label() === "Home content" && held.length === 1));
  shortcut("3"); runHeld("newest-first"); await sleep(30);
  check("second_move_wins_when_engine_runs_newest_first", label() === "Context Surface content" && current() === "context");

  shortcut("1"); runHeld("oldest-first"); await wait(() => label() === "Home content");
  shortcut("2"); shortcut("1"); runHeld("oldest-first"); await sleep(30);
  check("return_to_start_wins_when_engine_runs_oldest_first", label() === "Home content" && current() === "home");

  shortcut("4"); shortcut("5"); shortcut("6"); runHeld("newest-first"); await sleep(30);
  check("three_quick_moves_end_on_the_last", label() === "Settings content" && current() === "settings");

  // The synthetic automatic-memory preview switches views the same way.
  root.unmount();
  const preview = createRoot(fixture);
  preview.render(<AutoMemory />);
  const pressed = () => fixture.querySelector(".am-view[aria-pressed='true']")?.getAttribute("data-auto-view") ?? "";
  const view = (id: string) => fixture.querySelector<HTMLButtonElement>(`.am-view[data-auto-view="${id}"]`)!;
  await wait(() => pressed() === "formation");
  view("grid").click(); view("formation").click(); runHeld("oldest-first"); await sleep(30);
  check("preview_return_to_start_view_wins", pressed() === "formation");
  view("grid").click(); view("timeline").click(); runHeld("newest-first"); await sleep(30);
  check("preview_second_view_wins_when_engine_runs_newest_first", pressed() === "timeline");
  preview.unmount();
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok) }, null, 2); }
