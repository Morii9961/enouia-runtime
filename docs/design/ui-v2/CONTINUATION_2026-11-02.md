# Runtime UI v2 · 2026-11-01–02 接续

## 代码位置与证据范围

本地分支 `codex/native-home-time-structure` 从 PR #112 的合并提交 `d0208eb` 开始。本页记录本分支开发证据，不声称远端没有更新。以下提交均未推送、开 PR 或合并；没有生成新的原生可执行文件或安装包。

当前已验证的本地代码基线为 `147f0d6`，共18个功能/修复切片。本轮只修改前端呈现、合成场景及交接记录；未改 Memory pin、Rust/native shell、安装器或正式项目状态快照。新增截图都是带 `FICTIONAL FIXTURE · NO NATIVE CONNECTION` 水印的隔离浏览器 fixture，不是原生或人工验收。

## 已完成切片

| 本地提交 | 改动与证据 |
| --- | --- |
| `cde091c` | Home 大时刻、记录纸、四注记及日历；只标实际最新 Vault 提交。[验证](../../validation/UI-v2-native-home-2026-11-01.md) |
| `d1dd29d` | Sessions 保存事件时间尺、按已知时间的间距及加载转录地图；未知/倒序时间停用地图。[验证](../../validation/UI-v2-native-sessions-2026-11-01.md) |
| `5f4fc9b` | Inspector 左侧组件选择、顶部观察摘要及右侧详情；切换不重建读取/操作 owner。[验证](../../validation/UI-v2-native-inspector-2026-11-01.md) |
| `62a649f` | 主导航固定测试挂钩与本地化可访问名称分开，修正两处 smoke 选择器。[验证](../../validation/UI-v2-native-nav-2026-11-01.md) |
| `4619c64` | Context 当前保存 Capsule 分区导航、三栏与实际预算单段刻度。[验证](../../validation/UI-v2-native-context-2026-11-01.md) |
| `b7a8225` | Sessions/Context 有内容分支的24项界面文案三语化，保存内容保留原样。[验证](../../validation/UI-v2-native-loaded-copy-2026-11-01.md) |
| `bea7f1d` | 原生 Settings 动效说明描述已有的日历/转录平移。[验证](../../validation/UI-v2-native-settings-copy-2026-11-01.md) |
| `365189d` | 保存记忆按当前语言显示日期，稳定分组键保留行节点与焦点。[验证](../../validation/UI-v2-native-memory-dates-2026-11-01.md) |
| `d045096` | 按已保存 `covered_event_ids` 显示检查点覆盖，连续可见段分别画括号，页外只计数。[源码与验证](../../validation/UI-v2-native-session-coverage-2026-11-01.md) |
| `b275ed1` | 记忆行显示已保存标题、逻辑项目 ID、证据引用数；检索不借列表标题。[源码与验证](../../validation/UI-v2-native-memory-metadata-2026-11-01.md) |
| `6b825f0` | Provider 设置、授权和待审请求完整句子三语化；切换语言不改变持有请求或多发请求。[验证](../../validation/UI-v2-native-provider-copy-2026-11-02.md) |
| `b19accd` | 来源提取范围、待审请求和暂停说明三语化；保留模型/范围归属。[验证](../../validation/UI-v2-native-extraction-copy-2026-11-02.md) |
| `8651b26` | 已保存建议的标签、数量与队列状态三语化；切换语言保留正在恢复的任务归属。[验证](../../validation/UI-v2-native-suggestion-copy-2026-11-02.md) |
| `03fcc2d` | 候选上下文依赖的证据/完整性边界、冲突数与等待提示三语化；保留已读来源。[验证](../../validation/UI-v2-native-candidate-copy-2026-11-02.md) |
| `2614f6f` | 导入恢复、重复提示和 Vault 作用范围三语化；保留草稿/焦点与操作归属。[验证](../../validation/UI-v2-native-import-recovery-copy-2026-11-02.md) |
| `347230e` | Memory 集合分组使用稳定集合 ID，修复语言切换后左侧按钮重建/焦点丢失。[失败复现与验证](../../validation/UI-v2-native-memory-nav-focus-2026-11-02.md) |
| `7f15d8c` | 历史任务观察视图的定义、批次顺序/数量及额度三语化；保留原批次会话链接。[验证](../../validation/UI-v2-native-history-task-copy-2026-11-02.md) |
| `147f0d6` | 保存批次结果、来源/时间与恢复说明三语化；保留原引文、确认勾选和焦点。[验证](../../validation/UI-v2-native-history-result-copy-2026-11-02.md) |

