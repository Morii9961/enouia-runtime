# Runtime 交付路线与问题清单（2026-11-16）

本文件是当前接续入口，取代旧交接的“下一步”，不改历史验证结论。[状态报告](../status/PROJECT_STATUS.md)、[Dashboard JSON](../status/project-status.json)、[新会话提示词](../prompts/CODEX_RUNTIME_NEXT_2026-11-16.md)分别用于状态、导入和实施。

2026-11-17 接续：R1 的 Memory `a543c1e` / aggregate `723ec245…` / 61 命令已随 PR180 合并；[证据](../validation/Memory-pin-a543c1e-2026-11-16.md)保留原失败。R2 的[详情/来源合成接入](../validation/Catalog-native-detail-source-2026-11-17.md)已随 PR181 合并（原生 42/42），ADR037 引用澄清已随 PR182 合并。PR183 合并 [ADR-038 显式登记库只读启动](REGISTERED_OWNER_READONLY.md)（桌面 14/14）；随后完成独立只读入口的壳层、Home/Settings 状态统一，见[验证](../validation/Registered-owner-shell-status-2026-11-17.md)及 [R2 接入记录](RUNTIME_OWNER_ENTRY_PROPOSAL_2026-11-16.md)。R3 的[只读验收分流与证据清单](../RUNTIME_OWNER_READONLY_ACCEPTANCE_2026-11-17.md)已准备，真实库和新候选等待对应门槛。图形选择、个人库验收及 R3 候选仍有独立边界。以下审计基线不是当前 pin，手动状态快照保持原证据基线。

## 基线与下一交付目标

首个交付点：新Owner库可在Windows桌面打开、检索、查看精确来源、锁定并重开，并有Memory独立备份恢复证明。显式受信任本机启动已按持续开发指令完成合成接入；图形目录选择及真实库验收仍独立。

- 审计时Runtime本地/云端main均为`19ff0d1c53649f16bef97c131cfd755d1d39afdc`，云端仅main、open PR为0；本地三个功能分支均合并，仅一个登记工作树。后续文档提交及引用清理不改变代码证据基线。
- 当前Memory pin为`eb7050961cceaac04d4aec79257524331be6c7b0`，aggregate为`39cc2a820fd132770397e3cef37674b8fca17280c8977bcd161622a43ad54c52`，Workspace v1仍为61命令。
- 旧安装候选`5175284`内含`731edd56…`。PR177有新pin验证用程序，但无对应安装包，不能把旧候选用于新Owner根。
- Memory审计基线为`a543c1eb81e5d7150ebe7820592eea35a9042697`。ADR145 fresh驱动已合并；ADR146文字视图回放另需兼容pin，aggregate为`723ec245e7ddcd0c5a5a81b84ac1cb7bbd794c99dab0ed99e4e88b480971d50f`。实施时核实实际已合并源码和manifest，不机械复制hash。
- Memory #110备份回归、#112恢复接续、#113纯文本保留在审计时仍open；#112以#110为base。由Memory会话负责并遵守其合并门槛。

## 问题清单

| 问题 | 影响与处理 |
| --- | --- |
| 状态快照停在11月7日，仍称22个草稿未合并 | 本次更新两份文件，保留旧里程碑ID；合并不写成人工验收 |
| 本地Runtime提示词被重复Memory任务覆盖 | 修改前保留本机忽略备份；恢复已提交正文，改指向新路线 |
| 已合并分支和旧远端引用残留 | 在线核对refs、祖先关系及工作树后清理；保留未提交资料 |
| eb70509不含ADR146 | 61命令不变不代表记录兼容，须完成R1 |
| 合成Owner入口、正式入口和旧安装包混淆 | 分别完成R2/R3，不将分段Owner根转接成旧Workspace库 |
| 两个不同文件都编号ADR-037 | 11月17日已在ADR登记和两份原文件标明完整标题、路径及 synthetic Memory / desktop retirement 别名；保留编号与原激活语义 |
| #24星图5000条性能仍未达标 | WebView2复测已完成；先决定视觉取舍，再做对应优化，避免重复测量充进度 |
| Home迹线/摘要、全库分类、完整Capsule契约不足 | 保留虚构或有限范围标识，Memory负责领域契约，不从当前页推导全库事实 |
| #29人设默认、枚举/时间翻译、Windows环境待定 | 列为owner决定，沿用现有保守实现 |
| Memory并行工作曾共用target而串用CLI | 并行工作树独占target；实际运行核实源码/二进制，不能沿用未知程序 |

