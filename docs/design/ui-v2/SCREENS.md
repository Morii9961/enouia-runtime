# 屏幕规格 · UI v2

视觉的每个具体值在根目录 [DESIGN.md](../../../DESIGN.md)；这里只写**有哪些屏幕、每屏放什么、做到了哪一步**。截图在 [shots/](shots/)（虚构演示数据；`dark-*` 黛蓝、`light-*` 宣纸）。

状态图例：

| 标记 | 含义 |
| --- | --- |
| **已做** | 浏览器演示里已按 DESIGN.md 画好，有截图；实现时照着做 |
| **部分** | 有一部分，缺的写在「缺」里；缺的部分要先设计 |
| **未做** | 还没有设计稿；先在浏览器演示里用虚构数据设计、截图、过 `docs/design-kit/critique.md`，再实现 |
| **需后端** | 只能做成标明的合成预览；真实数据要等 Memory 仓库交付契约（见 Memory 交接包 `CONTRACT_READINESS.md`） |

## 三种状态必须分开

1. **旧 pin 的真实能力**：`docs/integration/memory-pin.json` 的 Memory Workspace（56bc5eb，47 个命令）。原生里 Memory / Context / Sessions 只显示这些能力，仍是 owner 审阅语义。
2. **合成预览**：「Automatic memory · synthetic preview」，只在浏览器演示（`connected === false`）里出现，固定标「Synthetic preview · not running」，数据是 `screens/automemory/fixture.ts` 的 15 条虚构记忆。不调用 IPC、不写存储。
3. **以后的受控采用**：Memory 仓库交付自动化契约后，由指定的集成负责人一次一处地把合成预览换成真实数据（Memory UI 规格 §11 的 UI-D / UI-E）。在那之前，原生界面不得出现合成状态，也不得静默回退到演示。

## 0. 通用骨架（所有主窗口屏幕）

| 部件 | 规格 | 状态 | 接口挂钩（不能改名） |
| --- | --- | --- | --- |
| 标题栏 34px | logo（笔迹 + 笔尖）· ENOUIA RUNTIME · 「Negative No. 40 · week of …」· 当前页名；右侧反相小牌「DEMO · LOCAL ONLY」（原生里写已连接状态）、最小化/最大化/关闭 | 已做 | `.qr227` `.qr222`；`data-tauri-drag-region` |
| 记录带 80px | 头 34px：`<nav aria-label="Primary">` 6 个按钮（`1 HOME` … `6 SETTINGS`，Settings 前有分隔），当前项 `aria-current="page"` 反相；右侧周与 demo 时钟。图 46px：7 日列、笔迹、写入记号、笔尖 | 已做 | `nav[aria-label="Primary"]`；Ctrl+1…6；↑↓ 在导航内移动焦点 |
| 时间小地图 20px | 只在 Home、Sessions、自动记忆 Timeline；◂ / ▸ 按钮、可拖动取景框（`role="slider"`，← → / PageUp / PageDown / Home / End）、范围读数、NOW | 已做 | `theme/TimeMap.tsx`、`theme/timeview.ts`（平移状态不进 App state、不持久化） |
| 跳到内容 | 第一个 Tab 停在「Skip to current surface」 | 已做 | `.runtime-skip-link` |
| 焦点 | 2px 墨色实线 + 2px 底色外圈 | 已做 | 截图 `dark-focus-1440` |
| 减少动画 | 系统设置或 Settings「Reduced」 | 已做 | `data-motion="reduced"` |

## 1. 六个主表面

Activity / Usage 界面已于 2026-10-25 移除（决定记录「移除 Activity / Usage 界面」）：不加回导航、页面、统计卡、状态或链接，不做占位页，不加 tokens.ci 面板。它的后端与原生命令暂留，前端不调用。