最近一次完整前端检查：Node 134通过、3跳过、0失败；DOM 86场景/1235项断言通过。`npm test` 已内含 DOM；build 内含类型检查，主 JS 451.24 kB。两个根检查通过，pin 一致、桌面 Activity/Usage 退役边界保留。各片原始数字、失败与必要重跑、截图范围见各自 validation；没有把历史原生测试计入本轮。

浏览器语言驱动曾重复导入 Vite 热更新后的 i18n 模块，旧的单一 `html lang` 条件不足以证明页面刷新。已修正并以实际可见译文重跑日期12组、行元数据12组、Provider18组及新增Vault12组，见[证据补正](../../validation/UI-v2-browser-language-harness-2026-11-02.md)。产品的 DOM 场景使用同一模块，不受该驱动问题影响。

## 不能据此宣称完成的内容

- **全设计保真**：Home 没有连续真实迹线或最近 Capsule/会话/检查点摘要；Memory 没有全库项目/种类/来源分类；Context 没有完整 Capsule 索引。不能用当前一页记录冒充全库，也不能用生成内容填空。
- **新 Memory 能力**：[pin](../../integration/memory-pin.json) 仍是 `bf6bfd10bf3c870ae2ce7ceb5c6bd635b08bf327`，常规记忆/Context/Sessions 使用 Workspace IPC v1 / schema 1 / 58命令。MemoryListArgs / SearchArgs 拒绝未知筛选字段；行字段与检查点覆盖的依据已记录在上表链接。本轮没有采用或读取 Owner Vault。
- **既有隔离自动记忆入口**：Memory 左栏另有已合入的 `AutomaticMemory`，走独立 `memory_automation` / `memory-native-read-1`，请求封装 schema 2；它只接受显式 `--memory-synthetic` 的隔离样本绑定，生产采用未激活，见[原 ADR](../../adr/037-synthetic-native-memory-adoption.md)与[集成协议](../../MEMORY_INTEGRATION_v1.md)。这不是浏览器15条设计预览，也不是新 Owner Vault 的采用。本轮未改动该能力、启动模式或读取边界。
- **正式可用/验收**：原生 WebView2/DPI/Narrator、物理托盘、默认 Ctrl+Alt+M、真实安装/升级、真实登录启动、个人数据/Provider 及 owner 验收均没有由本轮证实。既有候选包与旧原生报告只适用于原 revision。
- **全部文案或性能**：未标记的动态分支仍需逐项检查；#24 的5,000条深色球体/聚类性能缺口仍在，不以小规模截图代替测量。

## 后续顺序与授权边界

1. 在当前前端范围继续检查已保存内容、等待/失败与恢复分支，保留保存字节、草稿、焦点及操作归属；每片记录实际验证，不把字典覆盖当成全应用无英文。
2. 汇总本地切片供 owner 审阅。推送、PR 与合并没有在本轮执行；按照 HANDOFF 的发布边界另获授权后进行。
3. 原生候选刷新和 Windows 实际验收、Memory pin/适配器集成各自作为明确的新切片。Memory 领域需求转到其仓库；不在 Runtime 冻结 crate 中扩展，不自行采用 Vault 或启用 Provider。

Activity/Usage 界面及桌面命令/grants 已退役（ADR-037）；独立生产者、任务、账本和历史数据不属于本轮清理范围。没有恢复页面、统计卡、占位链接或 tokens.ci 面板。
