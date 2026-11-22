# R4.3 门槛 D 第二半：Agent 请求队列（2026-11-22）

按 [ADR-042](../adr/042-registered-entry-agent-request-queue.md) 在 Settings 显示 Agent 保存的纠正请求与遗忘请求，由 Morii 复审后按已有的计划 / 确认 / 提交写入。pin 升至 Memory `6b377eb13de380312f3fdc6ff37e9e2bbc22e778`（[#136](https://github.com/Morii9961/enouia-memory/pull/136)，ADR-MEM-161，审阅 head `f880491f3a9f51ab322f4cd904349c4cf4d00a53`；aggregate `6c9b2416…`，61 命令）。

## 改动

- 适配器：`agent_requests`（`NativeMemoryOwner::agent_requests(上限)`，附本机 Agent 名与本机跳过标记，只读）、`agent_request_ignore`（写本机 `ignored-agent-requests.json`，不写库，effect `local_write`，不重放）。
- Settings“Agent 请求”：待处理 / 已跳过 / 已处理计数；每条显示引用的原话与 Agent 的提议（标明未经核实）；“查看…”只打开那一种改动（纠正预填 Agent 文本、可改；或遗忘），再经预览、确认写入；“跳过”可放回队列。
- 纠正面板 `CorrectionPanel` 增加可选的 `start`（预填一种改动）与 `onDone`（确认写入后回调）。
- “关联”视图预先支持 Memory ADR-MEM-162 的共同词语建议边（`lexical_neighbor`）：按得分列出、附共同词语，并说明只是建议。该边类型随 #137 合并后的 pin 出现；本 pin 下真实库不会有这类边。

## 验证

RESULTS_PENDING

## 边界

- Claude Code / Codex 真正连上（管道托管，D1b）尚未实现：等 Memory 回答 Enrollment 5 分钟期限与静态 MCP 配置里的宿主 PID 两个接口问题，并等 #138（许可原地续期）合并。
- 真实库上的第一次请求处理由 Morii 验收时确认（验收指南第 16 步）。