| # | 表面 | `data-screen-label` | 浏览器演示 | 原生 | 截图 |
| --- | --- | --- | --- | --- | --- |
| 1 | Home / Presence | `Home` | 已做 | 部分（原生 ConnectedHome 走同样的类名，未截图） | `dark-home-1440` `dark-home-1100` `light-home-1440` |
| 2 | Memory Vault | `Memory Vault` | 已做 | 部分（`src/memory/MemorySurface.tsx` 只换了皮，未截图） | `dark-memory-1440` `dark-memory-1100` `dark-memory-candidate-1440` `light-memory-1440` |
| 3 | Context Surface | `Context Surface` | 已做 | 部分（同上） | `dark-context-1440` |
| 4 | Sessions | `Sessions` | 已做 | 部分（同上） | `dark-sessions-1440` `light-sessions-1440` |
| 5 | Runtime Inspector | `Runtime Inspector` | 已做 | 部分（原生是 `src/runtime/RuntimeSurface.tsx` 的观察页：Memory Core、Memory 操作、Windows shell；只换了皮，未截图） | `dark-runtime-1440` |
| 6 | Settings | `Settings` | 已做 | 部分 | `dark-settings-1440` `light-settings-1440` |

### 1.1 Home

- 首行：「ENOUIA RUNTIME · THURSDAY 1 OCTOBER 2026 · DEMO CLOCK」标签；巨大的时刻「14:44」（DESIGN.md §3），冒号用 `--ink-3`；右侧一句「**Recording.** 9 canonical memories, 3 waiting for your review.」。
- 主图：一次显示 4 天的记录纸，笔迹画到现在，「I'm here.」写在笔尖旁；右侧四条注记（Memory Vault / Context / Current session / Checkpoint），用引线连到笔迹上的时刻，可点击跳到对应表面。
- 底部：一行图例；右侧「LEFT OPEN LAST TIME」两行。
- 时间小地图：整三周，取景框 = 主图显示的 4 天；平移时引线淡出，停稳再出现。
- 状态：Vault 未连接时注记写「Vault adapter not connected」（演示）；锁定见 §1.8。

### 1.2 Memory Vault（演示：owner 审阅语义）

- 三栏 `220 | 主列表 | 360–400`：左栏「Memory Vault / What I keep, and why.」、自动记忆预览入口（反相边框块，名称含「Automatic memory」）、字面检索框（写「Literal search」）、REVIEW（Candidate inbox + 数量）、CANONICAL 按种类、PROJECTS、SOURCES。
- 主列表：按天分组，日分隔条 = `--ink-3` 底 + 底色字的大写日期；每行：时刻 · 种类 · 项目 · 正文一行 · 来源/会话/turn/conf；选中行反相；↑↓ 移动。
- Inspector：状态牌（Canonical 反相）、种类、ID + Copy ID、正文、DECISIONS、OPEN LOOPS、WHY I REMEMBER THIS、字段表（Source / Source ID / Session / Turn / Source created / Reviewed from），底部「Edit · creates a revision」与「Demo changes stay in this window · reload resets」。四个裁切角。
- Candidate inbox（`dark-memory-candidate-1440`）：候选行用空心竖块，Inspector 给接受/编辑/拒绝（演示）。
- 缺：Inspector 里过长的 Session ID 越过右侧裁切角（OPEN_ISSUES #8）。

### 1.3 Context Surface

- 一次召回的 Capsule：纳入/排除列表，每项 rank、reason、字节、来源可达；展开看 trace。预算条只用墨色阶。
- 这是**旧 pin 的召回解释**（Memory UI 规格 §8「已保存召回的解释」）的演示版。不显示可调权重或逐项评分。

### 1.4 Sessions

- 左：会话列表；中：转录，行距按真实时间间隔，左侧时间尺，`You` / `Enouia` 角色标签，检查点 = 墨色竖括号 + 反相标签，写入在行尾标注；右：会话信息。时间小地图覆盖整段会话。

### 1.5 Runtime Inspector

