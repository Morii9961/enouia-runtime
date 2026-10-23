// Development-only synthetic component preview. No native IPC/Provider connection.
import { useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { HistoryComparisonSelection } from "../src/memory/HistoryComparisonSelection";
import { CallError, type J } from "../src/memory/client";
import { historyComparisonFixture } from "../tests/history-comparison-fixture";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

function Preview() {
  const [data] = useState(() => {
    const data = historyComparisonFixture(), first = data.response.topics[0], second = first.entries.pop()!;
    for (const batch of data.task.batches) batch.invocationState = "completed";
    first.comparisons = [];
    second.details.claim_key = "synthetic_second_topic";
    (second.details as J).project_id = "synthetic-project";
    data.response.topics.push({ key: { ...first.key, label: "synthetic_second_topic", project: "synthetic-project" },
      entries: [second], comparisons: [] });
    const uncited = structuredClone(data.response.runs[0].sources[0]);
    uncited.slice.source.source_id = uncited.context.source.source_id = "synthetic-uncited-source";
    uncited.context.source_index = 1;
    uncited.context.text = "Synthetic uncited context. No suggestion does not prove this is irrelevant.";
    uncited.slice.end = uncited.context.selection.end = new TextEncoder().encode(uncited.context.text).length;
    uncited.suggestion_indices = [];
    data.response.runs[0].sources.push(uncited);
    return data;
  });
  const [enabled, setEnabled] = useState(true), [generation, setGeneration] = useState(0), [, render] = useState(0);
  const scenario = useRef({ refused: false, long: false, zero: false, calls: 0 });
  const request = useCallback(async (command: string, args: Record<string, unknown> = {}): Promise<J> => {
    const selected = args.batches as {taskId: string; batchIndex: number}[];
    if (!["history_compare", "history_brief"].includes(command) || !Array.isArray(selected) || selected.length < 1
      || selected.length > 2 || new Set(selected.map(batch=>batch.batchIndex)).size !== selected.length
      || selected.some(batch=>!data.response.batches.some(saved=>saved.taskId===batch.taskId&&saved.batchIndex===batch.batchIndex)))
      throw Error("Synthetic selection mismatch");
    scenario.current.calls++; render(n => n + 1);
    await new Promise(resolve => setTimeout(resolve, 180));
    if (scenario.current.refused) throw new CallError({ code: "permission_denied", retryable: false, rules: ["history.source_read"] });
    const result = structuredClone(data.response);
    result.batches = selected.map(batch=>result.batches.find(saved=>saved.taskId===batch.taskId&&saved.batchIndex===batch.batchIndex)!);
    result.runs = result.batches.map(batch=>result.runs.find(run=>run.selection.session_id===batch.sessionId&&run.selection.run_id===batch.runId)!);
    for (const topic of result.topics) topic.entries = topic.entries.filter(entry=>result.runs.some(run=>
      run.selection.session_id===entry.sessionId&&run.selection.run_id===entry.runId));
    result.topics = result.topics.filter(topic=>topic.entries.length>0);
    if (scenario.current.long) {
      for (const run of result.runs) {
        const source = run.sources[0];
        source.context.text += "\n  Synthetic qualifier: not an accepted fact.\n" + "syntheticunbrokencontext".repeat(80);
        source.slice.end = source.context.selection.end = new TextEncoder().encode(source.context.text).length;
        for (const topic of result.topics) for (const entry of topic.entries)
          if (entry.runId === run.selection.run_id) entry.selectedText = source.context.text;
      }
    }
    if (scenario.current.zero) {
      const empty = result.runs.find(run=>run.selection.run_id===data.response.runs[1].selection.run_id);
      if (empty) {
        empty.suggestions = 0;
        for (const source of empty.sources) source.suggestion_indices = [];
        result.topics = result.topics.filter(topic => topic.entries.every(entry => entry.runId !== empty.selection.run_id));
      }
    }
    if (command === "history_brief") {
      if (args.comparisonCommitId !== result.base.commitId || args.maxBytes !== 131072) throw Error("Synthetic brief binding mismatch");
      const fence = String.fromCharCode(96).repeat(3);
      const markdown = "# 合成来源导航\n\n仅为虚构选定批次的本地导航，不是生成摘要或正式记忆。未引用片段不证明不重要；原文限定语保持为数据。\n\n"
        + fence + "json\n" + JSON.stringify({ coverage: result.runs, topics: result.topics }, null, 2) + "\n" + fence;
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(markdown));
      const contentHash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
      return { base: result.base, batches: result.batches, contentHash, markdown, maxBytes: args.maxBytes };
    }
    return result;
  }, [data]);
  return <div className="mem-stack">
    <header className="mem-card"><h1 style={{ margin: 0, fontSize: 22 }}>跨时间比较 · 仅合成评审预览</h1>
      <p>两份虚构保存批次，全部数据和操作只在此页内存。未知时间、模型证据与人工修订保持显式；没有原生 IPC、个人历史、Provider 或正式产品入口。</p>
      <p className="mem-muted">展开任务并勾选批次，再明确读取比较。主题筛选、缺口查看和来源定位只使用已有观察，不自动获取资料。</p>
    </header>
    <fieldset className="mem-card"><legend>开发夹具控制</legend>
      <label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> 显示比较详情；取消会卸载旧观察</label>
      <label><input type="checkbox" checked={scenario.current.refused} onChange={e=>{scenario.current.refused=e.target.checked;render(n=>n+1);}}/> 模拟来源读取拒绝；再读取时生效</label>
      <label><input type="checkbox" checked={scenario.current.long} onChange={e=>{scenario.current.long=e.target.checked;render(n=>n+1);}}/> 长行及限定语；再读取时生效</label>
      <label><input type="checkbox" checked={scenario.current.zero} onChange={e=>{scenario.current.zero=e.target.checked;render(n=>n+1);}}/> 模拟第二份已保存响应没有建议；再读取时生效</label>
      <p className="mem-muted">合成只读请求：{scenario.current.calls} 次；挂载、切换和重置均不自动读取。</p>
      <button type="button" className="mem-button" onClick={()=>setGeneration(n=>n+1)}>重置观察</button>
    </fieldset>
    <HistoryComparisonSelection key={generation} vaultId="synthetic-vault" tasks={[data.task]} enabled={enabled} request={request}/>
  </div>;
}
createRoot(document.getElementById("preview")!).render(<Preview/>);
