# R4.3 门槛 D 第一半：本机 Agent 授权（2026-11-22）

按 [ADR-041](../adr/041-registered-entry-agent-grants.md) 在 Settings 管理 Claude Code 与 Codex 的持久读取授权。pin 升至 Memory `81c88fca03f4a1e7cca3a582653de7f28040c027`（[#135](https://github.com/Morii9961/enouia-memory/pull/135)，ADR-MEM-160，审阅 head `cd3b91b8cc5d6195d3ee0734ca1bf6817ad173f4`，含 #134 / ADR-MEM-159；aggregate `3fce2ac5…`，61 命令）。

## 改动

- 适配器：`agent_status`（`owner_read_status`）、`agent_plan`（按登记 / 续期 / 更新来源范围 / 撤销构造新修订并 `plan_owner_read_grant`，不写入；计划留在原生内存，页面只拿一次性 plan id）、`agent_commit`（确认点击后 `commit_owner_read_grant`，登记成功才写本机名称文件）。
- 本机文件 `registered-agents.json`（Runtime 配置目录）：库 id → Agent → principal id、grant id；不进库。
- Settings“本机 Agent”：状态、计划摘要、确认 / 取消；如实写明 MCP 连接暂不能接通。
- 授权内容：`policy_refs` 全量 + 这些策略的来源（排除采集窗口中尚未捕获的预留编号），上限 Private，90 天，`allow_requests`。

## 验证

被测 `--no-bundle` 程序 SHA-256 `3df0166455a183738196b714e243e700a7f08409539c324670e5290850964935`，源码 main `90ddd75` 加本分支。

| 检查 | 结果 |
| --- | --- |
| `cargo test --locked`，新增 `agent_grants_plan_then_commit_and_keep_names_local`（计划不写入、计划只能提交一次、登记 / 续期 / 更新来源 / 撤销的修订号与状态、名称只在本机文件、未登记的 Agent 不能撤销） | 68 + 9 通过，2 + 1 忽略 |
| clippy、fmt、tsc、i18n 与 CJK 字形子集、`check-memory-integration --memory-checkout <81c88fc>` | 通过 |
| DOM 夹具全量（新增 `registered-agents` 4 项）；`npm` 单元测试 | 126 个夹具、2,590 项全部通过；151/151 |
| 原生 `--owner-readonly-only`（末尾经 Settings 登记 Claude Code：确认后 CURRENT 变化） | **38/38** |
| 原生 `--catalog-only` | **42/42** |
| 真实库只读原生探针（新 home） | 351 条；CURRENT 前后均为 440 |

## 边界

- 管道托管（Claude Code / Codex 真正连上）等 Memory #136（`Pipe::client_pid()`）合并后接；D2 确认队列同在 #136。
- 真实库上的第一次登记由 Morii 验收时确认（验收指南第 15 步）。
