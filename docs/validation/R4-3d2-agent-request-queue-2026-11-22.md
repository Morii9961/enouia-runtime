# R4.3 门槛 D 第二半：Agent 请求队列（2026-11-22）

按 [ADR-042](../adr/042-registered-entry-agent-request-queue.md) 在 Settings 显示 Agent 保存的纠正请求与遗忘请求，由 Morii 复审后按已有的计划 / 确认 / 提交写入。pin 升至 Memory main `37fe34e2bc23f4f38207bd838ba49a9259c1cd65`：含 [#136](https://github.com/Morii9961/enouia-memory/pull/136)（ADR-MEM-161，合并 `6b377eb`，审阅 head `f880491`）、[#137](https://github.com/Morii9961/enouia-memory/pull/137)（ADR-MEM-162，合并 `3ee0c71`）、[#138](https://github.com/Morii9961/enouia-memory/pull/138)（ADR-MEM-163 许可原地续期，适配器不用改）；aggregate `be7b5df3…`，61 命令。

## 改动

- 适配器：`agent_requests`（`NativeMemoryOwner::agent_requests(上限)`，附本机 Agent 名与本机跳过标记，只读）、`agent_request_ignore`（写本机 `ignored-agent-requests.json`，不写库，effect `local_write`，不重放）。
- Settings“Agent 请求”：待处理 / 已跳过 / 已处理计数；每条显示引用的原话与 Agent 的提议（标明未经核实）；“查看…”只打开那一种改动（纠正预填 Agent 文本、可改；或遗忘），再经预览、确认写入；“跳过”可放回队列。
- 纠正面板 `CorrectionPanel` 增加可选的 `start`（预填一种改动）与 `onDone`（确认写入后回调）。
- “关联”视图显示 Memory ADR-MEM-162 的共同词语建议边（`lexical_neighbor`）：按得分列出、附共同词语，并说明只是建议、不是记录下的关系或语义关系；选中记录时右侧也列出。

## 验证

被测 `--no-bundle` 程序 SHA-256 `bd4903d372cd2431680c8abb3eee6cb47e76659e3ce63e437cb47810674a28f0`，源码 main `7759f33` 加本分支。

| 检查 | 结果 |
| --- | --- |
| `cargo test --locked`，新增 `agent_requests_queue_names_ignores_locally_and_resolves_through_owner_actions`（经 connector 捕获两轮 → 登记 Claude Code → 按授权提交纠正与遗忘请求 → 队列显示名称与待处理 → 跳过只写本机文件、库不变 → 计划并确认遗忘后该请求 `pending: false`） | 69 + 9 通过，2 + 1 忽略 |
| clippy、fmt、tsc、i18n 与 CJK 字形子集、`check-memory-integration --memory-checkout <37fe34e>` | 通过 |
| DOM 夹具全量（新增 `agent-requests` 6 项；`registered-views` 加共同词语建议 1 项）；`npm` 单元测试 | 全部通过；151/151 |
| 原生 `--catalog-only` | **42/42** |
| 原生 `--owner-readonly-only` | 第一次 33/34：Settings 里“登记…”在两个面板同时加载时仍禁用，等待超时；smoke 改为等“未登记”和“Agent 请求”都出现后再点，之后两次 **38/38** |
| 真实库只读原生探针（debug 与 release） | 351 条、399 段对话；CURRENT 前后均为 440 |

## 已知问题

- 共同词语近邻计算使 graph 投影变慢：真实库 node_limit 100 时，release 2,915 ms、debug 24,070 ms（升级前 debug 43 ms），首块 0 边（升级前首块同样 0 边）。界面一次选取全部记录，会更慢。已交 Memory 优化；打候选前需换上优化后的 pin。

## 边界

- Claude Code / Codex 真正连上（管道托管，D1b）不在本片：接口由 Memory ADR-MEM-165（授权支撑的连接不再受 5 分钟限制，桥接可不带 `--host-pid`）和 ADR-MEM-166（合并协议，待做）提供，下一片接入。
- 真实库上的第一次请求处理由 Morii 验收时确认（验收指南第 16 步）。
