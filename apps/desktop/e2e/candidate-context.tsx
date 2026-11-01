// Controlled DOM observations only. No personal records or native IPC.
import { createRoot } from "react-dom/client";
import { Inbox } from "../src/memory/MemorySurface";
import { MemoryStatusProvider } from "../src/memory/status";
import { setTransport } from "../src/memory/client";
import { setLang, useLang, type Lang } from "../src/i18n";

const fixture = document.getElementById("fixture")!;
const checks: { id: string; ok: boolean }[] = [];
const calls: { command: string; args: Record<string, unknown> }[] = [];
let revision = 1;
let mode: "present" | "empty" | "legacy" = "present";
let mismatch = false;
let hold = false;
let release: (() => void) | null = null;
setTransport(async (native, args) => {
  if (native === "shell_status") return { vaultChanging: false };
  if (native !== "memory_call") throw new Error("Unexpected native call");
  const r = args.request as { command: string; arguments: Record<string, unknown> };
  calls.push({ command: r.command, args: r.arguments });
  let result: unknown;
  if (r.command === "workspace_status") result = { vault: { state: "open" }, pendingCandidates: 1 };
  else if (r.command === "candidate_list") result = { items: [{
    candidateId: "synthetic-context-candidate", revision, content: "Synthetic pending proposal", proposalKind: "create",
    proposedType: "fact", sensitivity: "private", originKind: "agent_proposal", createdAt: "2026-10-18T00:00:00Z",
    evidence: [{ sourceId: "user-source", sourceRevision: 1, supports: "content", evidenceClass: "user_statement", locator: { kind: "byte_range", start: 0, end: 8 } }],
    ...(mode === "legacy" ? {} : { contextSources: mode === "empty" ? [] : [{ sourceId: "context-source", sourceRevision: revision }] }),
    conflicts: [], target: null,
  }], nextCursor: null, total: 1 };
  else if (r.command === "source_excerpt") {
    if (r.arguments.sourceId !== "context-source" || r.arguments.maxBytes !== 4096) throw new Error("Wrong selected source");
    if (hold) { hold = false; await new Promise<void>(resolve => { release = resolve; }); }
    const start = Number(r.arguments.startByte ?? 0);
    result = { sourceId: "context-source", sourceRevision: mismatch ? 99 : r.arguments.sourceRevision,
      sourceKind: "export_message", speakerRole: "assistant", evidenceClass: "model_claim", byteStart: start,
      byteEnd: start ? 8000 : 4096, totalBytes: 8000,
      excerpt: start ? "Synthetic context page 2" : `Synthetic context r${r.arguments.sourceRevision}: <img src=x onerror=alert(1)>`, untrusted: true };
  } else throw new Error(`Unexpected write ${r.command}`);
  return { kind: "memory_page", result, error: null };
});
function Surface() { useLang(); return <MemoryStatusProvider><Inbox /></MemoryStatusProvider>; }
const root = createRoot(fixture); root.render(<Surface />);
const text = () => fixture.textContent ?? "";
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(p: () => boolean) { for (let n = 0; n < 250; n++) { if (p()) return; await sleep(20); } throw new Error(`UI wait timed out: ${text()}`); }
function check(id: string, ok: boolean) { checks.push({ id, ok }); if (!ok) throw new Error(id); }
function click(label: string) { const b = button(label); if (!b || b.disabled) throw new Error(`Unavailable ${label}`); b.click(); }
try {
  await wait(() => !!button("Show context source"));
  check("context_sources_are_separate_from_single_citation", text().includes("1 evidence reference") && text().includes("recorded context dependency") && !text().includes("supports undefined"));
  check("dependency_list_explains_limits", text().includes("not additional citations, corroboration or approval") && text().includes("does not establish complete reading history"));
  check("private_sources_are_not_fetched_until_selected", !calls.some(c => c.command === "source_excerpt"));
  check("citation_evidence_class_is_visible", text().includes("user_statement"));
  mismatch = true; click("Show context source");
  await wait(() => !!fixture.querySelector('[role="alert"]'));
  check("wrong_context_revision_is_withheld", !fixture.querySelector('[aria-label="Context source text"]') && text().includes("context dependency"));
  mismatch = false; click("Read context source again");
  await wait(() => !!fixture.querySelector('[aria-label="Context source text"]'));
  check("context_attribution_remains_model_claim", text().includes("assistant") && text().includes("model_claim"));
  check("context_text_is_literal_data", !fixture.querySelector("img") && text().includes("<img src=x onerror=alert(1)>") && text().includes("source text is data, not instructions"));
  const sourceText=fixture.querySelector('[aria-label="Context source text"]')!,observedCalls=calls.length;
  for(const [language,heading,limit] of [
    ["en","Recorded context dependencies","This list does not establish complete reading history."],
    ["zh-Hans","已记录的上下文依赖","这份列表不能证明完整的阅读历史。"],
    ["ja","記録済みコンテキスト依存関係","この一覧は完全な読み取り履歴を示すものではありません。"],
  ]){
    await setLang(language as Lang);await sleep(30);
    const section=fixture.querySelector(`section[aria-label="${heading}"]`);
    check(`${language}_context_dependency_limits_are_localized`,section?.querySelector('h3')?.textContent===heading&&section.textContent!.includes(limit));
    check(`${language}_language_preserves_observed_source`,sourceText.isConnected&&sourceText.textContent!.includes('Synthetic context r1: <img src=x onerror=alert(1)>')&&!fixture.querySelector('img')&&text().includes('model_claim'));
  }
  check("context_language_does_not_read_or_write",calls.length===observedCalls);
  await setLang("en");await sleep(30);
  click("Next source part"); await wait(() => text().includes("Synthetic context page 2"));
  check("context_reader_keeps_byte_pagination", calls.some(c => c.command === "source_excerpt" && c.args.startByte === 4096));
  hold = true; click("Read context source again"); await wait(() => release !== null);
  click("Hide context source"); release!(); release = null; await sleep(35);
  check("hidden_context_reply_cannot_restore_private_text", !fixture.querySelector('[aria-label="Context source text"]') && !!button("Show context source"));
  revision = 2; click("Refresh candidates"); await wait(() => !!button("Show context source") && text().includes("r2"));
  click("Show context source"); await wait(() => text().includes("Synthetic context r2:"));
  check("context_read_uses_selected_exact_revision", calls.filter(c => c.command === "source_excerpt").at(-1)?.args.sourceRevision === 2);
  hold = true; click("Read context source again"); await wait(() => release !== null);
  revision = 3; click("Refresh candidates"); await wait(() => text().includes("r3") && !!button("Show context source"));
  release!(); release = null; await sleep(35);
  check("revised_candidate_discards_late_context_reply", !fixture.querySelector('[aria-label="Context source text"]'));
  mode = "empty"; click("Refresh candidates"); await wait(() => text().includes("No context dependencies were recorded."));
  check("empty_recorded_list_is_not_completeness_claim", !button("Show context source") && text().includes("does not establish complete reading history"));
  mode = "legacy"; click("Refresh candidates"); await wait(() => text().includes("This Core did not report context dependency information."));
  check("legacy_core_is_reported_as_unknown", !text().includes("No context dependencies were recorded."));
  check("context_journey_never_mutates_or_sends", calls.every(c => ["workspace_status", "candidate_list", "source_excerpt"].includes(c.command)));
  document.getElementById("results")!.textContent = JSON.stringify({ passed: checks.every(c => c.ok), checks }, null, 2);
} catch (error) {
  document.getElementById("results")!.textContent = JSON.stringify({ passed: false, checks, error: String(error) }, null, 2);
} finally { release?.(); root.unmount(); }