有效证据：[PR177](../validation/Memory-pin-eb70509-2026-11-14.md)、[候选5175284](../validation/UI-v2-candidate-5175284-2026-11-11.md)、[星图复测](../validation/UI-v2-starmap-webview2-2026-11-12.md)、[未决问题](../design/ui-v2/OPEN_ISSUES.md)。本次仅引用原revision及所列范围，未重跑产品测试。

## R0：文档与清理，本会话完成

更新状态/路线及接续入口，使用Dashboard只读检查器检查JSON，不向Dashboard导入。依Runtime AGENTS固定协议1.0，并保留基线根字段及稳定ID；reporter/非里程碑ID是已有扩展，接收器可以提示并忽略，不能宣称严格1.0 schema通过。

Morii另行明确要求清理已合并分支/工作树、过时构建与临时文件。检查精确路径、Git归属、进程占用和证据用途后再删；保留最新候选、最新兼容验证程序、日志/截图/报告、`.claude/`与未提交资料。Codex会话/统计源、Activity/Usage账本和采集任务不在构建清理范围。清理后才启动后续会话，避免与构建并发。

## R1：ADR146兼容采用，新会话第一片

Morii在本轮梳理后要求按路线开新会话继续工作；据此先实施最小兼容采用，不等待整个Memory交付。读[集成配方](../MEMORY_INTEGRATION_v1.md)、Memory当前已合并RUNTIME.md、runtime-surface manifest及实际源码，确认包含ADR146的最小合适已合并revision。主线有新增变化时先审范围，不机械追最新，不采用未合并分支。

按既有模式同步精确Git pin、锁文件和aggregate；不引入path依赖、branch、patch，不扩张UI/Owner权限，不改Memory领域代码。此前eb70509采用已经完成，无需重做。

完成条件：revision/aggregate一致，相关消费者及ADR146兼容路径有针对性证据。按集成配方执行必要检查，必须含`node scripts/check-memory-integration.mjs`；其他检查按实际风险，不默认21模式/全套截图/打安装包。记录失败、忽略及未覆盖范围。验证后提交、推送、开PR，按Runtime既有授权合并，保留Codex co-author trailer。此切片不交付个人库或新安装包。

## M：Memory交付，可与R1并行

另一仓库/会话收束#110/#112/#113及组合验证，遵守其合并门槛，再按已有真实资料授权推进完整纯文本Plan/journal容量、真实形成、关闭重开、查询/精确来源、独立备份恢复。最新方向是文字Raw和来源保留、附件metadata_only，不恢复旧185候选或重启全量分析。Runtime只核对工程revision、根类型、契约和验收结果，不打开私人原文、Vault或备份。

Memory形成库及领域契约；Runtime采用兼容Core并提供Windows客户端。云端、ChatGPT采集、长期读取授权、自动写入与离线同步不属于R1或首个只读入口的默认范围。

## R2：正式Owner首个入口

最小只读接入已采用现有 Memory 原生 CLI/启动器认证边界，完成目录、来源、锁定/跨进程重开与壳层一致状态；不新增页面认证工具、图形目录选择或读取/写入授权。合成接入结果不替代 M 的真实库工程交付与 UI 验收。

## R3：新候选与日用验收

接入完成、Memory交付契约明确后，按验收配方生成新候选，记录源码与pin。[只读验收准备](../RUNTIME_OWNER_READONLY_ACCEPTANCE_2026-11-17.md)已区分旧Workspace步骤与新Owner入口，[旧人工指南](../RUNTIME_ACCEPTANCE_GUIDE_2026-11-08.md)顶部提供分流，不直接复制旧第6/9步。新候选和真实库人工验收仍未执行。

11月17日核对公共 Memory main `d0e7f9f`：#110/#112/#113/#114/#115/#116 已进入主线；新增初始化标题投影与准备性能变化不涉及 reader/格式/Runtime surface，本片不追最新 pin。公共交付路线仍是11月16日计划，未提供真实整轮形成与独立恢复的 ready 证明；只记录“待 Memory 交付工程摘要”，不从 PR 合并推断真实库完成。

PR184/185/186 已分别合并壳层状态、验收分流与[登记空范围文案修正](../validation/Registered-owner-empty-state-2026-11-17.md)。[三语最小窗口观察](../validation/Registered-owner-minimum-layout-2026-11-17.md)复用 PR184 程序核对 1100×700 的 Home/Settings/Memory，未复现新徽标遮挡，不增加样式改动；它不是 HEAD 全套原生复验。下一有效出口为 Memory 的真实交付工程摘要，再核对候选生成条件，不重做已通过检查维持进度。

### 11月17日跨会话接续：准入通过，容量未通过

