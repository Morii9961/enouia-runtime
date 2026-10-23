# 本地主题来源导航：Claude 最小适配

此片叠在 Runtime 比较 #96 上，采用 Memory draft #50 的固定 commit
`08892702d0d0104b2d23240f89d2130c4dc1d323`。57 个 Workspace 命令，
aggregate `a7dc389a9e7073e26bcb17ac644c9949693a24e3ebf358513de58d2e2ecc52e7`。
保持 embedded adapter，不采用 Host、MCP 或云端入口。

如果已经按 HISTORY_COMPARISON_CLAUDE_HANDOFF.md 挂载 HistoryComparisonPanel，
本片不再要求 App.tsx/main.tsx 或壳的修改。比较明确读取成功后出现独立
HistoryBriefPanel；用户再次点击才读取确定性来源导航。外层生命周期 gate
仍须在隐藏/锁定/切 Vault/退出时卸载。重新读取比较会撤下旧回顾。

新文件 historyBrief.ts / HistoryBriefPanel.tsx。
输入只含原始任务/批次、已观察比较 head 和 128 KiB 预算；没有任意主题文字、
路径、Provider 参数或写 key。后端 head 变化时返回陈旧错误，先明确刷新
比较，再决定是否读取回顾，不能替用户自动重试。

回顾是全部所选完成响应的来源导航，不是生成总结、正式记忆或完整性证明。
按精确 UTF-8 hash 和 byte budget 验证后展示，只用 pre 的文字节点，不解析
Markdown/HTML。所有原文、建议、人工修订和限定语保持为数据；没有保存、
复制、导出、外发、应用或批准按钮。异步 hash 后再次检查 selection/lifecycle。

开发合成预览继续使用 1438 的 history-comparison-preview.html。
先 Read comparison，再 Read source navigation brief。不会发 native IPC；
实际原生验证与浏览器夹具证据分别见验证报告。

可复制启动说明：

```text
继续整合 Runtime 本地来源导航。先读 HISTORY_NAVIGATION_CLAUDE_HANDOFF.md
及 validation/History-navigation-brief-v1.md，采用固定 Memory draft #50。
保留 redesign/*、壳、路由与样式。已有 HistoryComparisonPanel 挂载无需重写入口；
确认其生命周期 gate 在隐藏、锁定、切 Vault、退出时卸载。回顾只在比较
成功后由用户再次明确读取，保持精确文本/hash 与原文/当前候选分离。
不要解析导入文字为 Markdown/HTML，不自动保存、复制、导出、发请求或批准。
原生验证若仍待固定源码授权，不把它写成已通过；按报告保留真实验收边界。
```

本地导航补充：比较面板可按明确 projectId/无项目与确切主题键筛选显示；不合并同名主题，不改原始观察，不发送新请求。筛选只影响主题卡片；来源 coverage 和完整回顾保持全部选定响应，重新读取比较时重置筛选。

来源缺口导航补充：面板显示选定响应数、片段出现次数、按 sourceId/revision/start/end 去重的片段数、未引用次数和零建议响应数。可本地查看未引用、零建议、未知时间及非用户证据；不触发 IPC、不替代主题筛选、不把空结果解释为完整性或不重要。所有计数始终针对原始选定范围。

每条提议的 View linked source span 会在已加载覆盖数据中定位原 Session/run、sourceId/revision 和引用序号对应的精确片段，打开对应视图并把键盘焦点移到来源区域。没有新 IPC、来源重读或路径访问；重新读取比较会撤回定位。
