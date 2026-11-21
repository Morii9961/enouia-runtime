# Memory a84e8fd 采用：显示 ChatGPT 提取的记忆（2026-11-21）

Morii 决定日常记忆“改成 ChatGPT 提炼”（R4.3 B 新方向）。Memory 已合并 [#131](https://github.com/Morii9961/enouia-memory/pull/131)（ADR-MEM-156 采集窗口，合并提交 `094d347f…`）与 [#132](https://github.com/Morii9961/enouia-memory/pull/132)（ADR-MEM-157 ChatGPT 提炼、校验入库，合并提交 `a84e8fdfc2f1487c5eef9a7704eec830f1c8e856`，审阅 head `9556f3b063f079f603018345e255e29259bcec1c`）。aggregate `c3c4358a7c6480e07e959f2598539b24cc5218df3d009379f7ab9818551cad94`，61 命令。两者都只在 Memory 的远程服务中调用，Runtime 只升级 pin 以读取新形成的记录。

## 改动

- pin `f7c2a81 → a84e8fd`；6 个 rev、9 个锁定包、`memory-pin.json` 同步，`check-memory-integration --memory-checkout <a84e8fd>` 一致。
- 记录详情“为什么形成”、目录行与形成活动流：prompt version 为 `chatgpt-connector-authored-1` 时标“ChatGPT 提取 · 模型”，ChatGPT 的附注标为“ChatGPT 的附注，不是事实”。
- Sessions 会话行加显示采集的 account scope（Memory 的采集只接受 platform `enouia-runtime`，连接器以自己的 account scope 区分）。
- 连接器状态与授权范围尚无 System 只读端口，等 Memory 下一片（远程 MCP 写入工具接线）。

## 验证

被测 `--no-bundle` 程序 SHA-256 `d2ab6a78a531b5c8cfc07049c3e2fcff88896ba1ead2bcc3b65b257db50ab568`，源码 main `fb0570c` 加本分支。

| 检查 | 结果 |
| --- | --- |
| `cargo test --locked`，新增 `chatgpt_extracted_memory_carries_its_analyst_model_and_note`：在 Morii 布局合成库上开采集窗口、以 Memory 的 `connector_formation::submit` 提交一条合成 ChatGPT 提炼，经真实 worker 形成后，从登记目录读回 prompt version、模型与附注，会话的 account scope 可见 | 67 + 9 通过，2 + 1 忽略 |
| clippy、fmt、tsc、i18n 与 CJK 字形子集 | 通过 |
| `npm` 单元测试 | 151/151 |
| DOM 夹具全量（`catalog-corrections` 新增 ChatGPT 标注检查，`registered-views` 新增 account scope 检查） | 125 个夹具、2,585 项全部通过 |
| 原生 `--owner-readonly-only` | **36/36** |
| 原生 `--catalog-only` | **42/42**（首次运行在窗口尺寸辅助步骤失败 11/12，原样重跑通过） |
| 真实库只读原生探针（新 home） | 全部端口返回 Core 文档，351 条、352 个事件、399 段会话；CURRENT 前后均为 440 |

## 边界

真实库目前没有 ChatGPT 提取的记录（远程连接器未部署）。远程写入工具、连接器状态读取与 VPS 部署由 Memory 推进；Runtime 在其合并后接 Settings / Inspector 的连接器状态。
