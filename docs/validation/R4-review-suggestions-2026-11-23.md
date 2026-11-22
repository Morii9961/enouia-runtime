# R4：回看建议与注意力时间表（2026-11-23）

pin 升至 Memory main `e548993b96bb83219a15cc67eb2d299ed80b1772`：含 [#139](https://github.com/Morii9961/enouia-memory/pull/139)（ADR-MEM-164 注意力时间表与回看建议，合并 `9137b67`）、[#140](https://github.com/Morii9961/enouia-memory/pull/140)（ADR-MEM-165 授权支撑的连接不再受 5 分钟限制、桥接可不带 `--host-pid`，合并 `cd96d1e`）、[#141](https://github.com/Morii9961/enouia-memory/pull/141)（共同词语近邻提速，审阅 head `28bee14`）；aggregate `9ff0a73c…`，61 命令。

## 改动

- 适配器：只读的 `review_suggestions`（`memory_review_suggestions_native`，往后 1–90 天）与 `attention_schedule`（`memory_attention_schedule_native`，窗口 ≤ 366 天，游标分页）。Core 的这两份文档没有读取信封，适配器补上 `schema_version` / `capability` / `effect: native_read`。
- 记忆目录左栏新增“值得回看”：选 7 / 14 / 30 / 90 天，列出快要归档、有效期快要结束的记录（原因、到期日、注意力状态），点开读详情；下方“注意力时间表”列出未来 90 天的淡出 / 归档时刻，说明是按捕获时间与注意力配置推算、不是记录下的，并给出受保护条数。页面明说建议只按时间、不评判记录对错。
- ADR-MEM-165 在管道托管（D1b）前不需要适配器改动。

## 验证

被测 `--no-bundle` 程序 SHA-256 `7c234438ee4ba965e6d1814fa501c9f29a4821f78033ef6613973b8d9266cc4f`，源码 main `dcf9d47` 加本分支。

| 检查 | 结果 |
| --- | --- |
| `cargo test --locked`，新增 `review_suggestions_and_attention_schedule_forward_core_documents`（种类与信封、新记录的时刻都在未来、91 天被 Core 拒绝） | 70 + 9 通过，2 + 1 忽略 |
| clippy、fmt、tsc、i18n 与 CJK 字形子集（“即 / 判”不在子集，改写为“快要 / 不说明”）、`check-memory-integration --memory-checkout <e548993>` | 通过 |
| DOM 夹具全量（`registered-views` 新增 2 项；左栏列表检查加入“值得回看”）；`npm` 单元测试 | 全部通过；151/151 |
| 原生 `--catalog-only` | **42/42** |
| 原生 `--owner-readonly-only` | **38/38** |
| 真实库只读原生探针（release） | graph 首块 100 节点 35 ms（e548993 前 2,915 ms）；全量选取覆盖：同一段对话 698 条、共同词语建议 10 条；回看建议 30 天内 0 条；注意力时间表 90 天内首页 50 个时刻、还有后续，淡出 30 天、归档 180 天、受保护 174 条；CURRENT 前后均为 440 |

## 边界

- Claude Code / Codex 接入（D1b）等 Memory ADR-MEM-166（合并协议 `automation-agent-v1`、`mcp::bridge::run`、带停止信号的 `serve_connection`）。
