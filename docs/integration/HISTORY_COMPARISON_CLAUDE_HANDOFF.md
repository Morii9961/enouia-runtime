# 跨时间比较：Claude 最小入口适配

Memory draft #49 固定 commit `20cbb2f60c2694e5d7385fce0effb3b5a47f002b`，
56 个 Workspace 命令，aggregate
`9afc5e9960d438c824d785c6091637041485dd8d89e852dbb607b7b243cfa7f3`。
本片在历史结果 #94 上继续；保留 embedded adapter，不切 Host。
Memory PR 未合并，pin 记录明确标为 draft，不能宣称正式合并采用。

## 文件级整合

新增独立 `apps/desktop/src/memory/HistoryComparisonPanel.tsx` 和
`historyComparison.ts`。App.tsx、main.tsx、产品路由、CSS、HistoryTaskPanel
均未改。Claude 在自己的任务详情中提供明确的批次选择，再挂载：

```tsx
<HistoryComparisonPanel
  vaultId={vaultId}
  choices={selectedBatches.map(({ task, batchIndex }) => ({ task, batchIndex }))}
  enabled={currentVaultOpen && currentMemorySurfaceActive}
/>
```

task 必须来自当前 Vault 的新观察，并保留完整原始 task 元数据；
batchIndex 必须是已存在的已选批次。1–32 个不同任务/批次，必须有已保存
完成的响应；不自动创建/恢复/发请求以补足比较。不要从时间推断当前真值。
选择、任务观察、Vault 或生命周期变化会撤回旧视图；页面隐藏、锁定、切换
Vault、退出时须 enabled=false 或卸载。相同元数据的对象副本不会重读。

组件只在用户点击 Read comparison 后发 `history_compare`，只有原始
taskId/batchIndex 参数及 null key。没有应用、批准、替代或 Provider 控制。
读取失败撤下旧来源文字，用户须明确重新读取。迟到回执不重建旧观察。
这张快照不代表后端持续健康，外部修改后须重新读取。

原提议内容/details 与当前候选内容/details/status 分开展示；未知时间、
非用户证据和日期/分支提示不升级为事实。完整 source coverage 包括未引用
的选定片段，保持限定语与换行。不得用摘要或 captured time 替换原文/未知时间。
既有 mem-history-request/mem-content 负责长文本，不替换壳或新增样式。

## 本地合成预览

有既有开发依赖时，从 apps/desktop 启动：
```text
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 1438 --strictPort
```
打开 http://127.0.0.1:1438/e2e/history-comparison-preview.html 。
只在页内传入假 request，不进入产品路由，不用原生/个人数据。
可检查未知时间、人工修订、来源拒绝、长行限定语和卸载。

## 可复制启动说明

```text
继续整合 Runtime 的跨时间比较。先读 HISTORY_COMPARISON_CLAUDE_HANDOFF.md
和 validation/History-comparison-v1.md，按文档采用固定 Memory draft #49。
保留你的 redesign/*、壳、路由与样式；在原有任务详情提供明确批次选择，
挂载独立 HistoryComparisonPanel。仅选择当前 Vault 的原始已保存任务/批次，
将生命周期/页面活动状态接到 enabled。只读比较不自动创建、发送、应用、
批准或替代；保持原提议、当前候选人工修订、未知时间和来源限定语分离。
不安装、不访问个人 Vault/日志/凭据、不发 Provider 请求、不切 Host。
保留原生窗口、物理交互、真实资料/模型质量与主人验收尚未完成的边界。
```
