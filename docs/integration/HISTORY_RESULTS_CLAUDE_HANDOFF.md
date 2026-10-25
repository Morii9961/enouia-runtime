# 历史结果：Claude 最小页面接入

2026-10-23，Asia/Shanghai。交付状态：**原生消费者、恢复状态模型和独立面板完成，产品入口待整合**。这是 Runtime 独立工作片的页面契约；未向其他会话发送消息，也不替 Claude 宣告 UI 完成。

## 固定版本与文件归属

Runtime 从 main `e1e7e922b288c13dbc483c4089e7da146b7596b4` 开始，分支 `codex/history-batch-results`。Memory 固定 [#40 合入提交 9d68d3d8707749ad3b0e2a36cfc97d71a27e712f](https://github.com/Morii9961/enouia-memory/commit/9d68d3d8707749ad3b0e2a36cfc97d71a27e712f)，55 commands，surface aggregate `c88a12cce61b9601dffea3795a72decfe7de53082c0b4a10548947c993bd31e8`。它保持 embedded，不采用后续 Host。

| 文件 | 本片提供 / Claude 接入位置 |
| --- | --- |
| apps/desktop/src/memory/HistoryResultPanel.tsx | 可直接挂载的独立结果面板；使用现有 mem-* 控件类，无壳、路由或 CSS 修改。 |
| apps/desktop/src/memory/historyResults.ts | 生产消费者、观察校验、稳定应用键和恢复 owner，均已验证。 |
| apps/desktop/src/memory/client.ts | history_batch_apply 已进入写集合；preview 为无 key 只读调用。使用现有 memory_call，无新增 Tauri 命令/权限。 |
| apps/desktop/src-tauri/src/memory.rs | 生命周期和窗口范围继续采用固定 Core command catalog；新 apply 走共享写 gate，preview 为 read。 |
| apps/desktop/src/memory/HistoryTaskPanel.tsx 及 Claude 重构后的对应任务详情 | 在已观察的原 task / 原 batch 位置接独立结果面板。此文件本片未改；如何放置、导航、样式由 Claude 决定。 |
| apps/desktop/src/App.tsx、main.tsx、现有壳与样式 | 本片没有修改。不要用此分支旧壳覆盖 redesign 成果；所有 redesign/* 分支/worktree 保留。 |

## 正式 IPC 形状

来源为固定提交的 [ADR-MEM-72](https://github.com/Morii9961/enouia-memory/blob/9d68d3d8707749ad3b0e2a36cfc97d71a27e712f/docs/adr/072-history-batch-response-application.md)、[Workspace contract](https://github.com/Morii9961/enouia-memory/blob/9d68d3d8707749ad3b0e2a36cfc97d71a27e712f/crates/enouia-memory-contract/src/workspace.rs) 和 [native consumer](https://github.com/Morii9961/enouia-memory/blob/9d68d3d8707749ad3b0e2a36cfc97d71a27e712f/crates/enouia-memory-workspace/src/native.rs)。

- `history_batch_preview({ taskId, batchIndex })` → `extraction_preview`：taskId / batchIndex / sessionId / runId / dispatchId / responseHash / job / items。
- `extraction_pause({ sessionId, runId, paused }, key)` → `extraction_job`：只有 job；原 child/run 由已验证的 task/batch 观察导出，不从编辑框输入。它只改本地状态，不推进 cursor 或发请求。
- `history_batch_apply({ taskId, batchIndex, responseHash, cursor }, key)` → `extraction_job`：原 task/batch/session/run、responseHash、job。
- 外层字段为 camelCase；job 是保存的 ExtractionJob，字段为 snake_case，如 `input_event_id`、`max_candidates`。cursor 为 0–32，不能把 job 的位置换成数组索引或另一个 batch。
- Core 从 durable admission 派生 child/run/input；页面不传 session/run、policy、model 或 source 来指定应用目标。结果处理不需要配置 Provider，不调用 prepare/send。

## 可直接挂载的独立面板

```tsx
import { HistoryResultPanel } from "./memory/HistoryResultPanel";
// 放在原 task/batch 详情；index 是原 batchIndex，不是 items 的位置。
<HistoryResultPanel vaultId={vaultId} task={observedSavedTask}
  index={originalBatchIndex} enabled={memoryUsable && !vaultChanging && !exiting} />
```

面板挂载不发 IPC。只有按钮明确读取保存响应，再由本份预览的勾选确认提交一步；成功和未知后均不自动刷新或推进。它提供源与完整上下文、speaker/evidence、未知 occurredAt、原提议/当前候选、空响应、暂停/完成状态、本地暂停/恢复以及原请求恢复。错误不会退回展示上次正文。读取后将自有焦点移到预览标题，用户移到外部控件时不抢回。

完整 task 观察的可序列化字段、Vault 或原 batch 改变会重挂内部 owner，撤销旧观察。传入内容相同的新对象副本不会重置本次核对。锁定、Exit、失去可用状态或切换 Vault 时，外层必须卸载或令 enabled=false；不要仅用 CSS 隐藏面板。现有生命周期 gate 仍需使用，不由结果面板替代。面板按 Vault 复用进程内恢复 owner，同一 Vault 同时只挂一个结果详情。

本片没有修改 HistoryTaskPanel、App.tsx、main.tsx 或共享样式。Claude 只需在现有原任务详情中选择/挂载；可直接复用组件，也可在自己的 UI 中按下列 owner 契约重排。两种方案都不得批量自动消费结果或转成记忆批准。

## Owner 的最小使用方式

```ts
import { historyResultOwner } from "./historyResults";

const owner = historyResultOwner(vaultId);
// 仅在实际观察/选择变化时调用，不在每次 render 重绑。
owner.select(observedSavedTask, originalBatchIndex);
await owner.preview(); // 由用户点击“检查保存结果”触发
const shown = owner.snapshot.preview;
// 展示原 proposal、quote、完整 selectedText、来源与当前 candidate 状态。
// 用户核对这一位置后，单独确认本次一步：
await owner.apply(shown, checked === true);
// 不从回执自动推进。下一步必须再次明确 preview、核对并确认。
```

`shown` 必须是用户核对并确认时实际展示的那份不可变预览引用；不要在旧回调中临时取最新 snapshot 替换。apply / recover 都核对引用身份。每次重新 preview、切换或重绑都会撤销旧确认，即使响应 hash 和 cursor 相同。页面同步清空勾选状态。

owner 没有 React 订阅机制。页面用自己的局部状态在显式动作开始/结束时读取 snapshot，并用既有 mounted/selection/lifecycle 防护发布 UI；不能在订阅或 effect 中循环调用 apply。构造、select 和取得 snapshot 均不发 IPC。

| snapshot.phase | 页面责任 |
| --- | --- |
| unobserved | 不展示已确认的结果或空列表；先读取原 task，再明确预览。 |
| reading / applying | 禁用重复动作；只保留本次选定身份，不承诺同步写可取消或回滚。 |
| inspected | 展示这次预览。ready 才提供单步候选应用；paused 只提供明确的本地恢复，completed 不再写。 |
| recovery_required | 保留 pending.args 与 pending.key。acknowledged=true 仅表示已收到匹配回执；仍须重读。false 是未知或未确认结果，不能表示失败后未写入。 |

owner 在进程内按 Vault 保留未确认的精确参数/键。任务/批次切换、Vault 切换或锁定、观察到 Exit、卸载结果面板时调用 `owner.invalidate()`，立即撤销预览及确认。原来已经提交的写可能完成；晚回执不会恢复旧页面权限。回到同一 Vault、重新观察同一原 task/batch 后可重绑 owner 并 preview；不新建任务或重新 prepare。

## 明确恢复与重新开始后的边界

- 未知回执后先 `await owner.preview()`。同一响应的 cursor 已前进（或空响应已 completed）时，owner 只认定当前进度已被观察，不把它归因于本次请求或宣称候选已发布。
- 若同一 cursor 仍 ready，pending 保留，调用 `owner.recover(shown, true)` 才重发原 args/key。该动作需要再次明确确认；没有自动重试。
- 完整进程重启不从 WebView storage 恢复正文、引文、预览或确认。重新读取 task 与响应；同一未推进 hash/cursor 会确定性生成同一 key。若显式保有原参数，可 `owner.recover(shown, true, originalArgs)` 恢复旧步骤；即使 Core 已前进，旧 cursor 的重放也不会消费下一项。
- hash 不匹配、未来 cursor、来源读取拒绝、删除、锁定或暂停均不能转成成功/空结果。不清除未知写身份后换新键，不自动跳到下一 cursor。
- 已完成回执后 snapshot.preview 被撤回；必须重新检查才能选择下一步。没有循环遍历 batch 或全部 suggestions 的 API。

## 本地暂停与恢复

独立面板已提供“Pause / Resume local result processing”，均需核对本次保存预览后单独确认。若自己重排 UI，调用 `owner.setPaused(shown, true, checked)` 暂停，或 `owner.setPaused(shown, false, checked)` 恢复。owner 从原 task/batch 的不可变观察生成 sessionId/runId；不传响应正文、来源、Provider 或另一 child 身份。

`setPaused` 成功或未知后均撤回预览，要求再明确读取。snapshot.pausePending 仅保留原 args、responseHash、key、acknowledged；导航/锁定仍保留元数据，正文和确认立即失效。新的同响应观察会清除此控制等待状态，只说明当前状态已被观察，不归因哪个请求提交。暂停控制不同于逐候选应用：不提供自动重放或“同键回执证明”，也不把旧控制重用于后来的暂停/恢复决定；每个重新核对后的明确状态决定用新 key。

本地控制不会替换 snapshot.pending 中未知候选应用的原 hash/cursor/key。若其他客户端已把 job 暂停，可以明确恢复本地状态、再重读，之后仍以 recover 恢复原候选步骤。暂停/恢复不是发送取消、Provider 中断、Canonical 批准或批量入队。完成状态不能暂停或恢复。hash 改变或回执身份不匹配时不解除等待，需要重新调查保存状态。

## 展示与验收

逐条区分 items[].content（原提议）和 items[].candidate.content（当前候选内容），保留 quote、完整 selectedText 及附近限定语。speakerRole/evidenceClass 可为 unknown，不提升证据级别。候选可能已有 accepted/rejected/merged/withdrawn 状态；不要把原模型提议当当前 Canonical。新发布只进入 pending，审核批准仍走独立流程。空响应可在 cursor 0 完成本地 job，不产生候选。

接入后验证实际改动的小段交互：未观察/错误态、原批次选择、精确引文、单步确认、晚回执、切页/锁定、未知结果重读/同键恢复及下一步重新确认。既有 Core/consumer/pin 证据见 [本片验证](../validation/History-batch-results-v1.md)，不默认跑全部 Activity、性能、安装或真实资料。

可复制给 Claude 的启动文字：

```text
请在你现有的 Runtime redesign 分支接入“保存历史批次结果检查与单步候选入队”页面。
先读 docs/integration/HISTORY_RESULTS_CLAUDE_HANDOFF.md 和 docs/validation/History-batch-results-v1.md，
复用 codex/history-batch-results 的固定 55 命令消费者与 HistoryResultPanel / HistoryResultOwner。
按原 task/batch 展示保存响应、quote/完整 selectedText 和当前 candidate；
每一步都重新观察、核对并确认；未知回执保留原 hash/cursor/key，仅明确恢复同一请求。
保护现有壳和所有 redesign 工作，不从功能分支整文件覆盖 App.tsx/main.tsx。
结果处理不需要 Provider 配置，不发送、不访问个人资料、不批准 Canonical；
本任务不采用 Host、不安装部署，也不自行合并 PR。
```

## 合成浏览器评审入口

已有开发依赖时，从 apps/desktop 运行：

```text
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 1437 --strictPort
```

打开 http://127.0.0.1:1437/e2e/history-results-preview.html 。此独立页不调用原生 IPC，全为明确标注的虚构数据；可检查单步、暂停/恢复、未知回执重读、来源拒绝、候选已修订、长上下文和卸载行为。它不替代 Claude 页面整合或真实资料验收，也不进入产品路由。生产组件复用既有 mem-history-request / mem-content，保留长文本断行、换行和缩进；不带新的壳或 CSS。
