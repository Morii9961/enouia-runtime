# 屏幕规格 · UI v2

视觉的每个具体值在根目录 [DESIGN.md](../../../DESIGN.md)；这里只写**有哪些屏幕、每屏放什么、做到了哪一步**。截图在 [shots/](shots/)（虚构演示数据；`dark-*` 黛蓝、`light-*` 宣纸）。

状态图例：

| 标记 | 含义 |
| --- | --- |
| **已做** | 浏览器演示里已按 DESIGN.md 画好，有截图；实现时照着做 |
| **部分** | 有一部分，缺的写在「缺」里；缺的部分要先设计 |
| **未做** | 还没有设计稿；先在浏览器演示里用虚构数据设计、截图、过 `docs/design-kit/critique.md`，再实现 |
| **需后端** | 只能做成标明的合成预览；真实数据要等 Memory 仓库交付契约（见 Memory 交接包 `CONTRACT_READINESS.md`） |

## 数据与预览边界

1. **当前 pin 的常规能力**：`docs/integration/memory-pin.json` 固定的 Memory Workspace `0d338f12f51a859363e0725071bcf43874b492c7`，Workspace IPC v1 / schema 1 / 58 命令。常规记忆列表/审阅、Context 与 Sessions 使用该契约，仍是 owner 审阅语义；本轮没有升级 pin 或采用新的 Owner Vault。
2. **合成预览**：「Automatic memory · synthetic preview」，只在浏览器演示（`connected === false`）里出现，固定标「Synthetic preview · not running」，原始数据是 `screens/automemory/fixture.ts` 的 15 条虚构记忆，另有 `state-fixtures.ts` / `dataset.ts` 的六种状态示例（`auto-dataset` URL 参数），原始 fixture 不改。不调用 IPC、不写存储。
3. **既有隔离原生样本**：左栏「Synthetic automatic memories」是已合入的 `memory/AutomaticMemory.tsx`，使用独立 `memory_automation` / `memory-native-read-1`，只服务显式 `--memory-synthetic` 创建的隔离样本。它的 schema-2 请求封装与原生样本不代表生产采用，见[原 ADR](../../adr/037-synthetic-native-memory-adoption.md)。本轮未修改或启动该模式。
4. **以后的受控采用**：Memory 仓库交付生产自动化契约后，由指定的集成负责人一次一处地采用真实数据（Memory UI 规格 §11 的 UI-D / UI-E）。失败或未激活时不得静默回退到浏览器演示；既有隔离原生样本始终保留其合成标签与独立边界。

## 0. 通用骨架（所有主窗口屏幕）

| 部件 | 规格 | 状态 | 接口挂钩（不能改名） |
| --- | --- | --- | --- |
| 标题栏 34px | logo（笔迹 + 笔尖）· ENOUIA RUNTIME · 「Negative No. 40 · week of …」· 当前页名；右侧反相小牌「DEMO · LOCAL ONLY」（原生里写已连接状态）、最小化/最大化/关闭 | 已做 | `.qr227` `.qr222`；`data-tauri-drag-region` |
| 记录带 80px | 头 34px：`<nav aria-label="Primary">` 6 个按钮（`1 HOME` … `6 SETTINGS`，Settings 前有分隔），当前项 `aria-current="page"` 反相；右侧周与 demo 时钟。图 46px：7 日列、笔迹、写入记号、笔尖 | 已做 | `nav[data-runtime-nav="primary"]` / `button[data-runtime-page]`；aria-label 本地化；Ctrl+1…6；↑↓ 在导航内移动焦点 |
| 时间小地图 20px | 只在 Home、Sessions、自动记忆 Timeline；◂ / ▸ 按钮、可拖动取景框（`role="slider"`，← → / PageUp / PageDown / Home / End）、范围读数、NOW | 已做 | `theme/TimeMap.tsx`、`theme/timeview.ts`（平移状态不进 App state、不持久化） |
| 跳到内容 | 第一个 Tab 停在「Skip to current surface」 | 已做 | `.runtime-skip-link` |
| 焦点 | 2px 墨色实线 + 2px 底色外圈 | 已做 | 截图 `dark-focus-1440` |
| 减少动画 | 系统设置或 Settings「Reduced」 | 已做 | `data-motion="reduced"` |

## 1. 六个主表面

Activity / Usage 界面已于 2026-10-25 移除（决定记录「移除 Activity / Usage 界面」）：不加回导航、页面、统计卡、状态或链接，不做占位页，不加 tokens.ci 面板。[ADR-037](../../adr/037-activity-usage-desktop-retirement.md) 已退役桌面原生命令与 grants；独立生产者、任务和数据保留，不由本轮前端工作清理。

