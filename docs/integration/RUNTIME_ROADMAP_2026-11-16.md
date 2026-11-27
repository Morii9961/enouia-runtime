# Runtime 交付路线与问题清单（2026-11-16）

**当前状态（2026-11-24）**：R4、R5 已全部合并，Memory pin 已升到 `e876cc7`（本机 bge-m3 语义索引，相对阈值已在真实库上校准，再加 jieba 名词加权、分词认词和星图语义近邻，见[语义验证](../validation/Memory-pin-bac2dbe-semantic-index-2026-11-26.md)和[jieba 验证](../validation/Memory-pin-561c5a3-jieba-semantic-2026-11-26.md)；人物合并后的读取故障、身份确认和胶囊结果的校验已修好）；记忆、会话及其他子页已按 UI v2 设计稿重做（#265–#267）。验收候选仍为 `2010575`（Memory pin `b7a0269`）。验收候选为 [`2010575`](../validation/R5-candidate-2010575-2026-11-26.md)，已应 Morii 要求装到本机（相对 `839e34d` 多了 ChatGPT 请求署名、Home 真实时间画线、Sessions 分段合并、数字日期标签、中文召回和 Agent 并发连接修复；`8601135`、`1324b51`、`eaa410c`、`38586e4`、`7021984` 作废）。中文召回：自 Memory `c1ebb04` 起（ADR-MEM-209/210/213/214/216：合约层补上中日韩片段与单字，按稀有程度加权，标题参与匹配，强项优先，标题含整段问句词时加分），整句中文问题能召回到相关记录，“我去过某地吗”和三字作品名也排对了；本机已装同 pin 的 `8601135`。Agent 管道并发连接测试偶发失败的原因已查明：创建 Agent 宿主时，Memory 取写锁只试一次，不等待。Memory `b7a0269`（ADR-MEM-217）已修复，pin 已升到该版本，见[验证记录](../validation/agent-pipe-busy-2026-11-25.md)。真实库仍只读（CURRENT 440），没有登记任何授权。Runtime 路线上不需要新授权的工作已经做完，剩下的都在等 Morii：

- 周末一次性验收，以及 D1 星图帧率、D2 Capsule 开关：见[周末一页](R5_MORII_DECISIONS_2026-11-23.md)。
- 外壳：托盘、热键、登录启动、卸载由 Morii 亲手做。
- ChatGPT 接主库：Morii 已同意先用 Cloudflare 临时隧道直连主库，允许读取来源原文，授权到期日 2026-12-31。Memory #157 已把服务和私有操作单准备好，接通时间待 Morii 定。
- B3 语义近邻：Morii 定为先不做。
- ChatGPT 请求署名（Memory ADR-MEM-184，pin 不升）：队列里来自连接器的纠正、遗忘请求写“ChatGPT”，见[验证记录](../validation/R5-chatgpt-requests-2026-11-24.md)；候选 `7021984` 真实库只读走查 29/29（队列为空，CURRENT 440）。

- Home 记录纸改用真实时间画线（已捕获轮次的记录时间画线，Memory 写入画成标记，时间小地图打开，记录带不再显示“未载入”），见[验证记录](../validation/R5-home-recorded-trace-2026-11-24.md)；候选 `38586e4` 真实库只读走查 34/34（打开时 205 个轮次，“Now”可回到今天，CURRENT 440）。
- 跨捕获窗口的 ChatGPT 对话（Memory ADR-MEM-185，pin 不升）：Sessions 把同一对话的各段合在一行，见[验证记录](../validation/R5-chatgpt-segments-2026-11-24.md)；已包含在候选 `38586e4` 中。

Memory 之后的 pin（`1933746` 至 `c16530b`，ADR-MEM-176 至 188）只改远程服务，不改 surface 和命令，不需要机械跟进。

本文件是当前接续入口（R4 最新状态见下文“R4：原有界面接入真实库”一节，最终验收见 [R4 一次性验收指南](../RUNTIME_R4_ACCEPTANCE_2026-11-19.md)），取代旧交接的“下一步”，不改历史验证结论。[状态报告](../status/PROJECT_STATUS.md)、[Dashboard JSON](../status/project-status.json)、[新会话提示词](../prompts/CODEX_RUNTIME_NEXT_2026-11-16.md)分别用于状态、导入和实施。

