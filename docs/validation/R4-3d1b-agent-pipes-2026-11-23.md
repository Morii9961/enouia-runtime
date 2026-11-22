# R4.3 门槛 D：Agent 管道接入（D1b，2026-11-23）

按 [ADR-043](../adr/043-registered-entry-agent-pipes.md) 让已登记的 Claude Code / Codex 通过本机 MCP 管道读取库并提交备注、纠正请求和遗忘请求。pin 升至 Memory main `29cbe8d4ceb41af46aea17520e80ba24309fa44e`（[#142](https://github.com/Morii9961/enouia-memory/pull/142)，ADR-MEM-166 合并协议、桥接库函数、停止信号，审阅 head `d77cac9`；aggregate `0331a672…`，61 命令）。

## 改动

- `memory_pipes.rs`：每个本机登记的 Agent 一个固定名管道（vault、principal、协议的 SHA-256），连接时取客户端 PID 登记 Enrollment（`memory:read`、`source:read`），按该 Agent 的有效授权建 reader 与备注 / 纠正 / 遗忘三个 writer，调用 `mcp::agent::native::serve_connection`；连接结束后重建管道实例。
- 锁定、退出、授权变更时置停止标志，监听线程在一个 250 ms 切片内退出并释放 vault 与许可；授权变更后按当前 Agent 重启监听。
- 新 bin `enouia-memory-mcp`（调用 Memory 的 `mcp::bridge::run`），与桌面程序同 pin 构建；`Cargo.toml` 设 `default-run = "enouia-desktop"`。
- Settings“本机 Agent”：已登记的 Agent 显示 Claude Code 命令与 Codex `config.toml` 配置（桥接路径、协议、管道、库 id），桥接缺失时明说；说明每个 Agent 同一时间只能有一条连接。

## 验证

被测 `--no-bundle` 程序与同目录桥接，源码 main `d906d12` 加本分支。

| 检查 | 结果 |
| --- | --- |
| `cargo test --locked`，新增 `registered_agent_connects_over_its_pipe_and_lock_cuts_it`（登记 Claude Code → 用 Memory 客户端经真实命名管道 initialize、tools/list 含三种请求工具 → 锁定后连接中断、管道不再监听） | 71 + 9 通过，2 + 1 忽略 |
| clippy、fmt、tsc、i18n 与 CJK 字形子集（“旁 / 桥 / 终 / 道 / 二 / 隣”不在子集，已改写）、`check-memory-integration --memory-checkout <29cbe8d>` | 通过 |
| DOM 夹具全量（`registered-agents` 新增配置文本 1 项）；`npm` 单元测试 | 全部通过；151/151 |
| 原生 `--owner-readonly-only`：在 Settings 登记 Claude Code 后，用发布版旁的 `enouia-memory-mcp.exe` 按 Settings 给出的参数经 stdio 连接，列出 `memory_search … memory_note, memory_correction_report, memory_forget_request` | **40/40** |
| 原生 `--catalog-only` | **42/42** |
| 真实库只读原生探针（debug） | 351 条、399 段对话；graph 首块 618 ms；同一段对话 698 条、共同词语建议 10 条；CURRENT 前后均为 440 |

## 边界

- 安装包尚未把 `enouia-memory-mcp.exe` 放到安装目录（门槛 G，验收时由 Morii 决定）；候选目录里桥接与程序放在一起。
- 每个 Agent 同一时间一条连接（Memory 以唯一实例创建管道）。
- 真实 Agent 接入以 Morii 在验收中第一次真实登记为前提（验收指南第 15、18 步）。