| # | 表面 | `data-screen-label` | 浏览器演示 | 原生 | 截图 |
| --- | --- | --- | --- | --- | --- |
| 1 | Home / Presence | `Home` | 已做 | 部分（2026-11-01 恢复大时刻、记录纸、四注记和日历小地图；仅标示真实最新 Vault 提交，见验证记录） | `dark-home-1440` `dark-home-1100` `light-home-1440` |
| 2 | Memory Vault | `Memory Vault` | 已做 | 部分（2026-11-01 已补保存行字段、三语日期与焦点保持；全库项目/来源分类仍缺，见 §1.2） | `dark-memory-1440` `dark-memory-1100` `dark-memory-candidate-1440` `light-memory-1440` |
| 3 | Context Surface | `Context Surface` | 已做 | 部分（2026-11-01 已补当前保存对象的分区导航与预算刻度；完整 Capsule 索引仍缺，见 §1.3） | `dark-context-1440` |
| 4 | Sessions | `Sessions` | 已做 | 部分（2026-11-01 已补时间尺、加载范围地图与保存检查点覆盖；见 §1.4） | `dark-sessions-1440` `light-sessions-1440` |
| 5 | Runtime Inspector | `Runtime Inspector` | 已做 | 部分（2026-11-01 已补组件导航、观察摘要与右侧详情；切换保留读取/操作归属，见 §1.5） | `dark-runtime-1440` |
| 6 | Settings | `Settings` | 已做 | 部分 | `dark-settings-1440` `light-settings-1440` |

### 1.1 Home

- 首行：「ENOUIA RUNTIME · THURSDAY 1 OCTOBER 2026 · DEMO CLOCK」标签；巨大的时刻「14:44」（DESIGN.md §3），冒号用 `--ink-3`；右侧一句「**Recording.** 9 canonical memories, 3 waiting for your review.」。
- 主图：一次显示 4 天的记录纸，笔迹画到现在，「I'm here.」写在笔尖旁；右侧四条注记（Memory Vault / Context / Current session / Checkpoint），用引线连到笔迹上的时刻，可点击跳到对应表面。
- 底部：一行图例；右侧「LEFT OPEN LAST TIME」两行。
- 时间小地图：整三周，取景框 = 主图显示的 4 天；平移时引线淡出，停稳再出现。
- 状态：Vault 未连接时注记写「Vault adapter not connected」（演示）；锁定见 §1.8。

原生落地（2026-11-01）：设备时钟明确标 UTC+8；纸面/日历只绘制已观察的最新 Vault 提交标记与一条引线，没有连续波形。其余注记是读取入口，不声明已知最近会话、Capsule 或检查点。无库、锁库、切库、退出、读取失败时仍保留首页结构，撤下提交和交互地图。[证据与未完成项](../../validation/UI-v2-native-home-2026-11-01.md)。

### 1.2 Memory Vault（记忆工作区下的 owner 审阅兼容视图）

- 三栏 `220 | 主列表 | 360–400`：左栏「Memory Vault / What I keep, and why.」、字面检索框（写「Literal search」）、REVIEW（Candidate inbox + 数量）、CANONICAL 按种类、PROJECTS、SOURCES。
- 主列表：按天分组，日分隔条 = `--ink-3` 底 + 底色字的大写日期；每行：时刻 · 种类 · 项目 · 正文一行 · 来源/会话/turn/conf；选中行反相；↑↓ 移动。
- Inspector：状态牌（Canonical 反相）、种类、ID + Copy ID、正文、DECISIONS、OPEN LOOPS、WHY I REMEMBER THIS、字段表（Source / Source ID / Session / Turn / Source created / Reviewed from），底部「Edit · creates a revision」与「Demo changes stay in this window · reload resets」。四个裁切角。
- Candidate inbox（`dark-memory-candidate-1440`）：候选行用空心竖块，Inspector 给接受/编辑/拒绝（演示）。
- 缺：Inspector 里过长的 Session ID 越过右侧裁切角（OPEN_ISSUES #8）。

2026-11-01：原生日期标题已随界面语言显示，切换语言保留行节点与焦点；项目/来源导航仍未补造。[验证记录](../../validation/UI-v2-native-memory-dates-2026-11-01.md)。

2026-11-01 后续：根据固定 pin 已有字段，记忆行显示保存标题、逻辑项目 ID 和证据引用数；缺字段不补造，检索不借用列表标题。没有全库分类或项目名称推断。[来源与验证](../../validation/UI-v2-native-memory-metadata-2026-11-01.md)。

