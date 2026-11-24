# R5：队列里标出 ChatGPT 的请求（2026-11-24）

Memory [ADR-MEM-184](https://github.com/Morii9961/enouia-memory)（main `ba09ee7`，#161–#165）让 ChatGPT 通过远程连接器提交纠正请求和遗忘请求，进入 Runtime 现有的 Agent 待确认队列；Morii 确认前不改任何记忆。Morii 选了“做，默认打开”。这批 Memory 改动没有 IPC、wire 或 schema 变化（仍 61 个命令），**pin 不升**，仍为 `ca76892`。

## 改动

- 队列请求的 principal 与 purpose 为 `chatgpt_connector` 的授权（ADR-MEM-175，pin 里已有）的 principal 相同时，署名写“ChatGPT”；本机登记的 Agent 名称优先，其他未知 principal 仍写“未命名 Agent”。审阅、跳过、确认流程不变（[ADR-042 修订](../adr/042-registered-entry-agent-request-queue.md)）。

## 验证

| 检查 | 结果 |
| --- | --- |
| `cargo test --locked`（原生测试新增：写一份 purpose 为连接器的授权，在其下提交纠正请求，队列署名为 ChatGPT）；clippy、fmt；`check-memory-integration --memory-checkout <ca76892>` | 74 通过；通过；通过 |
| tsc；`npm` 单元测试与 DOM 夹具 | 通过 |
| 发布版程序原生 `--owner-readonly-only`（新建的合成登记）/ `--catalog-only` | **41/41** / **42/42** |
| 真实库只读走查 | **未执行**：主库正被已安装的 `839e34d` 实例打开，关闭它需要 Morii 亲手做，见下 |

全量 `cargo test` 并行跑时，`concurrent_agent_sessions_all_connect` 偶发一次 `client Io(BrokenPipe)`（4 次全量里 2 次，单独跑 4/4 通过）。该测试不经过请求队列，与本片无关；记为负载下的已知抖动，待查。

## 边界

- 真实库目前没有连接器授权，也没有 ChatGPT 请求；队列照常为空。连接器接通后，ChatGPT 的请求会在 Settings → Agent 请求里署名“ChatGPT”。
- 真实库只读走查待补：Morii 关闭已安装实例后，用新候选跑同一走查并把结果补进本记录与候选记录。
