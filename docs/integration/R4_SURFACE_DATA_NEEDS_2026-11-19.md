# R4.0 原有界面接入真实库：缺口复核与数据需求表（2026-11-19）

路线 [R4](RUNTIME_ROADMAP_2026-11-16.md#r4原有界面接入真实库2026-11-19-排期) 第一步。对照现行 pin Memory `368634bdb62bcf402619a18423c38af15793950e`（aggregate `df3248e7…`，Workspace v1 61 命令）的源码，复核 [G01–G24](../design/ui-v2/backend/01-BACKEND_GAPS.md)（原核对基线是 10 月 26 日的 `c9bf1be`）。只读源码与公开集成说明，没有打开真实库；真实库里实际有哪些数据，由 R4.1 的原生实读补记。

## 结论

10 月 26 日以后，Memory 的 ADR-MEM-93/94/100/101/103 已把大部分只读投影做进 `SegmentedMemoryReader`（`memory-native-read-2`，目录算法 `owner-qualified-catalog-4`，过程端口各自 `-2`）。这些端口都在现行 pin 里，**不需要升级 pin**；Runtime 适配器 `memory_catalog.rs` 目前只转发了 page / stats / detail / source 四个，前端每页只取 2 条、不带分面。

所以 R4 的大部分工作在 Runtime：把已有端口逐个转发出来，界面在登记模式下改读它们。Memory 侧真正要补的只有 Context 召回等少数几项（见文末清单）。

## G01–G24 逐项

“端口”列是 `SegmentedMemoryReader` 的方法名，都在 `crates/enouia-memory-host/src/automation/catalog*.rs`。

| # | 缺口 | 现行 pin | 端口 / 字段 | Runtime 现状 |
| --- | --- | --- | --- | --- |
| G01 | 列表规模 | 已满足：单页 ≤100，范围上限为分段库容量，计数精确（`count_exact`） | `memory_page_native` | 每页只取 2 条 |
| G02 | 短标题 | 已满足：`title` ≤60 字 | 读取条目 `title` | 已显示 |
| G03 | 时间分桶 | 已满足：日 / 月，四种时间轴，IANA 时区 | `memory_time_buckets_native` | 未转发 |
| G04 | 全库图与带类型边 | 部分：节点 ≤5,000、事实边与算法建议边分开；语义近邻明确不可用 | `memory_graph_native`、`memory_neighbors_native` | 未转发 |
| G05 | 主题成员规模 | 已满足：共享实体族投影，可分页 | `memory_theme_members_native` | 未转发 |
| G06 | 文字检索、筛选与计数 | 已满足：文字、种类、四条状态轴、实体、项目、主题、时间窗；每轴分面计数 | `CatalogFilter`、`memory_facets_native`、page `include_facets` | 只有文字检索，无筛选与分面 |
| G07 | 形成活动流 | 部分：材料、形成、重评、合成、纠正、回退、状态变化、人工纠正动作；由时间推出的淡出 / 归档事件不可用 | `memory_activity_feed_native` | 未转发 |
| G08 | 人工纠正动作 | 端口已有（`NativeMemoryOwner` 计划 / 确认 / 提交），属写入 | Morii execution | R4.3 门槛 |
| G09 | 实体与参与者 | 已满足：条目带 `entities[]`（角色、人工合并 / 拆分证明） | 读取条目 `entities` | 未显示 |
| G10 | 事件时间精度 | 已满足：`event_time` / `valid_time` 为 `RecordTime` | 读取条目 | 未显示 |
| G11 | 真实 Vault 采用 | 已由 ADR-038 登记只读入口完成读取侧 | — | 已接入 |
| G12 | MCP 进入新库 | Memory 有分段 Agent 管线；接入属 MCP 授权 | — | R4.3 门槛 |
| G13 | 变更游标 | 已满足：可要求整体重读 | `memory_changes_since_native` | 未转发，前端每 1.5 秒读状态 |
| G14 | 会话与轮次 | 已满足：会话列表、会话详情（轮次 + 来源元数据），轮次正文经来源摘录读取 | `memory_conversations_native`、`memory_conversation_detail_native`、`memory_source_excerpt_native` | 只转发了来源摘录；Sessions 仍走 Workspace v1 |
| G15 | 冲突组与修订差异 | 已满足（结构差异） | `memory_conflicts_native`、`memory_revision_diff_native`、detail 历史 | 未转发 |
| G16 | 有效敏感度 | 已满足：条目带 `effective_sensitivity` | 读取条目 | 未显示 |
| G17 | 内容语言 | 已满足：`content_lang` | 读取条目 | 只显示代码 |
| G18 | 投影共同规则 | 已满足：投影头带算法、版本、快照、覆盖说明，服从删除水位线 | `ProjectionHeader` / `ProcessHeader` | 适配时保留覆盖说明 |
| G19 | 为什么形成 | 已满足：`formation_reason`（解释类型、规则 / 提示 / 模型版本、附注） | 读取条目 | 未显示 |
| G20 | 新旧两个库 | 登记入口与 Workspace 互斥，状态牌分开 | — | 已接入 |
| G21 | 一条记录一个陈述 | 归初始化规则 | — | 不处理 |
| G22 | Context 新格式 | **2026-11-19 由 Memory #125 / ADR-MEM-152 补齐，pin `009b7bc` 已采用**；此前缺：分段库的召回只在 Agent 宿主上（`SegmentedAgentHost::recall`，需 Agent 登记）；System 只读读者没有召回预览 | — | Context 仍走 Workspace v1 |
| G23 | 全库统计 | 已满足：各轴计数（每轴 ≤16 值，可再分页） | `memory_stats_native` | 只用了总数 |
| G24 | 回看建议、保存实验 | 以后 | — | 保持“不可用” |

## 逐界面数据需求

登记模式指 ADR-038 的显式只读启动。“可接”表示现行 pin 已有端口，R4.1 / R4.2 只做 Runtime 适配。

| 界面 | 需要的数据 | 来源 | 状态 |
| --- | --- | --- | --- |
| Home 读数与注记 | 授权记录总数、各状态计数、最近形成时间、最近会话 | stats、activity、conversations | 可接 |
| Home 迹线 | 每日形成量 | time buckets（学到时间轴）、activity | 可接 |
| 记忆格 / 列表 | 分页 ≤100、筛选、分面计数、标题、时间精度、实体、敏感度 | page + facets | 可接 |
| 详情与来源抽屉 | 正文、引文、来源元数据、历史修订、形成理由 | detail、source、diff | 可接 |
| 时间线与覆盖日历 | 月 / 日分桶、未知时间计数、所选日的记录 | time buckets + page（时间窗筛选） | 可接 |
| 关联 / 星图 | 节点、事实边、建议边、覆盖计数；选中记录的邻居；主题成员 | graph、neighbors、theme members | 可接（语义近邻不可用） |
| 形成 | 活动流、冲突组、修订差异 | activity、conflicts、diff | 可接（时间推出的事件不可用） |
| 召回实验 | 一次召回的入选 / 排除及理由 | — | **缺 G22** |
| Context | 与 Agent 收到的同一份 trace | — | **缺 G22** |
| Sessions | 会话列表、轮次、轮次正文、会话涉及的记录 | conversations、conversation detail、source | 可接 |
| Quick Search | 文字检索登记库 | page（文字筛选） | 可接 |
| Runtime Inspector | 库标识、当前快照（提交、纪元、水位线）、读取算法、计数 | status selection、stats | 可接 |
| Settings | 登记状态 | status | 已接 |

## 交给 Memory 的能力清单

已于 2026-11-19 发给 Memory 会话，由 Memory 自行开切片：

1. **G22 只读召回预览**（阻塞 Context 与召回实验）：System 只读读者上的召回预览端口，不写 Capsule、不需要 Agent 登记，返回与 Agent 召回同一算法的 trace（入选、排除理由计数、预算、渲染字节）。
2. **读取窗口续期**：现行授权 2026-11-24 到期；最终验收前由 Memory 列明，经 Morii 同意后执行。
3. 以后（不阻塞 R4）：语义近邻建议边、由时间推出的淡出 / 归档活动事件、回看建议（G24）。

写入（G08）、MCP（G12）、Provider 与迁移的授权门槛另见 R4.3 / R4.4 汇总。
