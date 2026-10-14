// Read-only saved invocation rendering while provider setup is off.
import { createRoot } from "react-dom/client";
import { ExternalPanel } from "../src/memory/ExternalPanel";
import { setTransport } from "../src/memory/client";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: string[] = [];
const invocation = (state: unknown, code: unknown, n: number) => ({ dispatch_id: `synthetic-dispatch-${n}`, state, error_code: code, reserved_tokens: 128, input_tokens: null, output_tokens: null });
const records = [invocation("failed", "storage_failed", 1), invocation("failed", "provider_unavailable", 2), invocation("completed", null, 3),
  invocation("length", null, 4), invocation("failed", "private unstructured message", 5), invocation("constructor", "constructor", 6)];
setTransport(async (native, args) => {
  calls.push(native);
  if (native === "memory_provider_setup") return { state: "absent" };
  const r = args.request as { command: string };
  if (native !== "memory_call" || r.command !== "provider_status") throw new Error("Unexpected non-read action");
  return { kind: "memory_page", result: { configured: false, destinations: [], grants: [] } };
});
const root = createRoot(fixture);
root.render(<ExternalPanel branch={{ sessionId: "synthetic-session", branchId: "synthetic-branch" }} text="Unsent draft" invocations={records}
  onChanged={async () => { throw new Error("Unexpected parent write/readback"); }} consumeText={() => { throw new Error("Unexpected draft consumption"); }} />);
const text = () => fixture.textContent ?? "";
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
try {
  for (let n = 0; n < 250 && !text().includes("External providers are off"); n++) await sleep(20);
  check("saved_failure_is_readable_with_providers_off", text().includes("External providers are off") && text().includes("Recorded error: Storage failed"));
  check("known_saved_provider_code_is_retained", text().includes("provider_unavailable"));
  check("success_and_limit_do_not_inherit_failure_reason", [...fixture.querySelectorAll("li")].slice(2, 4).every(row => !row.textContent!.includes("Recorded error")));
  check("unknown_or_private_codes_use_safe_fallback", text().includes("Saved error unavailable") && !text().includes("private unstructured message") && !text().includes("function Object"));
  check("unknown_state_does_not_impersonate_a_terminal_outcome", text().includes("Saved outcome unavailable"));
  check("dispatch_identity_remains_available_in_full", fixture.querySelector('[title="synthetic-dispatch-1"]') != null);
  check("no_model_retry_or_prepare_is_offered", ![...fixture.querySelectorAll("button")].some(b => /Retry|Send once|Prepare the question/.test(b.textContent ?? "")));
  check("history_rendering_only_reads_setup", calls.length === 2 && calls.includes("memory_call") && calls.includes("memory_provider_setup"));
} catch (error) { checks.push({ id: String(error), ok: false }); }
finally { root.unmount(); document.getElementById("results")!.textContent = JSON.stringify({ checks, passed: checks.every(c => c.ok), calls }, null, 2); }
