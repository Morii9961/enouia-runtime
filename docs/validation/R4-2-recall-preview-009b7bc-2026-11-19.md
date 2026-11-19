# R4.2 Memory 009b7bc 采用：Context 与召回实验接入真实库（2026-11-19）

路线 R4.2。R4.0 交给 Memory 的唯一阻塞项是 G22（System 只读读者上的召回预览）。Memory 以 [PR #125](https://github.com/Morii9961/enouia-memory/pull/125) / ADR-MEM-152 交付，本片升级 pin 并把 Context 与召回实验接到真实库。

## 精确采用

- Memory：`009b7bc5bcae27a2f747b1fdbd77a6e06206ffad`（PR #125 合并提交，合并树与审阅 head `304bd0266f400d08f7bddbe7280bebdbb7bbed64` 一致）。没有采用未合并代码。
- Surface aggregate：`d3fc6a538a9dfaaf256ad32ad6941202886290eb7afb8fe3cd57f92494070478`；Workspace 仍为 IPC schema 1、61 个命令。
- 六个 Cargo Git rev、九个锁定包 source 与 `memory-pin.json` 同步；`cargo metadata --offline --locked` 通过，其他依赖没有重新解析，没有 path / branch / patch。
- `368634b..009b7bc` 中 Runtime 链接的代码只有 `enouia-memory-host` 的 `catalog.rs`（新增 `SegmentedMemoryReader::recall_preview_native`）与 `segmented_agent.rs`（Agent 召回改为共用同一函数）。其余是 Memory 文档改名和它自己的参考界面，持久格式、reader、备份格式和 IPC 不变。

## Runtime 改动

- 适配器 `memory_catalog` 新增 `recall_preview`：页面给出提示、范围（当前 / 含历史 / 不带提示）和评估时刻；Runtime 把它转成 Core 的 `RecallQuery`（该类型无 serde），以当前入口的读取上限调用，原样返回 Core 文档并只加 read-2 外层字段。不写 Capsule、不存 context、不登记 Agent。
- 状态文档在打开时附 `recall_limits`（宿主固定的注意力配置的条数与字节上限：登记入口 32 条 / 65,536 字节，合成目录 8 条 / 16,384 字节），页面据此请求，超限仍由 Core 拒绝。
- 召回实验：输入提示后列出入选记录（标题、得分、注意力、入选理由）、排除理由计数、考虑 / 入选 / 排除 / 字节数，以及生成的上下文全文；字节预算用尽时明说。
- Context：登记模式下不再显示“不可用”，改为同一预览，默认展开生成的上下文，说明与 Agent 使用同一套召回、不保存。
- Home 的 Context 注记改为指向预览。

## 验证

源码为 Runtime main `6e6bb8f`（PR215 合并）加本分支；合并前变基到 `70806f8`（PR216 只改两个测试文件），变基后 `npm` 单元测试 151/151 通过。被测程序 `--no-bundle` `enouia-desktop.exe`，SHA-256 `525afde444721e21d4a3ca2069294fa5af3e5685b515bc88c4087ad70c87ef13`，不是安装候选。

| 检查 | 结果 |
| --- | --- |
| `node scripts/check-memory-integration.mjs --self-test` / `--memory-checkout <009b7bc>` | 一致：6 个 crate、9 个锁定包、8 项负向检查；surface 与 pin 的 revision 一致 |
| `cargo test --locked`（合成目录：`recall_preview` 返回 Core trace、状态带 `recall_limits`、超过配置条数被 Core 拒绝） | 62 + 9 通过，2 + 1 忽略 |
| `cargo clippy --all-targets -D warnings`、`cargo fmt --check`、`check-activity-retirement`、`git diff --check`、`tsc` | 通过 |
| i18n 与 CJK 字形子集 | 12/12（新译文避开子集外的“浏”“句”“多”） |
| DOM 夹具全量（`registered-views` 增至 14 项：召回用入口上限请求、列出 Core 入选与理由、说明不写入；Context 提供同一预览而非已存 Capsule） | 124 个夹具、2,575 项全部通过 |
| 原生 `--owner-readonly-only`（新合成登记，含召回预览与 Context） | **34/34** |
| 原生 `--catalog-only` | **42/42** |

### 真实库只读实读（seq 440）

Memory 侧导出与校验完成后（CURRENT 仍为 440），用同一程序以只读参数启动：

- 桌面程序走查 **20/20**：R4.1 的 19 项全部保持，另加召回预览——提示 “Enouia”，考虑 351 条、入选 10 条、排除 341 条、渲染 64,974 字节（达到 65,536 字节上限，界面明说预算用尽）；Context 页提供同一预览、不再显示已存 Capsule；退出码 0。
- 原生探针：CURRENT 前后均为 440。

## 边界

- 召回预览只读：不保存 Capsule、不登记 Agent、不调模型；入选顺序与理由来自 Memory 算法，Runtime 不重新排序。
- 条件、时间窗等高级召回参数尚未在界面提供（Core 已支持，页面目前只给提示与范围）。
- 写入、Provider、MCP、迁移仍按[授权门槛](../integration/R4_AUTHORIZATION_GATES_2026-11-19.md)等待 Morii 决定。
