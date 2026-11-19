# R4.1 登记模式界面接入真实目录（2026-11-19）

路线 [R4](../integration/RUNTIME_ROADMAP_2026-11-16.md#r4原有界面接入真实库2026-11-19-排期) 第二步。依据 [R4.0 数据需求表](../integration/R4_SURFACE_DATA_NEEDS_2026-11-19.md)：现行 pin `368634b` 已含所需只读端口，本片不升级 pin、不改 Memory 领域代码。

## 改了什么

- **适配器**（`memory_catalog.rs`）：在同一个封闭的 `memory_catalog` 请求里转发 `facets`、`time_buckets`、`theme_members`、`graph`、`activity`、`changes`、`neighbors`、`conflicts`、`revision_diff`、`conversations`、`conversation_detail`；`page` 可带 `facets`，`detail` 可带历史游标。每个变体反序列化为 pin 中 Core 自己的查询 / 游标类型，原样返回 Core 文档。窗口、生命周期、锁定和敏感度上限规则不变；超出 Core 范围的页面参数直接拒绝。
- **Quick Search**：只在登记模式下，`memory_search` 改由目录回答（字面检索，最多 8 条，截断正文，不给游标和选择）。
- **记忆**：目录每页 50 条，按种类 / 知识 / 采用 / 注意力 / 对象 / 项目筛选，计数来自 Core 分面（按其余筛选条件）；行显示发生时间与敏感度；详情加发生 / 有效 / 学到时间、敏感度、涉及对象、形成理由与修订历史。左栏新增 时间、关联、形成、召回 四个视图：
  - 时间：按事件 / 学到 / 来源捕获三条轴的月分桶，未知时间单独计数；点月份读取该月记录（Core 时间窗筛选）。
  - 关联：逐块读完全部图投影，按关系类型列出候选与已显示数、关联最多的记录；选中记录读取邻居。语义近邻明说不可用。
  - 形成：活动流（可按事件类型筛选、向前翻页），点事件读取详情和矛盾组；说明按时间推出的淡出 / 归档尚无事件。
  - 召回：明说 Memory 还没有只读召回预览（G22），不显示任何真实或虚构结果。
- **Sessions**：登记模式下列出已捕获的会话，打开后读取轮次和每轮来源正文，说明只含已捕获轮次。
- **Home / Runtime Inspector**：读取总数、采用 / 暂存、最近事件、会话数；Inspector 另列读取能力、快照与水位线。
- 前端在库关闭或范围变化时撤下这些数据；不会把“已采用”写成人工确认。

## 验证

源码为 Runtime main `dacff6b`（Memory pin `368634b`）加本分支。被测程序是 `--no-bundle` 的 `enouia-desktop.exe`，SHA-256 `28beea0ff21fcc170ac58ef842253c94d59dc65c3ef354fbd608712708cc9633`，不是安装候选。

| 检查 | 结果 |
| --- | --- |
| `cargo test --locked`（含新增 `projection_and_process_reads_forward_core_documents_without_writing`：合成目录逐个调用新端口、超界参数被拒、Quick Search 截断、锁定后拒读、CURRENT 不变） | 62 + 9 通过，2 + 1 忽略（显式合成登记与真实库探针） |
| `cargo clippy --all-targets -D warnings`、`cargo fmt --check`、`node scripts/check-memory-integration.mjs`、`tsc` | 通过 |
| `npm test` 单元测试 | 150 通过，1 失败：`surfaces.test.mjs` 的 “native Settings exposes a non-secret configuration draft…”，在未改动的 main `dacff6b` 上同样失败，与本片无关 |
| DOM 夹具全量（含新增 `registered-views` 12 项：Home / Inspector 读数、时间格与月份记录、逐块读图与以标题列出关联、邻居、形成与矛盾组、召回缺口、Sessions 轮次正文、中文切换、锁定撤下） | 124 个夹具、2,572 项全部通过；之后改动所涉的 `registered-views`、`catalog-memory`、`registered-owner-status` 重跑通过 |
| 原生 `--owner-readonly-only`（新生成的合成登记，含新视图、Quick Search、筛选与 Inspector 读数） | **33/33** |
| 原生 `--catalog-only`（固定合成目录；每页 50 条后改为一页列全 3 条，翻页仍由 API 与 DOM 覆盖） | **42/42** |

i18n：新增中日文案全部过 CJK 字形子集检查；顺带改写 main 上已有、超出标签字体子集的 5 处既有译文（“不提供”“授予”“入口”“権限”），未重新裁剪字体。

### 真实库只读实读

按 ADR-038 以只读参数启动同一程序读取真实登记库，只记计数，截图留在本机临时目录、不入库。导出与纠正写入由 Memory 侧会话在两次实读之间完成，实读前均确认没有其他进程占用。

| 项 | 结果 |
| --- | --- |
| 原生探针（忽略测试 `registered_read_probe…`，逐个调用全部端口） | CURRENT 序列号前后不变（第一次 439，纠正后 440）；全部端口返回 Core 文档 |
| 桌面程序走查（最终程序，seq 440） | **19/19**：Home 351 条（已采用 318、暂存 33）、399 段会话；目录分页与 6 个筛选轴、筛选后计数收窄；详情含形成理由；时间格 15 个有记录的月份、199 条无事件时间；关联读完 351 个节点；活动流 352 个事件（含这次纠正）；矛盾组；召回缺口；会话轮次与来源正文；Quick Search 走登记目录；中日文切换；退出码 0 |

首轮走查发现图节点和邻居的记录 ID 少取一层（Core 的 `TargetRef` 为 `memory.memory.memory_id`），关联列表因此显示 ID 而非标题；已修正并在 DOM 夹具加了对应断言。

## 边界

- Context 与召回实验仍缺 Memory 的只读召回预览（G22），界面明说不可用；Memory 会话已同意按清单形状实现，合并后由 R4.2 升级 pin 接入。
- 语义近邻、按时间推出的淡出 / 归档事件、回看建议仍不可用（Memory 标为以后）。真实库没有主题记录，主题筛选与主题成员暂无数据。
- `revision_diff` 已转发，界面暂只列修订历史，未显示差异。
- 不新增写入、授权、Provider、MCP 或 Context 路径；人工验收、安装与新候选另行记录。