2026-11-18，Memory 完成 351 条真实形成、重开与来源核验，并通过主人选择的同盘备份验证、隔离恢复与幂等重跑。Runtime 已从 `1267268` 构建[本地 R3 候选](../validation/R3-morii-readonly-candidate-1267268-2026-11-18.md)，生成 NSIS 模板 26/26、候选程序合成 WebView2 24/24 通过。Memory 交付会话以原登记的 Windows 账户完成[真实库本机代理实测](../validation/R3-morii-readonly-candidate-1267268-2026-11-18.md#真实登记库的本机代理实测)：打开、检索、引文、锁定与同根重开通过；桌面显示的是当前授权范围（259 条）。接续[Morii 人工验收](../RUNTIME_MORII_READONLY_ACCEPTANCE_2026-11-17.md)，独立介质故障恢复另待验证。下文的早期候选状态保留原时点。

2026-11-19：键盘锁定后焦点修复随 PR206 合并，应 Morii 要求从 `1e96a6d` 构建[新 R3 候选](../validation/R3-morii-readonly-candidate-1e96a6d-2026-11-19.md)：NSIS 模板 26/26、登记只读合成 25/25、分段目录 42/42。人工验收改用该候选；`1267268` 的代理实测与 Workspace 矩阵仍只属于原候选。

2026-11-19，Morii 要求把 pin 更新到 Memory `368634b`（[Memory #120](https://github.com/Morii9961/enouia-memory/pull/120)）：Windows 长 Vault 路径下持久重命名不再以 `StorageFailed / NotFound` 中断 Workspace 提交，surface 与 61 命令不变，见[采用验证](../validation/Memory-pin-368634b-2026-11-19.md)。R3 候选 `1e96a6d` 与 `1267268` 都仍嵌 `506d23d`，新 pin 尚未生成候选。

2026-11-19 存放整理：Morii 确认永久删除旧 v1 重初始化输入（含附件原件存档，附件原件已无法从新库取回）、11-17 同盘导出与隔离恢复副本，以及 Memory/Runtime 的合成验证目录。主库仍在原登记 home，内容未变；**目前没有任何备份**，Memory 将在候选关闭后按 ADR136 重新导出，目标与时间由 Morii 决定。Morii 指定将来统一存放到单一目录，但原生登记绑定 home 完整路径、账户、operation 与描述符，不能直接搬移或手改；迁移需 Memory 新开切片并经 Morii 授权，Runtime 届时再采用新入口。之前的备份与恢复验证结论保留为历史证据。

2026-11-19：Morii 授权登记 Morii 入口读取全部敏感级别，原生上限由 `Private` 改为 `HighlySensitive`（仅登记模式），见 [ADR-038 补充](../adr/038-registered-morii-readonly-entry.md#morii-decision-full-sensitivity-ceiling-2026-11-19) 与[验证](../validation/Registered-morii-full-sensitivity-2026-11-19.md)。尚未生成新安装候选。

此前兼容采用为已合并 Memory `506d23d` / aggregate `df3248e7…` / 61命令，满足ADR149分组决策reader门槛；[本轮验证](../validation/Memory-pin-506d23d-2026-11-17.md)包含新程序原生20/20。它与Memory真实全量预检并行，不等于真实库/生产候选完成；下文早期pin与候选均保留原证据范围。

2026-11-17 接续：R1 的 Memory `a543c1e` / aggregate `723ec245…` / 61 命令已随 PR180 合并；[证据](../validation/Memory-pin-a543c1e-2026-11-16.md)保留原失败。R2 的[详情/来源合成接入](../validation/Catalog-native-detail-source-2026-11-17.md)已随 PR181 合并（原生 42/42），ADR037 引用澄清已随 PR182 合并。PR183 合并 [ADR-038 显式登记库只读启动](REGISTERED_MORII_READONLY.md)（桌面 14/14）；随后完成独立只读入口的壳层、Home/Settings 状态统一，见[验证](../validation/Registered-morii-shell-status-2026-11-17.md)及 [R2 接入记录](RUNTIME_MORII_ENTRY_PROPOSAL_2026-11-16.md)。R3 的[只读验收分流与证据清单](../RUNTIME_MORII_READONLY_ACCEPTANCE_2026-11-17.md)已准备，真实库和新候选等待对应门槛。图形选择、个人库验收及 R3 候选仍有独立边界。以下审计基线不是当前 pin，手动状态快照保持原证据基线。

## 基线与下一交付目标

首个交付点：新Morii库可在Windows桌面打开、检索、查看精确来源、锁定并重开，并有Memory独立备份恢复证明。显式受信任本机启动已按持续开发指令完成合成接入；图形目录选择及真实库验收仍独立。

- 审计时Runtime本地/云端main均为`19ff0d1c53649f16bef97c131cfd755d1d39afdc`，云端仅main、open PR为0；本地三个功能分支均合并，仅一个登记工作树。后续文档提交及引用清理不改变代码证据基线。
- 当前Memory pin为`eb7050961cceaac04d4aec79257524331be6c7b0`，aggregate为`39cc2a820fd132770397e3cef37674b8fca17280c8977bcd161622a43ad54c52`，Workspace v1仍为61命令。
- 旧安装候选`5175284`内含`731edd56…`。PR177有新pin验证用程序，但无对应安装包，不能把旧候选用于新Morii根。
- Memory审计基线为`a543c1eb81e5d7150ebe7820592eea35a9042697`。ADR145 fresh驱动已合并；ADR146文字视图回放另需兼容pin，aggregate为`723ec245e7ddcd0c5a5a81b84ac1cb7bbd794c99dab0ed99e4e88b480971d50f`。实施时核实实际已合并源码和manifest，不机械复制hash。
- Memory #110备份回归、#112恢复接续、#113纯文本保留在审计时仍open；#112以#110为base。由Memory会话负责并遵守其合并门槛。

## 问题清单

| 问题 | 影响与处理 |
| --- | --- |
| 状态快照停在11月7日，仍称22个草稿未合并 | 本次更新两份文件，保留旧里程碑ID；合并不写成人工验收 |
| 本地Runtime提示词被重复Memory任务覆盖 | 修改前保留本机忽略备份；恢复已提交正文，改指向新路线 |
| 已合并分支和旧远端引用残留 | 在线核对refs、祖先关系及工作树后清理；保留未提交资料 |
| eb70509不含ADR146 | 61命令不变不代表记录兼容，须完成R1 |
| 合成Morii入口、正式入口和旧安装包混淆 | 分别完成R2/R3，不将分段Morii根转接成旧Workspace库 |
| 两个不同文件都编号ADR-037 | 11月17日已在ADR登记和两份原文件标明完整标题、路径及 synthetic Memory / desktop retirement 别名；保留编号与原激活语义 |
| #24星图5000条性能仍未达标 | WebView2复测已完成；先决定视觉取舍，再做对应优化，避免重复测量充进度 |
| Home迹线/摘要、全库分类、完整Capsule契约不足 | 保留虚构或有限范围标识，Memory负责领域契约，不从当前页推导全库事实 |
| #29人设默认、枚举/时间翻译、Windows环境待定 | 列为Morii决定，沿用现有保守实现 |
| Memory并行工作曾共用target而串用CLI | 并行工作树独占target；实际运行核实源码/二进制，不能沿用未知程序 |

有效证据：[PR177](../validation/Memory-pin-eb70509-2026-11-14.md)、[候选5175284](../validation/UI-v2-candidate-5175284-2026-11-11.md)、[星图复测](../validation/UI-v2-starmap-webview2-2026-11-12.md)、[未决问题](../design/ui-v2/OPEN_ISSUES.md)。本次仅引用原revision及所列范围，未重跑产品测试。

## R0：文档与清理，本会话完成

更新状态/路线及接续入口，使用Dashboard只读检查器检查JSON，不向Dashboard导入。依Runtime AGENTS固定协议1.0，并保留基线根字段及稳定ID；reporter/非里程碑ID是已有扩展，接收器可以提示并忽略，不能宣称严格1.0 schema通过。

Morii另行明确要求清理已合并分支/工作树、过时构建与临时文件。检查精确路径、Git归属、进程占用和证据用途后再删；保留最新候选、最新兼容验证程序、日志/截图/报告、`.claude/`与未提交资料。Codex会话/统计源、Activity/Usage账本和采集任务不在构建清理范围。清理后才启动后续会话，避免与构建并发。

## R1：ADR146兼容采用，新会话第一片

Morii在本轮梳理后要求按路线开新会话继续工作；据此先实施最小兼容采用，不等待整个Memory交付。读[集成配方](../MEMORY_INTEGRATION_v1.md)、Memory当前已合并RUNTIME.md、runtime-surface manifest及实际源码，确认包含ADR146的最小合适已合并revision。主线有新增变化时先审范围，不机械追最新，不采用未合并分支。

按既有模式同步精确Git pin、锁文件和aggregate；不引入path依赖、branch、patch，不扩张UI/Morii权限，不改Memory领域代码。此前eb70509采用已经完成，无需重做。

完成条件：revision/aggregate一致，相关消费者及ADR146兼容路径有针对性证据。按集成配方执行必要检查，必须含`node scripts/check-memory-integration.mjs`；其他检查按实际风险，不默认21模式/全套截图/打安装包。记录失败、忽略及未覆盖范围。验证后提交、推送、开PR，按Runtime既有授权合并，保留Codex co-author trailer。此切片不交付个人库或新安装包。

## M：Memory交付，可与R1并行

另一仓库/会话收束#110/#112/#113及组合验证，遵守其合并门槛，再按已有真实资料授权推进完整纯文本Plan/journal容量、真实形成、关闭重开、查询/精确来源、独立备份恢复。最新方向是文字Raw和来源保留、附件metadata_only，不恢复旧185候选或重启全量分析。Runtime只核对工程revision、根类型、契约和验收结果，不打开私人原文、Vault或备份。

Memory形成库及领域契约；Runtime采用兼容Core并提供Windows客户端。云端、ChatGPT采集、长期读取授权、自动写入与离线同步不属于R1或首个只读入口的默认范围。

## R2：正式Morii首个入口

最小只读接入已采用现有 Memory 原生 CLI/启动器认证边界，完成目录、来源、锁定/跨进程重开与壳层一致状态；不新增页面认证工具、图形目录选择或读取/写入授权。合成接入结果不替代 M 的真实库工程交付与 UI 验收。

## R3：新候选与日用验收

接入完成、Memory交付契约明确后，按验收配方生成新候选，记录源码与pin。[只读验收准备](../RUNTIME_MORII_READONLY_ACCEPTANCE_2026-11-17.md)已区分旧Workspace步骤与新Morii入口，[旧人工指南](../RUNTIME_ACCEPTANCE_GUIDE_2026-11-08.md)顶部提供分流，不直接复制旧第6/9步。候选和代理实测的最新结果见本文顶部；真实库的 Morii 人工验收仍待执行。

11月17日核对公共 Memory main `d0e7f9f`：#110/#112/#113/#114/#115/#116 已进入主线；新增初始化标题投影与准备性能变化不涉及 reader/格式/Runtime surface，本片不追最新 pin。公共交付路线仍是11月16日计划，未提供真实整轮形成与独立恢复的 ready 证明；只记录“待 Memory 交付工程摘要”，不从 PR 合并推断真实库完成。

PR184/185/186 已分别合并壳层状态、验收分流与[登记空范围文案修正](../validation/Registered-morii-empty-state-2026-11-17.md)。[三语最小窗口观察](../validation/Registered-morii-minimum-layout-2026-11-17.md)复用 PR184 程序核对 1100×700 的 Home/Settings/Memory，未复现新徽标遮挡，不增加样式改动；它不是 HEAD 全套原生复验。下一有效出口为 Memory 的真实交付工程摘要，再核对候选生成条件，不重做已通过检查维持进度。

### 11月17日跨会话接续：准入通过，容量未通过

Morii 明确要求查看并协调隔壁“推进 Memory 纯文本新库交付”。已核对该会话最新工程进度和公共 main：

- PR117 / ADR149 已按该会话收到的明确授权合并至 `17a369e010f670baacaeec98306854fd4d14afc5`。`AdmissionInput.support_origin_groups` 保留重复文字的全部原始出现，并记录同一支持来源分组；旧 `a543c1e` 的封闭读取器可能拒绝这些持久决策，**必须先完成兼容采用才能打开此类新库**。新 aggregate 为 `df3248e725f92952d0be265092babd5dbdbe6fec642720a0c400c71cbd9e7e53`，Workspace 仍为61命令。公共依据为该 revision 的 `docs/integration/RUNTIME.md` 与 `docs/validation/Grouped-support-origins.md`。
- 隔壁已从合并主线重建 CLI，原始全量清单 **43计划 / 351记录**通过准入检查；容量预检报告 queued journal **21,793,549字节**、lifecycle bound **30,865,623字节**，超过 **16,777,216字节（16 MiB）**。这是该会话提供的工程摘要，Runtime 未读取私人清单或自行重跑；尚未 bootstrap / 创建真实 Vault，形成、重开/来源、独立恢复仍未完成，也没有 ready、grant 或新候选。
- Memory 确认主人已明确授权紧凑 journal 的最小 ADR、合成实现和 PR：仅新 fresh 运行将不可变计划移入既有 hash-bound Raw，可变日志保持16 MiB及原 request/response/key/binding/receipt/state，旧日志原样读取；不删源、截断或抬预算。该片 [PR118](https://github.com/Morii9961/enouia-memory/pull/118) / ADR150 已获主人批准并合并至 `506d23dc174a3e927d323f8f8d0b8ecfc9d1726d`；原审阅 head 为 `53a60cdd430fa4f9b848315702579cd6f8b0b183`。仅采用正式合并版本，不采用原候选 pin。
- 候选 PR 的公开说明确认仅 initializer 私有 journal v2 改变；原生 decisions/reader/admission、Morii backup格式、61命令及 aggregate 均不变。现有备份保留同路径 journal 和全部 Raw，新 fresh 工具负责验证计划对象；旧 fresh 程序不能接续 journal v2。Runtime 仍只需 ADR149 的 reader 门槛，没有额外 reader 门槛。
- 上游报告77项 initializer 合成检查（含显式 Windows 账户 CLI bootstrap/restore）和严格 Clippy 通过。1024记录合成轮次 inline lifecycle为39,841,194字节，compact mutable为11,497,570字节，最大单Plan Raw为3,482,650字节，仍分别受16 MiB约束，超大mutable仍拒绝。这不是原始真实清单的新容量结果，Runtime 未重跑这些上游检查；真实清单仍只有17a369e的容量拒绝证据。
- Runtime 按已协调分工采用正式 `506d23d` / aggregate `df3248e7…` / 61命令，见[采用证据](../validation/Memory-pin-506d23d-2026-11-17.md)。此次兼容采用与 Memory 正式CLI重建/全量预检并行，不必等待真实形成和恢复全部结束；生产候选和个人UI验收仍等实际ready。只交换工程摘要，不传原文、私人路径、登记参数或凭据。

此次协调不改现有 pin、读取授权、个人库接入、安装或部署边界，也不更新手动状态快照。

此前具体采用准备（当时未执行 pin 变更或产品测试；本次正式采用结果见上方证据）：

1. 最终版本须同时核对六个 Cargo Git 依赖、九个 lock source 与 `memory-pin.json` 的 revision/aggregate；不按中间 aggregate 直接构建生产候选。
2. 本地 `memory_catalog/fixture.rs` 与 `memory_automation/fixture.rs` 从既有 JSON 反序列化 `AdmissionInput`，没有需要补字段的 Rust 结构体字面量。新字段 default/空值省略保留旧输入行为，不为兼容而给旧合成来源编造分组。
3. 生产目录详情/来源调用现有 System reader 并序列化其完整返回值，没有 Runtime 重建持久 AdmissionInput 的中间层；现有前端只展示授权记录数和各自引文，不声称引文数是独立佐证数。采用时保持这个边界。
4. 针对最终 pin 运行集成配方中的相关消费者/原生读取检查及必须的 Memory surface 守卫；新增证据应覆盖 grouped decision 的原生重放、同根读取及两个原始精确来源，旧输入/权限拒绝保持原义。Memory 已有合成分组回归可作对照，不把其118项结果记成 Runtime HEAD 已执行。

补安装/托盘/热键/登录启动及真实工作流未完成项。个人库由Morii在批准入口接入；实际安装、Provider、部署遵守各自边界。没有新问题不重复已有有效矩阵。首版之后另排星图及云端能力。

## R4：原有界面接入真实库（2026-11-19 排期）

Morii 2026-11-19 要求：交接任务完成后新开会话，把 Runtime 原有界面全部接到真实库上；全部完成后一次性验收。R3 的人工回执并入 R4 最终验收，不再单独安排。

现状：已登记只读入口只开放原生目录（列表、检索、统计、详情、精确引文、锁定）。Home 迹线与摘要、Memory 五个工作区（记忆格、时间线、关联与星图、形成、召回实验）、Context、Sessions、Quick Search 和 Inspector 的记忆读数，仍走旧 Workspace v1 接口或标“虚构”的演示数据。缺口清单见 [后端缺口报告](../design/ui-v2/backend/01-BACKEND_GAPS.md)（G01–G24，核对基线为 10 月 26 日的 Memory `c9bf1be`，需按现行 pin 复核）。

| 步骤 | 内容 | 负责 | 前提 |
| --- | --- | --- | --- |
| R4.0 | 按现行 pin 与真实库现状复核 G01–G24：哪些已由 read-2 满足（字面检索、主题/实体/项目筛选、统计、短标题），哪些仍缺；产出逐界面的数据需求表，交 Memory 排期 | Runtime 会话 | 无 |
| R4.1 | 先接 read-2 已能覆盖的部分：记忆格/列表的筛选与计数、详情与来源抽屉、Home 读数、Quick Search 检索登记库、Inspector 记忆读数；登记模式下这些界面改读真实目录，不再显示虚构数据 | Runtime | 无 |
| M-R4 | 新格式补齐只读投影：时间分桶与覆盖日历（G03）、全库图投影与带类型的边（G04/G05）、形成活动流与变更游标（G07/G13）、会话/轮次与跳回 Sessions（G14）、冲突组与修订差异（G15）、有效敏感度与“为什么形成”（G16/G19）、全库统计（G23）、Context 改走新格式（G22） | Memory 会话，各项自带 ADR、合成验证与 PR | Memory 自行排期 |
| R4.2 | 每交付一项 Memory 能力，就升级 pin，把对应界面从演示或旧接口切换到真实库：时间线与覆盖日历、星图与关联、形成视图、Sessions 与 Context 读取、召回实验的真实一栏 | Runtime | 对应 M-R4 项合并 |
| R4.3 | 写入与日常使用：纠正、撤回、保护、遗忘（G08，已完成，ADR-039）；日常记忆改由 ChatGPT 经远程 MCP 提炼、Memory 校验入库（B 新方向，C 取消）；Claude Code / Codex 本地 MCP（D） | Memory + Runtime | Morii 已授权 A、B、D（2026-11-21）；B 真实接通另需 VPS 部署授权 |
| R4.4 | 迁移到统一存放目录后改用新登记入口；读取策略续期 | Memory 切片 → Runtime 采用 | Memory 迁移切片 |
| R4.5 | 新候选与一次性验收：全部界面在真实库上的回执，与安装、升级、托盘、热键、登录启动分别记录 | Runtime + Morii | 以上完成；安装类仍需授权 |

2026-11-19 R4.0：[缺口复核与逐界面数据需求表](R4_SURFACE_DATA_NEEDS_2026-11-19.md)显示现行 pin `368634b` 已含 G03–G07、G13–G16、G19、G23 的只读端口，R4.1/R4.2 的大部分界面不需升级 pin，只需 Runtime 转发；Memory 侧只剩 G22 只读召回预览（阻塞 Context 与召回实验）及读取窗口续期，清单已交 Memory 会话。

2026-11-19 R4.1：[登记模式界面接入真实目录](../validation/R4-1-registered-surfaces-2026-11-19.md)——记忆格 / 列表筛选与分面计数、详情、时间、关联、形成、Sessions、Home、Quick Search 与 Inspector 读数改读真实库；原生合成 33/33 与 42/42，真实库桌面走查 19/19。仍缺 Context 与召回实验（等 Memory 的只读召回预览）。写入、Provider、MCP、迁移的授权门槛见[一页汇总](R4_AUTHORIZATION_GATES_2026-11-19.md)。

2026-11-19 R4.2：Memory #125（ADR-MEM-152）交付 G22 后，pin 升至 `009b7bc`，[Context 与召回实验接入真实库](../validation/R4-2-recall-preview-009b7bc-2026-11-19.md)（原生合成 34/34、42/42，真实库走查 20/20）。至此 R4.0–R4.2 的只读界面全部改读真实库；R4.3/R4.4 等待授权，R4.5 从 main 打候选。

2026-11-23 深夜：R5 完成——[界面缺口清单](R5_SURFACE_GAPS_2026-11-23.md)第一类十一项全部做完，并接入 Memory ADR-MEM-171 至 175（人物与地点、Capsule 默认关闭、ChatGPT 主题标注、连接器授权、会话时间）；[候选](../validation/R5-candidate-839e34d-2026-11-23.md)改为 `839e34d`（pin `ca76892`；模板 26/26、合成 41/41 与 42/42、真实库只读走查 29/29），`4fd0e92` 作废。周末事项见[一页汇总](R5_MORII_DECISIONS_2026-11-23.md)。

2026-11-23 夜：按 Morii 的选择接入 Memory ADR-MEM-170，pin 升至 `512ad0c`，Settings 登记的 Agent 授权自动纳入新窗口与来源（上限与到期不变、可撤销）；[候选](../validation/R4-candidate-4fd0e92-2026-11-23.md)改为 `4fd0e92`（模板 26/26、合成 41/41 与 42/42、真实库只读走查 15/15），`1ab7a89` 作废。

2026-11-23 晚：Memory ADR-MEM-167–169 合并后，pin 升至 `bc39dc9`，Settings 显示 Agent 授权覆盖并按 Memory 补全计划“纳入新来源”，同一 Agent 最多 4 个会话同时连接；[候选](../validation/R4-candidate-1ab7a89-2026-11-23.md)改为 `1ab7a89`（模板 26/26、合成 41/41 与 42/42、真实库只读走查 15/15），`73983bd` 作废。

2026-11-23：门槛 A、B（显示部分）、D 接入完成后，[候选](../validation/R4-candidate-73983bd-2026-11-23.md)从 main `73983bd`（pin `29cbe8d`）重建：模板 26/26、合成 40/40 与 42/42、候选程序真实库只读走查 15/15（CURRENT 440 不变）；`884c015` 作废。新增验收步骤 16–18（Agent 请求队列、值得回看、Claude Code / Codex 经 MCP 接入）；ChatGPT 真实连接待域名。

2026-11-19 晚：Memory #127（ADR-MEM-153/154）合并后，pin 升至 `f9ac21d`，登记入口改为全历史读取，数据区已迁到统一目录（启动只换 home）；[候选](../validation/R4-5-candidate-2026-11-19.md)改从 main `884c015` 重建（模板 26/26、合成 34/34 与 42/42、新 home 真实库走查 20/20），`218df03` 作废。

2026-11-19 R4.5：从 main `218df03` 构建[候选](../validation/R4-5-candidate-2026-11-19.md)（NSIS 模板 26/26、合成 34/34 与 42/42、候选程序真实库走查 20/20），Morii 按[一次性验收指南](../RUNTIME_R4_ACCEPTANCE_2026-11-19.md)验收；R3 的人工回执并入该指南。

2026-11-21 R4.3：A 已合并（[确认后写入](../validation/R4-3a-confirmed-corrections-2026-11-21.md)，pin `f7c2a81`，真实库只做过不确认的计划）。Morii 决定日常记忆“改成 ChatGPT 提炼”：C（Provider / Mock）取消；B 改为 ChatGPT 通过远程 MCP 采集并提炼、Memory 校验入库，Runtime 待 Memory 写入工具交付后升级 pin 并显示提炼记忆、来源标注、只读的 ChatGPT 会话和连接器状态；此前的桌面输入框 + Mock 方案放弃、未合并。D 的 Claude Code / Codex 本地 MCP 按原默认值与 Memory 协调推进。详见[授权门槛](R4_AUTHORIZATION_GATES_2026-11-19.md)。

规则：每个界面接入前后都要有合成验证；只有在原生程序里对真实库实际读通后，才去掉“虚构”标识。界面与 Memory 契约冲突时，以 Memory 为准。Runtime 不自行实现 Memory 领域逻辑。读取窗口 2026-11-24 到期，最终验收前需由 Memory 续期。

## 排期和待决定项

首个新库桌面可用版暂留2–4周，低置信度：Memory约2–5有效工作日、Runtime采用/最小入口约3–7日、候选反馈约2–5日，部分并行。Memory侧1–2工作周是乐观口径；容量和入口未落地前不承诺日期。此预算不是测得进度、Morii认可评分或完整云端完工预测，JSON进度保持null。

待决定：是否扩展图形Morii入口/其他表面、Windows环境、星图视觉/首版门槛、公开人设默认及Memory契约§5、合成枚举/时间翻译、必要时改键入口。Runtime自动合并授权不能扩大到Memory待审PR、个人库、安装/部署、真实读取授权或Provider。

R1/R2 和 R3 的最新证据见本文顶部；R3 接续 Morii 人工验收及其余待决定项。跨仓库优先读取公共交接和已有审计结果，不创建重复Memory实现任务。手动状态快照仅在Morii要求时更新。

本次兼容采用后的接续点：reader门槛已在新源码中满足，旧安装候选仍无该能力。Memory负责新版本真实整轮容量及后续形成/恢复工程摘要，Runtime不自行读取私人输入，也不把本片合成验证写成真实ready。手动状态快照保持原基线。

### 正式506d23d的真实容量检查点

隔壁“推进 Memory 纯文本新库交付”随后报告，正式CLI与只读验收程序已重建，原始完整清单容量预检通过：**43计划 / 351记录 / 2,149个选入来源**全部保留；queued journal **62,174字节**，可变journal生命周期上界 **9,134,248字节**，最大Plan对象 **674,906字节**，分别低于16 MiB。以上是该会话的工程摘要，Runtime没有打开私人清单、Vault或重新执行预检；保留前述17a369e的失败，不用新的成功改写它。

Memory会话先前报告bootstrap拒绝涉及目录ACL继承和既有标识缺少状态字段，随后使用同一操作创建并登记Vault。11月18日确认原运行已提交 **3条**，剩余 **348条** 排队，原生流程在第二批来源捕获完成前返回 `fresh.step: Denied`。原journal、packet、key和回执保留，拒绝原因由Memory调查。形成、重开与精确来源验收、独立恢复仍待证据。PR190已满足Runtime读取端的兼容要求，R3生产候选等待交付。

随后 Memory [PR119](https://github.com/Morii9961/enouia-memory/pull/119) 合并于 `afefa61`，修复跨批引用重复分配来源身份，并提供原运行的续跑准备。Memory 会话报告全量预检通过，仍覆盖 43 批、351 条记录和 2,149 个选入来源，日志生命周期上界为 9,134,248 字节。续跑准备保留 3 个原回执，Vault 仍在第 7 个提交。剩余记录已用同一清单和登记操作开始续跑，形成结果、重开与来源验收及隔离恢复待其交付。

已比对 `afefa61` 的公共集成说明与 surface manifest。ADR151 只修改 initializer，现有 `506d23d` pin 可读其形成结果。Runtime 最近完成目录导航、WebView2 合成冒烟 23/23 和检查器状态修复，R3 验收沿用[只读指南](../RUNTIME_MORII_READONLY_ACCEPTANCE_2026-11-17.md)。
