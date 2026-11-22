# Memory 65a9e13 采用：ChatGPT 连接器状态（2026-11-22）

Memory [#133](https://github.com/Morii9961/enouia-memory/pull/133)（ADR-MEM-158 远程连接器写入工具，合并提交 `65a9e13a8748a9d42f6c18d121ef0142281d854b`，审阅 head `6b4357e46d1b87e49a7f51d1df4738a9711cf2ea`，aggregate `01dfe4c3…`，61 命令）。写入工具 `memory_submit_conversation` 只在 Memory 的远程服务中运行；Morii 决定真实接通推迟到新域名就绪后（Cloudflare Tunnel），所以界面如实显示“未连接”。

## 改动

- pin `a84e8fd → 65a9e13`；`check-memory-integration --memory-checkout <65a9e13>` 一致。
- 适配器新增只读 `connector_status`：读 `NativeMemoryOwner::capture_windows()`，返回每个窗口的上限、记忆类型、有效期、剩余与预留来源编号。没有新的 System 端口。
- Settings 与 Runtime Inspector：“ChatGPT 连接器”——没有窗口时写“未连接：这个库里还没有连接器打开过捕获窗口”，并说明远程服务尚未上线、接通待新域名；有窗口时列出各窗口。Sessions 在出现多个捕获方（account scope）时可按捕获方筛选。
- 原生测试改用 `ConnectorWriter`（取代 #132 的自由函数 `submit`），并断言提交前无窗口、提交后出现一个上限 Private、类型 preference、已用两个来源编号的窗口。

## 验证

被测 `--no-bundle` 程序 SHA-256 `e1e961b427e50c0941c84f93a1203dcfa7b9c10c3388bff110cebf28f46c8ecb`，源码 main `8e13874` 加本分支。

| 检查 | 结果 |
| --- | --- |
| `cargo test --locked` | 67 + 9 通过，2 + 1 忽略 |
| clippy、fmt、tsc、i18n 与 CJK 字形子集、`check-memory-integration` | 通过 |
| `npm` 单元测试 | 151/151 |
| DOM 夹具全量（`registered-views` 新增“未连接、不假装连通”检查） | 125 个夹具、2,586 项全部通过 |
| 原生 `--owner-readonly-only`（新增 Settings 显示未连接） | **37/37** |
| 原生 `--catalog-only` | **42/42** |
| 真实库只读原生探针（新 home） | 351 条；CURRENT 前后均为 440 |

## 边界

Memory #134（ADR-MEM-159，`d9433861…`）只影响授权写入的截断规则，Runtime 无需采用，留到 D1 采用时一并升 pin。ChatGPT 实连待域名。