2026-11-02：原生集合导航分组使用稳定集合 ID，语言切换保留按钮/焦点；候选依赖、导入恢复、Vault 作用范围，以及历史规划/表单/任务/请求/保存结果文案继续接入三语。浏览器示例集合导航也保留语言切换焦点。原保存内容、确认与操作归属保留，见[接续记录](CONTINUATION_2026-11-02.md)。其他动态分支仍需检查，不代表全部文案或 Windows 验收完成。

### 1.3 Context Surface

- 一次召回的 Capsule：纳入/排除列表，每项 rank、reason、字节、来源可达；展开看 trace。预算条只用墨色阶。
- 这是**旧 pin 的召回解释**（Memory UI 规格 §8「已保存召回的解释」）的演示版。不显示可调权重或逐项评分。

2026-11-01：原生 Context 已恢复当前保存对象的三栏分区导航、实际预算单段刻度、纳入/排除表格与 dispatch 检查；没有完整 Capsule 列表或未知分类。未知/零上限预算不画比例，超限保留原数值。[验证与限制](../../validation/UI-v2-native-context-2026-11-01.md)。

### 1.4 Sessions

- 左：会话列表；中：转录，行距按真实时间间隔，左侧时间尺，`You` / `Enouia` 角色标签，检查点 = 墨色竖括号 + 反相标签，写入在行尾标注；右：会话信息。时间小地图覆盖整段会话。

原生落地（2026-11-01）：已保存事件时间尺、2px/分钟（上限48px）间距、检查点事件括号与本次加载范围的时间地图已移植。正文顺序、草稿和显式读取保持原语义；未知/倒序时间停用地图，不画未知覆盖区间。见[验证与边界](../../validation/UI-v2-native-sessions-2026-11-01.md)。

2026-11-01 后续：复核固定 pin 源码后，已用 `covered_event_ids` 增加保存检查点覆盖选择与分段括号，页外事件不画延伸；不是根据时间或创建事件猜测覆盖。[验证与来源](../../validation/UI-v2-native-session-coverage-2026-11-01.md)。

### 1.5 Runtime Inspector

- 浏览器演示：顶部一行契约读数（memory / session / capsule / core ipc / schemaVersion / mutation result / toolchain）；左：组件列表（Core、Vault、Index、Context Compiler、Provider、Gateway），状态用竖块形状；右：选中组件的 STATE / VERIFICATION / NOT YET / HEALTH。内容是文档参考，不是实时探测（`dark-runtime-1440`）。
- 原生：「Observed component status」——Memory Core（Vault、最新提交、运行中的操作、待审候选、组件健康）、Memory 操作列表与详情、Windows shell（生命周期、托盘、Quick Search 热键、主窗口）。每块有「Read … again」，失败时清掉旧观察。没有 Activity 一节。
- 原生 Memory 里另有 main 带来的视图，外观只继承 `.mem-*` 换皮、还没有专门设计：历史任务（计划、批次、结果、比较、简报）、Provider 配置草稿与设置状态、导入报告、「Synthetic automatic memories」集合。它们归入 §3 的「形成」「召回」工作区一起设计。

2026-11-01：原生 Inspector 已恢复左侧三组件选择、顶部观察摘要和右侧详情；切换保持观察 owner 与待返回请求。内容仍来自原有显式观察，不抄录演示的虚构验证状态。[验证记录](../../validation/UI-v2-native-inspector-2026-11-01.md)。

### 1.6 Settings

- APPEARANCE：Motion（Follow system / Reduced）；Theme（陈述句「Tile Blue when the system is dark, Xuan Paper when it is light.」+「NEGATIVE」）。
- VAULT：Location、Identity files（原生里换成 Memory 设置与 Windows shell 设置）。底部一行键盘说明「Ctrl+1–6 switches surfaces」。
- 缺：Vault 与恢复的管理入口（Memory UI 规格 §1 把它放在设置/管理）；高级召回参数分层（ref-05，只借「普通/高级分层」，不做前端凭据输入）——**未做**。

2026-11-01：原生 Settings 动效说明只描述现有的日历/转录平移，不再承诺绘制连续迹线；浏览器演示说明保留。[检查记录](../../validation/UI-v2-native-settings-copy-2026-11-01.md)。

2026-11-02：共享动效选项按 `system/reduced` 偏好 ID 保持节点，语言切换保留 Reduced 状态和焦点；没有改变动效值或系统设置。[验证记录](../../validation/UI-v2-shared-language-focus-2026-11-02.md)。

