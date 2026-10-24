// Manual dev-only fixture. All requests stay in this synthetic browser memory.
// It is not imported by the product entry and never uses native IPC ports.
import { useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { HistoryResultPanel } from "../src/memory/HistoryResultPanel";
import { CallError, type J } from "../src/memory/client";
import { historyTask } from "../tests/history-task-fixture";
import { historyResult } from "../tests/history-results-fixture";
import "../src/quiet-runtime.css";
import "../src/memory/memory.css";

function SyntheticSession({ generation }: { generation: number }) {
  const db = useRef({ cursor: 0, paused: false, readable: true, lose: false, edited: false, longLine: false,
    writes: new Map<string, string>(), commands: [] as string[] });
  const [enabled, setEnabled] = useState(true), [, render] = useState(0);
  const task = historyTask(), vaultId = `synthetic-preview-only-${generation}`;
  task.identity.vaultId = vaultId;
  const request = useCallback(async (command: string, args: Record<string, unknown> = {}, key?: string): Promise<J> => {
    const saved = db.current;
    saved.commands.push(command);
    await new Promise(resolve => setTimeout(resolve, 180));
    if (!saved.readable) throw new CallError({ code: "permission_denied", retryable: false, rules: ["history.source_read"] });
    if (command === "history_batch_preview") {
      if (args.taskId !== "synthetic-history-task" || args.batchIndex !== 1) throw new Error("Synthetic identity mismatch");
    } else if (command === "history_batch_apply") {
      if (saved.paused) throw new CallError({ code: "cancelled", retryable: false, rules: ["history.batch_paused"] });
      if (args.taskId !== "synthetic-history-task" || args.batchIndex !== 1 || args.responseHash !== "d".repeat(64)
        || !Number.isSafeInteger(args.cursor) || Number(args.cursor) > saved.cursor) throw new Error("Synthetic stale response");
      const identity = JSON.stringify([command, args]);
      if (!key || saved.writes.has(key) && saved.writes.get(key) !== identity) throw new Error("Synthetic key mismatch");
      if (!saved.writes.has(key) && Number(args.cursor) === saved.cursor && saved.cursor < 2) saved.cursor++;
      saved.writes.set(key, identity);
    } else if (command === "extraction_pause") {
      if (args.sessionId !== "synthetic-child-1" || args.runId !== "synthetic-run-1" || typeof args.paused !== "boolean" || saved.cursor === 2) throw new Error("Synthetic invalid control");
      saved.paused = args.paused;
    } else throw new Error("This preview has no native, Provider or other command port");
    render(n => n + 1);
    if (command !== "history_batch_preview" && saved.lose) { saved.lose = false; throw new Error("Synthetic receipt lost after local commit; inspect saved results"); }
    const result = historyResult(saved.cursor, saved.cursor === 2 ? "completed" : saved.paused ? "paused" : "ready");
    if (saved.longLine) {
      for (const item of result.items) item.selectedText += "\n  Synthetic qualifier: not a verified fact.\n" + "syntheticunbrokencontext".repeat(120);
      result.job.sources[0].end = new TextEncoder().encode(result.items[0].selectedText).length;
    }
    if (saved.edited) for (const item of result.items) if (item.candidate) item.candidate.content = "Synthetic reviewed wording; the original proposal remains separate.";
    if (command === "history_batch_preview") return result;
    if (command === "extraction_pause") return { job: result.job };
    const { items, dispatchId, ...receipt } = result; void items; void dispatchId;
    return receipt;
  }, []);
  const saved = db.current;
  return <div className="mem-stack">
    <fieldset className="mem-card"><legend>合成场景控制（开发夹具）</legend>
      <label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> 显示结果详情；取消显示会撤销本次预览与确认</label>
      <label><input type="checkbox" checked={saved.lose} onChange={e => { saved.lose = e.target.checked; render(n => n + 1); }} /> 下次本地写入已完成后丢失回执</label>
      <label><input type="checkbox" checked={!saved.readable} onChange={e => { saved.readable = !e.target.checked; render(n => n + 1); }} /> 模拟来源访问拒绝；再读取时生效</label>
      <label><input type="checkbox" checked={saved.edited} onChange={e => { saved.edited = e.target.checked; render(n => n + 1); }} /> 模拟候选内容已修订；再读取时显示</label>
      <label><input type="checkbox" checked={saved.longLine} onChange={e => { saved.longLine = e.target.checked; render(n => n + 1); }} /> 长行上下文布局场景；再读取时显示</label>
      <p className="mem-muted">虚构存储进度：{saved.cursor} / 2；仅当前页内存，刷新即重置。没有采集、凭据、网络或原生连接。</p>
    </fieldset>
    <HistoryResultPanel vaultId={vaultId} task={task} index={1} enabled={enabled} request={request} />
    <details className="mem-muted"><summary>仅合成命令记录（{saved.commands.length}）</summary><ol>{saved.commands.map((command, i) => <li key={i}>{command}</li>)}</ol></details>
  </div>;
}
function Preview() {
  const [generation, setGeneration] = useState(0);
  return <div className="mem-stack">
    <header className="mem-card"><h1 style={{ margin: 0, fontSize: 22 }}>历史结果面板 · 虚构交互预览</h1>
      <p>此页只供 Morii / Claude 评审独立组件。全部任务、引文、候选和操作均为合成数据，不代表原生窗口、个人历史或正式产品入口已验收。</p>
      <p className="mem-muted">先点 Inspect，再勾选并选择单步入队或本地暂停／恢复。每次操作后重新读取；模拟丢回执时也先读取已保存进度。</p>
      <div><button type="button" className="mem-button" onClick={() => setGeneration(n => n + 1)}>重置合成场景</button></div>
    </header>
    <SyntheticSession key={generation} generation={generation} />
  </div>;
}
createRoot(document.getElementById("preview")!).render(<Preview />);