- 浏览器演示：顶部一行契约读数（memory / session / capsule / core ipc / schemaVersion / mutation result / toolchain）；左：组件列表（Core、Vault、Index、Context Compiler、Provider、Gateway），状态用竖块形状；右：选中组件的 STATE / VERIFICATION / NOT YET / HEALTH。内容是文档参考，不是实时探测（`dark-runtime-1440`）。
- 原生：「Observed component status」——Memory Core（Vault、最新提交、运行中的操作、待审候选、组件健康）、Memory 操作列表与详情、Windows shell（生命周期、托盘、Quick Search 热键、主窗口）。每块有「Read … again」，失败时清掉旧观察。没有 Activity 一节。
- 原生 Memory 里另有 main 带来的视图，外观只继承 `.mem-*` 换皮、还没有专门设计：历史任务（计划、批次、结果、比较、简报）、Provider 配置草稿与设置状态、导入报告、「Synthetic automatic memories」集合。它们归入 §3 的「形成」「召回」工作区一起设计。

### 1.6 Settings

- APPEARANCE：Motion（Follow system / Reduced）；Theme（陈述句「Tile Blue when the system is dark, Xuan Paper when it is light.」+「NEGATIVE」）。
- VAULT：Location、Identity files（原生里换成 Memory 设置与 Windows shell 设置）。底部一行键盘说明「Ctrl+1–6 switches surfaces」。
- 缺：Vault 与恢复的管理入口（Memory UI 规格 §1 把它放在设置/管理）；高级召回参数分层（ref-05，只借「普通/高级分层」，不做前端凭据输入）——**未做**。

### 1.7 原生门：Vault 锁定 / 未连接

- `dark-edge-vaultlocked-1440`：记录带与小地图盖斜线，「NO STRIP LOADED · Vault locked」+ 门卡片（显式解锁，不自动开库）。已做（通过截图桩渲染真实组件）。

## 2. Quick Search（独立窗口 560×420）

- 顶部 56px 装饰迹线（笔色，纯 CSS）；「Quick Search」+「Approved Memory · read only」；下划线输入框 + 反相「Search」；结果行 = 状态竖块 + `current` 标签 + 片段；底部「Esc to close · cleared when hidden」与「Open main window」。
- 已做：空 / 结果 / 无结果三态（截图 `dark-overlay-results-560`、`light-overlay-results-560`；空与无结果在 `.design`）。
- 缺：没有「虚构/真实」标注（原生里本来显示真实记忆；OPEN_ISSUES #11）。

## 3. Memory 区域的五个工作区

Memory UI 规格 §1 把 Memory 内部分成五个工作区。现状：浏览器演示的 Memory Vault 是旧 pin 语义；五个工作区只以**合成预览**的五个视图出现，共用一个 Inspector。

| 工作区 | Morii 的问题 | 现在有的（合成预览） | 缺（先设计） | 参考 | 真实数据 |
| --- | --- | --- | --- | --- | --- |
| 记忆 | 现在留下了什么？ | Memory grid：卡片，标题/短陈述/种类/状态（文字 + 形状）/时间语义，筛选写「Loaded sample only」 | **列表模式**（与卡片同排序、同选择）；按状态/主题/标签的筛选栏；收藏/钉住只做设计样例 | ref-01 | 需后端（全库 facets） |
| 时间 | 那段时间发生了什么？ | Timeline：发生时间主轴 + 主题泳道（model suggestion）+ 收到时间第二支笔 + 「Time not recorded」分组 + 时间小地图 | **月 → 日展开的时间线**（默认月，展开日，再展开当天记忆，月份侧边定位）；**覆盖日历**（收到的材料 / 待审候选 / 已确认记忆三层，计数口径可见，零不写「没发生」）；天/周/月缩放；端点有证据、未知用开放端帽、离散证据点连虚线 | ref-02、ref-06、ref-08、ref-09 | 需后端（事件时间分页投影、覆盖聚合） |
| 关联 | 哪些经历相互关联？ | Constellation：选中对象的有界邻域，五种关系线型 + 图例，`+ / − / Reset`，并列关系列表 | **记忆星图（全库）**：主题簇、可平移缩放的整体视图、定位与「回到选中」；**替代链**与**证据链**的专门视图；节点大小统一（以后编码强度必须可解释） | Memory UI 规格 §6；研究仓库 MemoryConstellations | 需后端（授权聚合投影；不能靠遍历全部正文） |
| 形成 | Enouia 怎样理解与更新？ | Formation：观察流 收到 → 提炼 → 系统采用 / 暂存假说 / 冲突 → 重评 → 巩固 → 淡出 / 归档，「Corrected by you」；纠正/撤回/历史是禁用按钮并写依赖 | **冲突对照**（两条并排、差异、来源）；**修订历史 diff**；暂存假说的专门列表；导入台（文件 → 解析 → 提案，显示实际保存边界）仅作旧 pin 兼容 | ref-03、ref-07 | 需后端（自动生命周期出口） |
| 召回 | 这一刻为什么想起这些？ | Recall lab：两个合成案例的五步管线（资格在排序之前），rank/reason/cost/可达/截断/排除原因 | **回看与淡出的建议卡**（为什么此刻值得回看、为何暂不再提起、稍后提醒/关闭此类）；「保存召回预览」按钮（写入 Capsule，不叫模拟） | ref-04 | 旧 pin 有 `context_preview`（会写入）；建议卡需后端 |

