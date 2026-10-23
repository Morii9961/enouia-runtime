// Development-only synthetic component preview. No native IPC/Provider connection.
import { useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { HistoryComparisonPanel } from "../src/memory/HistoryComparisonPanel";
import { CallError, type J } from "../src/memory/client";
import { historyComparisonFixture } from "../tests/history-comparison-fixture";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

function Preview() {
  const [data] = useState(historyComparisonFixture);
  const [enabled, setEnabled] = useState(true), [generation, setGeneration] = useState(0), [, render] = useState(0);
  const scenario = useRef({ refused: false, long: false, calls: 0 });
  const request = useCallback(async (command: string, args: Record<string, unknown> = {}): Promise<J> => {
    if (command !== "history_compare" || JSON.stringify(args.batches) !== JSON.stringify(
      data.response.batches.map(({taskId,batchIndex})=>({taskId,batchIndex})))) throw Error("Synthetic selection mismatch");
    scenario.current.calls++; render(n => n + 1);
    await new Promise(resolve => setTimeout(resolve, 180));
    if (scenario.current.refused) throw new CallError({ code: "permission_denied", retryable: false, rules: ["history.source_read"] });
    const result = structuredClone(data.response);
    if (scenario.current.long) {
      for (const [i, run] of result.runs.entries()) {
        const source = run.sources[0];
        source.context.text += "\n  Synthetic qualifier: not an accepted fact.\n" + "syntheticunbrokencontext".repeat(80);
        source.slice.end = source.context.selection.end = new TextEncoder().encode(source.context.text).length;
        result.topics[0].entries[i].selectedText = source.context.text;
      }
    }
    return result;
  }, [data]);
  return <div className="mem-stack">
    <header className="mem-card"><h1 style={{ margin: 0, fontSize: 22 }}>跨时间比较 · 仅合成评审预览</h1>
      <p>两份虚构保存批次，全部数据和操作只在此页内存。未知时间、模型证据与人工修订保持显式；没有原生 IPC、个人历史、Provider 或正式产品入口。</p>
    </header>
    <fieldset className="mem-card"><legend>开发夹具控制</legend>
      <label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> 显示比较详情；取消会卸载旧观察</label>
      <label><input type="checkbox" checked={scenario.current.refused} onChange={e=>{scenario.current.refused=e.target.checked;render(n=>n+1);}}/> 模拟来源读取拒绝；再读取时生效</label>
      <label><input type="checkbox" checked={scenario.current.long} onChange={e=>{scenario.current.long=e.target.checked;render(n=>n+1);}}/> 长行及限定语；再读取时生效</label>
      <p className="mem-muted">合成只读请求：{scenario.current.calls} 次；挂载、切换和重置均不自动读取。</p>
      <button type="button" className="mem-button" onClick={()=>setGeneration(n=>n+1)}>重置观察</button>
    </fieldset>
    <HistoryComparisonPanel key={generation} vaultId="synthetic-vault" choices={data.choices} enabled={enabled} request={request}/>
  </div>;
}
createRoot(document.getElementById("preview")!).render(<Preview/>);