Morii 明确要求查看并协调隔壁“推进 Memory 纯文本新库交付”。已核对该会话最新工程进度和公共 main：

- PR117 / ADR149 已按该会话收到的明确授权合并至 `17a369e010f670baacaeec98306854fd4d14afc5`。`AdmissionInput.support_origin_groups` 保留重复文字的全部原始出现，并记录同一支持来源分组；旧 `a543c1e` 的封闭读取器可能拒绝这些持久决策，**必须先完成兼容采用才能打开此类新库**。新 aggregate 为 `df3248e725f92952d0be265092babd5dbdbe6fec642720a0c400c71cbd9e7e53`，Workspace 仍为61命令。公共依据为该 revision 的 `docs/integration/RUNTIME.md` 与 `docs/validation/Grouped-support-origins.md`。
- 隔壁已从合并主线重建 CLI，原始全量清单 **43计划 / 351记录**通过准入检查；容量预检报告 queued journal **21,793,549字节**、lifecycle bound **30,865,623字节**，超过 **16,777,216字节（16 MiB）**。这是该会话提供的工程摘要，Runtime 未读取私人清单或自行重跑；尚未 bootstrap / 创建真实 Vault，形成、重开/来源、独立恢复仍未完成，也没有 ready、grant 或新候选。
- Memory 确认主人已明确授权紧凑 journal 的最小 ADR、合成实现和 PR：仅新 fresh 运行将不可变计划移入既有 hash-bound Raw，可变日志保持16 MiB及原 request/response/key/binding/receipt/state，旧日志原样读取；不删源、截断或抬预算。该片尚无 PR / 最终 revision，预计是 initializer 私有 journal 格式；若备份验证、持久回放或 surface 实际改变，随 PR 给准确影响。新增能力仍遵守 Memory 自己的合并门槛，Runtime 不代为放行。
- Runtime 负责 reader 兼容差异清单与候选准备；暂不在容量方案未定时重复采用中间 pin。待 Memory 明确最终合并 revision、aggregate、持久回放/恢复兼容影响及实际预检结果，再完成一次最小兼容采用。只交换工程摘要，不传原文、私人路径、登记参数或凭据。

此次协调不改现有 pin、读取授权、个人库接入、安装或部署边界，也不更新手动状态快照。

Runtime 的具体采用准备（未执行 pin 变更或产品测试）：

1. 最终版本须同时核对六个 Cargo Git 依赖、九个 lock source 与 `memory-pin.json` 的 revision/aggregate；不按中间 aggregate 直接构建生产候选。
2. 本地 `memory_catalog/fixture.rs` 与 `memory_automation/fixture.rs` 从既有 JSON 反序列化 `AdmissionInput`，没有需要补字段的 Rust 结构体字面量。新字段 default/空值省略保留旧输入行为，不为兼容而给旧合成来源编造分组。
3. 生产目录详情/来源调用现有 System reader 并序列化其完整返回值，没有 Runtime 重建持久 AdmissionInput 的中间层；现有前端只展示授权记录数和各自引文，不声称引文数是独立佐证数。采用时保持这个边界。
4. 针对最终 pin 运行集成配方中的相关消费者/原生读取检查及必须的 Memory surface 守卫；新增证据应覆盖 grouped decision 的原生重放、同根读取及两个原始精确来源，旧输入/权限拒绝保持原义。Memory 已有合成分组回归可作对照，不把其118项结果记成 Runtime HEAD 已执行。

补安装/托盘/热键/登录启动及真实工作流未完成项。个人库由Morii在批准入口接入；实际安装、Provider、部署遵守各自边界。没有新问题不重复已有有效矩阵。首版之后另排星图及云端能力。

## 排期和待决定项

首个新库桌面可用版暂留2–4周，低置信度：Memory约2–5有效工作日、Runtime采用/最小入口约3–7日、候选反馈约2–5日，部分并行。Memory侧1–2工作周是乐观口径；容量和入口未落地前不承诺日期。此预算不是测得进度、Morii认可评分或完整云端完工预测，JSON进度保持null。

待决定：是否扩展图形Owner入口/其他表面、Windows环境、星图视觉/首版门槛、公开人设默认及Memory契约§5、合成枚举/时间翻译、必要时改键入口。Runtime自动合并授权不能扩大到Memory待审PR、个人库、安装/部署、真实读取授权或Provider。

R1/R2 的接续结果见本文顶部；R3 只读验收分流已准备，接续核对公共工程交付与实际待决定项。跨仓库优先读取公共交接和已有审计结果，不创建重复Memory实现任务。手动状态快照仅在Morii要求时更新。