### 1.7 原生门：Vault 锁定 / 未连接

- `dark-edge-vaultlocked-1440`：记录带与小地图盖斜线，「NO STRIP LOADED · Vault locked」+ 门卡片（显式解锁，不自动开库）。已做（通过截图桩渲染真实组件）。

## 2. Quick Search（独立窗口 560×420）

- 顶部 56px 装饰迹线（笔色，纯 CSS）；「Quick Search」+「Approved Memory · read only」；下划线输入框 + 反相「Search」；结果行 = 状态竖块 + `current` 标签 + 片段；底部「Esc to close · cleared when hidden」与「Open main window」。
- 已做：空 / 结果 / 无结果三态（截图 `dark-overlay-results-560`、`light-overlay-results-560`；空与无结果在 `.design`）。
- 缺：没有「虚构/真实」标注（原生里本来显示真实记忆；OPEN_ISSUES #11）。

## 3. Memory 区域的五个工作区

Memory UI 规格 §1 把 Memory 内部分成五个工作区。浏览器现以五区二级导航组织；记忆下包含 grid 与旧 Vault 主人审阅兼容列表（无演示 URL 时保留列表默认入口），旧左栏预览入口已撤下。时间 / 关联 / 形成 / 召回使用显式合成预览，和 grid 共用选择及 Inspector；关联包含 constellation / star map 两个子视图。原生 MemorySurface 仍用现有 pin 和独立合成入口，不以虚构五区替代真实契约。见 [#13 验证](../../validation/UI-v2-memory-workspaces-2026-11-04.md)。

| 工作区 | Morii 的问题 | 现在有的（合成预览） | 缺（先设计） | 参考 | 真实数据 |
| --- | --- | --- | --- | --- | --- |
| 记忆 | 现在留下了什么？ | 卡片/列表共用接收时间排序、选择与 Inspector；标题/短陈述/种类/叙事状态/时间语义；字面检索、类型、状态、建议主题交集筛选，明确仅当前加载样本，见 [验证](../../validation/UI-v2-memory-list-filters-2026-11-05.md) | 标签筛选需有对应数据定义；收藏/钉住只做设计样例 | ref-01 | 真实分页/全库 facets 仍需独立集成 |
| 时间 | 那段时间发生了什么？ | 默认月 → 日 → 当天记忆，月份侧边定位；月份精度/范围/未知独立分组；共享选择与 Inspector，时间小地图跟随月份；主题泳道保留切换；[覆盖日历](../../validation/UI-v2-coverage-calendar-2026-11-05.md)用独立材料、暂存/采用图层与可见计数口径，缺材料集合时不显示零。见 [月／日验证](../../validation/UI-v2-month-day-preview-2026-11-05.md) | 天/周/月缩放；端点有证据、未知用开放端帽、离散证据点连虚线 | ref-02、ref-06、ref-08、ref-09 | pin 已有授权时间分桶；Runtime 未接入，真实数据仍需独立集成 |
| 关联 | 哪些经历相互关联？ | Constellation：选中对象的有界邻域，五种关系线型 + 图例，`+ / − / Reset`，并列关系列表；生成星图保留三种布局与侧栏；[替代链/证据链](../../validation/UI-v2-lineage-2026-11-05.md)展示已加载显式关系、原文摘录、独立的生成依赖与未提供收据 | 真实授权图投影的独立接线；节点大小统一（以后编码强度必须可解释） | Memory UI 规格 §6；研究仓库 MemoryConstellations | 需后端（授权聚合投影；不能靠遍历全部正文） |
| 形成 | Enouia 怎样理解与更新？ | Formation 观察流保留；[冲突/修订对照](../../validation/UI-v2-formation-comparison-2026-11-05.md)并列原文与来源，标示字面差异，旧正文仅用独立显式虚构快照，不从注记重建；写入控件仍禁用并说明依赖；[暂存假说列表](../../validation/UI-v2-held-hypotheses-2026-11-05.md)固定叙事 held 子集，逐条保留模型说明、搜索和 Inspector | 导入台仅作旧 pin 兼容；真实冲突/历史正文接线 | ref-03、ref-07 | 真实生命周期、历史正文与写入仍需独立采用 |
| 召回 | 这一刻为什么想起这些？ | Recall lab：两个合成案例的五步管线（资格在排序之前），rank/reason/cost/可达/截断/排除原因；[回看阅读卡](../../validation/UI-v2-recall-suggestions-2026-11-05.md)复用案例原始理由、共享选择，提醒/关闭控件禁用 | 真实建议列表与触发/冷却、稍后提醒/关闭；「保存召回预览」按钮（写入 Capsule，不叫模拟） | ref-04 | 旧 pin 有 `context_preview`（会写入）；建议卡需后端 |

## 4. 十种状态（Memory UI 规格 §9、§11）

| 状态 | 需要看见的说明 | 现状 |
| --- | --- | --- |
| 空库 | 当前没有可读记忆；下一步是什么 | 自动记忆与旧 Vault 浏览器状态均已做；原生另行验收 |
| 仅候选 | 有材料但还没有记忆 | 自动记忆已有仅材料/暂存状态；旧 Vault 已有独立仅导入候选样本 |
| 已确认但冲突 | 哪两条冲突、各自来源 | 部分（Formation 里有冲突事件） |
| 来源缺失 | 哪个证据缺失、可看的还有什么 | 自动记忆浏览器状态集已做 |
| 时间未知 | 哪个时间字段缺失 | 部分（Timeline 的「Time not recorded」） |
| 部分覆盖 | 已加载多少、是否还有分页 | 部分（「Loaded sample only」文字，无分页样子） |
| 被替代 | 替代者、生效时间 | 部分（列表与 Inspector 的 superseded 记号） |
| 锁定 | 没有可读记忆，显式解锁 | 已做 |
| 结果未知 | 操作可能已提交；保留原始包，显式查询恢复，不自动重发 | 浏览器有固定虚构包/键展示，查询明确禁用；不代表原生恢复 |
| 只读模式 | 为什么只读、哪些动作不可用 | 自动记忆浏览器状态集已做 |

另外按规格 §9 还要有：初次载入（不闪成 0 条）、无结果、索引暂不可用、状态读取失败（清除敏感内容）、plan 过期 / revision 冲突（保留草稿）、权限改变 / 删除 / 换库（立即清除面板与派生文本）。这些在原生 `src/memory/*` 里有行为，视觉上只换了皮，没有专门截图。

## 5. 窗口宽度、缩放与键盘

- 1100×700 最小窗口：全部已截图的屏幕不横向溢出、无 <11px 文字（截图脚本的阈值）；12px 下限见 DESIGN.md §3 与 OPEN_ISSUES #9。
- Memory UI 规格建议：≥1280 三栏；900–1279 Inspector 变抽屉；<900 或 200% 缩放单任务页。Runtime 的 1100–1279 按既定决定保持三栏（OPEN_ISSUES #4）。[合成预览窄视口](../../validation/UI-v2-preview-reflow-2026-11-05.md)已做小于 900 CSS px 的纵向阅读与详情往返；等效 200% 布局取证不代表实际缩放验收，[旧 Vault 合成列表](../../validation/UI-v2-vault-reflow-2026-11-05.md)也已做纵向阅读；[Context/Sessions](../../validation/UI-v2-context-session-reflow-2026-11-06.md)保留中央滚动与小地图联动；[Runtime/Settings 合成布局](../../validation/UI-v2-inspector-settings-reflow-2026-11-06.md)也已适配；[Home 合成布局](../../validation/UI-v2-home-reflow-2026-11-06.md)已完成曲线/注记纵向阅读；实际缩放和原生接受仍待。
- 键盘：Ctrl+1…6 切表面；导航内 ↑↓；Memory 列表 ↑↓；时间小地图 slider 键；星图 `+ / − / Reset` 按钮与关系列表。视图切换现在是按钮组，若改成 ARIA tabs 必须完整实现方向键与 Home/End（规格 §10）。

## 6. 建议的设计顺序

1. 十种状态里的「空库、仅候选、来源缺失、结果未知、只读」（都落在现有骨架里，量小）。
2. 时间工作区：月 → 日时间线与覆盖日历合成阅读已做，各子视图借出顶部时间小地图；真实投影接入与天/周/月缩放仍待。
3. 记忆工作区：合成列表、类型/状态/建议主题筛选已做；标签与真实 facets 接入仍待。
4. 关联工作区：生成星图、已加载替代链/证据链合成视图已做；真实授权投影和星图性能剩余项见 OPEN_ISSUES。
5. 形成工作区：冲突/修订合成对照与固定暂存假说列表已做；召回：案例建议阅读卡已做，真实触发与写入待契约。
6. 浏览器六个表面的窄视口合成阅读已做；实际浏览器/Windows 200% 缩放、原生适配与人工接受仍待，1100–1279 保持三栏。

每一项都只在浏览器演示里用虚构数据做；真实数据的接入按 §0「三种状态」里的第 3 条，由集成负责人单独进行。