## 4. 十种状态（Memory UI 规格 §9、§11）

| 状态 | 需要看见的说明 | 现状 |
| --- | --- | --- |
| 空库 | 当前没有可读记忆；下一步是什么 | 未做 |
| 仅候选 | 有材料但还没有记忆 | 未做（演示有 Candidate inbox，但没有「只有候选」的整屏） |
| 已确认但冲突 | 哪两条冲突、各自来源 | 部分（Formation 里有冲突事件） |
| 来源缺失 | 哪个证据缺失、可看的还有什么 | 未做 |
| 时间未知 | 哪个时间字段缺失 | 部分（Timeline 的「Time not recorded」） |
| 部分覆盖 | 已加载多少、是否还有分页 | 部分（「Loaded sample only」文字，无分页样子） |
| 被替代 | 替代者、生效时间 | 部分（列表与 Inspector 的 superseded 记号） |
| 锁定 | 没有可读记忆，显式解锁 | 已做 |
| 结果未知 | 操作可能已提交；保留原始包，显式查询恢复，不自动重发 | 未做 |
| 只读模式 | 为什么只读、哪些动作不可用 | 未做 |

另外按规格 §9 还要有：初次载入（不闪成 0 条）、无结果、索引暂不可用、状态读取失败（清除敏感内容）、plan 过期 / revision 冲突（保留草稿）、权限改变 / 删除 / 换库（立即清除面板与派生文本）。这些在原生 `src/memory/*` 里有行为，视觉上只换了皮，没有专门截图。

## 5. 窗口宽度、缩放与键盘

- 1100×700 最小窗口：全部已截图的屏幕不横向溢出、无 <11px 文字（截图脚本的阈值）；12px 下限见 DESIGN.md §3 与 OPEN_ISSUES #9。
- Memory UI 规格建议：≥1280 三栏；900–1279 Inspector 变抽屉；<900 或 200% 缩放单任务页。Runtime 的最小窗口是 1100，所以 1100–1279 这一档怎么处理**尚未决定**（OPEN_ISSUES #4）。200% 缩放**未做**。
- 键盘：Ctrl+1…6 切表面；导航内 ↑↓；Memory 列表 ↑↓；时间小地图 slider 键；星图 `+ / − / Reset` 按钮与关系列表。视图切换现在是按钮组，若改成 ARIA tabs 必须完整实现方向键与 Home/End（规格 §10）。

## 6. 建议的设计顺序

1. 十种状态里的「空库、仅候选、来源缺失、结果未知、只读」（都落在现有骨架里，量小）。
2. 时间工作区：月 → 日时间线 + 覆盖日历（ref-02、ref-06），与现有主题泳道共用时间小地图。
3. 记忆工作区：列表模式 + 筛选栏（ref-01）。
4. 关联工作区：全库记忆星图（合成规模样例先测性能，见 OPEN_ISSUES #6）+ 替代链/证据链。
5. 形成工作区：冲突对照 + 修订 diff；召回：建议卡。
6. 1100–1279 的 Inspector 处理与 200% 缩放。

每一项都只在浏览器演示里用虚构数据做；真实数据的接入按 §0「三种状态」里的第 3 条，由集成负责人单独进行。
