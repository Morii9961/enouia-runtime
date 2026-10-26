# DESIGN.md — 选定的设计

<!-- design-kit v2：每个字段都是具体值。实现中遇到这里没写的问题，先在 docs/design-decisions.md 补一条决定，再改这里。 -->

状态：定稿 v1（视觉语言）；屏幕清单见 [docs/design/ui-v2/SCREENS.md](docs/design/ui-v2/SCREENS.md)，其中标「未做」的屏幕仍需先设计。
选定日期：2026-10-25
来源方向：**08 负片**（`redesign/08-negative` 53f9bb4，由 01 气压记录纸 × 05 胶片阅读机演进而来）+ 配色轮（`redesign/08-palettes`）：深色 **黛蓝 Tile Blue**、浅色 **宣纸 Xuan Paper**。参考实现分支：`redesign/v2`。
配套文档：[决定记录](docs/design-decisions.md) · [实现入口](docs/design/ui-v2/README.md) · [屏幕规格](docs/design/ui-v2/SCREENS.md) · [参考来源](docs/design/ui-v2/REFERENCES.md) · [未决问题](docs/design/ui-v2/OPEN_ISSUES.md)

## 1. 概念

- 一句话世界观：**一台记录仪的记录纸，翻成负片看。** 一条笔迹沿时间画过去；窗口顶上永远有这条记录带，导航印在上面；有时间轴的页面下方多一条「时间小地图」，取景框移到哪，图表就沿时间走到哪。
- 它不是什么：不是 Quiet Runtime 的深色（没有冰蓝、没有圆环呼吸）；不是科幻 HUD（不发光、没有扫描线、笔色不发光）；不是卡片仪表盘（一屏最多一种框）；不是坐标纸（只有日界线这一级网格）。
- 换牌测试（遮住产品名还能认出）：① 顶部 80px 记录带：导航字段 + 一条笔迹 + 三角笔尖；② 20px 时间小地图上的取景框；③ 选中一律反相（墨色块、底色字），故障是反相 + 斜线 +「✕」。

## 2. 颜色（只写角色和值）

令牌全部在 `apps/desktop/src/theme/palettes.css`；组件只读令牌，不写色值（唯一例外见本节末）。

| 角色 | 令牌 | 深 · 黛蓝 | 浅 · 宣纸 | 用在哪 |
| --- | --- | --- | --- | --- |
| 底 | `--paper` | `#0F1C23` | `#F1F0EB` | 窗口、页面、记录带 |
| 面 | `--wash` | `#16232B` | `#E7E5DF` | 悬停、输入底、展开的字段区 |
| 二级面 | `--wash-2` | `#1C2B32` | `#DDDAD3` | 少量凹陷区（不用于悬停） |
| 细线 | `--grid-minor` | `#1B2A31` | `#DCD9D2` | 日界线、表格行线、图表横线 |
| 线/分隔 | `--grid-major` | `#2B3A42` | `#C5C1B8` | 区块分隔、框、滚动条 |
| 主文字 | `--ink` | `#ECEDE8` | `#1D1C1A` | 正文、标题；也是反相块的底 |
| 次文字 | `--ink-2` | `#B7BBB6` | `#44423E` | 说明、元数据 |
| 三级文字 | `--ink-3` | `#969B97` | `#5C5954` | 标签、坐标；日分隔条的底 |
| 最高 | `--ink-hi` | `#F8F9F5` | `#100F0D` | 首页「Recording.」等极少处 |
| 强调（一个）· 笔 | `--pen` | `#93B6DC` | `#29528A` | **只给**：迹线、笔尖、时间小地图取景框与「现在」三角、图表上选中项的光标、「Corrected by you」 |
| 反相块 | `--i-paper` / `--i-ink` | `#ECEDE8` / `#0F1C23` | `#1D1C1A` / `#F1F0EB` | 选中行、当前导航、当前视图、主按钮、DEMO 牌、故障块 |
| 反相内次/三级字 | `--i-ink-2` / `--i-ink-3` | `#374246` / `#485256` | `#C6C1B7` / `#A6A196` | 反相块里的元数据 |
| 反相内的笔 | `--i-pen` | `#22497A` | `#93B3D8` | 反相块里出现笔迹时 |
| 遮罩 | `--backdrop` | `rgba(5,5,5,0.7)` | `rgba(20,20,18,0.42)` | 模态对话框背后 |
| 状态：正常 / 警告 / 异常 | — | 不用颜色 | 不用颜色 | 正常 = 实心竖块 ▮；待处理 = 空心竖块 ▯ + 文字；异常 = 反相 + 135° 斜线 +「✕」+ 文字 |
| 数据色 | — | 笔色 + 墨色阶 | 同左 | 热度/密度四档：`color-mix(in oklab, var(--ink) 25% / 50% / 75%, var(--grid-minor))`，最高档 `--ink` |

- 派生（写在 CSS 里，不新增令牌）：区间带 `--ink` 10%；取景框底 `--pen` 10%；选中区间底 `--pen` 5%；故障斜线 `--i-ink` 20–22%（都用 `color-mix(in srgb, …, transparent)`）。
- 明暗模式：两种都做，各自单独选色。`<html data-theme>` 跟随系统 `prefers-color-scheme`，系统切换时即时跟随；浏览器演示可加 `?theme=dark|light`。没有应用内手动覆盖（OPEN_ISSUES #3）。
- 色值例外：Quick Search 顶部那段装饰迹线是内联 SVG，笔色按两套各写一次（`palettes.css` 末尾）。
- 对比度已测（WCAG 2.x 相对亮度）：
  - 深：字/底 14.74，字 2/底 8.92，字 3/底 6.14、/面 5.68、/二级面 5.16，笔/底 8.23、/面 7.61，反相笔/反相底 7.75。
  - 浅：字/底 14.92，字 2/底 8.79，字 3/底 6.11、/面 5.53、/二级面 4.99，笔/底 6.90、/面 6.25，反相笔/反相底 7.85。
  - 逐节点审计（浏览器演示 8 页 × 2 套，每个可见文字节点对最近的不透明背景）：低于 4.5:1 的为 0。
- 来历：第一轮六套（苔夜、铁胆、松烟、台纸、藕荷、宣纸）→ 浅色选宣纸；第二轮深色（黛瓦、灯下、旧绢）→ 黛瓦；黛瓦压深三版（深黛、黛青、黛蓝）→ 黛蓝。黛蓝的底：OKLCH L 0.218 / C 0.022 / h 232°。

## 3. 字体

| 角色 | 字体 | 授权（已核实） | 字重 | 加载方式 |
| --- | --- | --- | --- | --- |
| 展示/标题（拉丁） | Martian Mono 可变（wdth 75–112.5） | OFL-1.1；`@fontsource-variable/martian-mono` 5.3.0；npm `license` 字段 2026-10-17 核实；LICENSE 随字体放置 | 300（首页时刻）、400、500、600 | 自托管 woff2，`font-display: swap`，38,492 B |
| 正文（拉丁） | Geist 可变 | OFL-1.1；`@fontsource/geist` 5.3.0；同上 | 400、500 | 自托管 woff2，29,400 B |
| 数据/等宽 | Martian Mono（同上） | 同上 | 500、600 | 同上 |
| 中文（汉字与中文标点） | **暂定**：系统 Microsoft YaHei UI → Microsoft YaHei；候选比较见 `.design/review/fonts/` | 系统字体，不打包 | 系统 300 / 400 / 700 | 不加载；`theme/cjk-fonts.css` 按 `<html lang="zh-Hans">` 放在 Geist / Martian 之后 |
| 日文（假名、汉字与日文标点） | **暂定**：系统 Yu Gothic UI → Meiryo UI；候选同上 | 系统字体，不打包 | 系统 300 / 350 / 400 / 600 / 700 | 同上，按 `<html lang="ja">`；同一个汉字在中文与日文里取各自的字形 |
| 点缀 | 无 | — | — | — |

- 合计 67,892 B（预算 ≤ 150 KB）。CSP `font-src 'self'` 不变。字体说明在 `apps/desktop/src/assets/fonts/README.md`。
- Martian 宽度三档：`--w-sm: 75%`（小标签、行内读数）、`--w-nav: 87.5%`（导航、注记时刻）、`--w-display: 112.5%`（首页时刻、页标题）。
- 字号阶梯（px）：**12**（标签、坐标、导航；全应用最小字号，任何缩放状态都不得低于 12）· **13**（UI 说明）· **14**（正文、列表）· **16**（首页副句、注记时刻、记忆正文）· **18**（区块标题）· **22 / 24**（页标题、Inspector 标题）· **32**（首页「I'm here.」）· **40**（大标题保留位）· **96–112**（首页时刻，`clamp(96px, 14vh, 112px)`）。首页展示/正文 = 112/16 = 7.0（1100 宽下 6.1）。
- 现存例外：`memory.css` 的 `.mem-tag` 仍写 11.5px（原生表面旧样式），实现时改为 12px（OPEN_ISSUES #9）。
- 标签样式：Martian 12 / 600，`letter-spacing: 0.08em`，大写。导航：Martian 12 / 500，`0.04em`，大写，wdth 87.5%。
- 行高：正文 14/21、16/24；中文段落 1.7；首页时刻 0.9；标签 16。
- 数字：`font-variant-numeric: tabular-nums` 全局开启，两种字体都支持。

## 4. 形状、材质、间距

- 间距单位 2px；常用档 2 / 4 / 6 / 8 / 10 / 12 / 16 / 20 / 24 / 28 / 40 / 56。首页内边距 14px 28px 16px；记录带与时间小地图左右缩进 12px。
- 圆角：0（按钮、输入、牌、框全部直角）。例外只有圆点：检查点、星图节点（50%）。
- 线与边框：1px `--grid-major` 为唯一边框；强调用线重（1px → 2px），不用颜色。一屏最多一种框：Inspector 用四个 10px L 形裁切角（胶片帧角），不画闭合边框。
- 材质：**胶片负片上的记录纸**。只有日界线（`--grid-minor` 1px，一天一格）这一级网格；没有细格、没有纸纹。
- 阴影：无。发光：无。渐变：只用于斜线阴影与网格线本身。

## 5. 布局

- 结构骨架：桌面窗口，**横向记录带 + 页面**，没有侧栏导航。
  ```
  ┌ 标题栏 34px：logo · ENOUIA RUNTIME · Negative No. 40 · 当前页名 ……〔DEMO · LOCAL ONLY〕反相牌 ─ □ ✕ ┐
  ├ 记录带头 34px：1 HOME … 5 RUNTIME │ 6 SETTINGS（当前项反相）…… 右侧：周 + demo 时钟              │
  ├ 记录带图 46px：7 个日列，笔迹 + 写入记号 + 笔尖                                                   │
  ├ 时间小地图 20px（仅 Home / Sessions / 自动记忆 Timeline）：◂ 地图 ▸ · 范围读数 · NOW            │
  └ 页面（剩余高度，自身滚动）                                                                        ┘
  ```
- 网格与对齐线：日列 = 宽度 / 7（记录带）或 / 21（首页图，一次显示 4 天）。Memory Vault：`220px | minmax(320px,1fr) | minmax(360px,400px)`；自动记忆：主视图 `minmax(0,1fr)` + Inspector 380px（≤1240 宽 336px）；首页底部 `minmax(0,1fr) 330px`。
- 一处有意打破网格的地方：首页「I'm here.」写在笔尖旁（图内绝对定位，top 27%），跨在图与注记之间。
- 宽度档位（桌面，最小窗口 1100×700，不做手机）：
  - **1920 / 1440**：同一骨架，内容区随宽度拉伸；1440 是基准截图宽度。
  - **1100–1240**：导航项内边距 9 → 7px；自动记忆 Inspector 336px；记录带右侧 meta 截断为省略号。Memory UI 规格建议 900–1279 把 Inspector 改为抽屉，**尚未决定**（OPEN_ISSUES #4）。
  - **Quick Search**：独立窗口 560×420。

## 6. 招牌时刻（每个页面最多一个）

- Home：载入时笔迹从左到右画出（1.2s linear），画完后 160ms 笔尖出现；之后静止。
- Home / Sessions / 自动记忆 Timeline：移动时间小地图上的取景框（拖动、点击、◂ ▸、← → / PageUp / PageDown / Home / End），图表沿时间平移（320ms）。
- Vault 锁定：记录带与小地图盖斜线，正中「NO STRIP LOADED · Vault locked」。
- 其他页面没有招牌动作。

## 7. 动效

- 性格：**像记录仪：一次画出，然后安静；移动只沿时间轴或导航顺序。** 没有循环、弹跳、发光、抖动。
- 缓动与时长：一条曲线 `cubic-bezier(.2,.7,.2,1)`（`--ease`），淡出用 linear。四档：`--t1` 120ms · `--t2` 180ms · `--t3` 240ms · `--t4` 320ms；退出约为进入的 70%。
- 实现：`theme/motion.ts` 用浏览器的 View Transitions API（`moveAlong(kind, update, dir)`；缺 API 或减少动画时直接更新）；`theme/motion.css` 写全部时长与关键帧。只动 `transform`、`opacity`、`clip-path`、取景框的 `left/width`；不引入动画库。
- 时刻（录像与慢放见 `.design/review/motion/`）：

| 时刻 | 做法 | 时长 |
| --- | --- | --- |
| 首页载入 | 笔迹从左到右画出（`clip-path`），画完后笔尖淡入，写入记号落到纸上；之后静止 | 1.2s linear · 160ms · 180ms |
| 切换页面 | 内容像胶片前进一格：旧页向左让 12px 并淡出，新页从右 12px 进来；往回走则反向。导航上的反相块滑到新位置。标题栏与记录带不动 | 出 120 · 进 180 |
| 时间小地图 | 移动取景框，图表沿时间平移；拖动或滚轮时跟手、无过渡 | 320 |
| Memory 列表选中 | 反相块从旧行移到新行（↑↓ 与点击相同）；Inspector 翻到下一帧（旧内容淡出，新内容从右 12px 进来） | 块 120 · Inspector 80 + 120 |
| 自动记忆切视图 | 主视图按视图顺序前进一格；按下的视图按钮滑到新位置；Inspector 不动 | 出 120 · 进 180 |
| 自动记忆选中 | Inspector 翻帧；Constellation 里每条记忆保持身份（`view-transition-name: am-n-<id>`），从旧位置移到新位置 | 180 |
| 记录到达 | Formation 事件、记忆格、Quick Search 结果从右 8px 依次到达，每条错开 30ms，第 7 条起一起到；Recall lab 五步每步 80ms 依次出现；只在出现时播一次 | 240 / 180 |
| Quick Search | 窗口出现时纸条落下到位 | 160 |
| 系统明暗切换 | 整个窗口淡入另一套配色（显影） | 240 |
| Vault 锁定 / 未载入 | 斜线从左到右画过记录带与小地图 | 240 |
| 悬停 | 底色与字色短过渡 | 80 |

- 不动的：标题栏、记录带本身、数字、加载状态（不放骨架动画）、错误（直接反相，不抖动）。
- 唯一例外：**记忆星图**（自动记忆预览的 Star map 视图与独立页 `starmap.html`）可以自己动，Morii 2026-10-26 要求「没有交互的时候也要有自己的运行动效」。规则：
  - 力导向布局在眼前收敛：Worker 每 16ms 送一帧，约 70 帧；切换布局从星星当前位置出发，新位置以 `1 − e^(−9t)` 逼近（约 1/3 秒到 95%）。第一次出现从中心展开。
  - 直接拖动一颗星：它跟手，有连线的星按弹簧跟过去（每条线的拉力 18，主题建议线减半），松手后回到原位。弹簧作用在「离开布局位置的偏移」上，回到原位的拉力 32、阻尼 11，接近临界阻尼，不弹跳。拖空白处平移，松手后滑行约 220ms 衰减；双击一颗星把它拉近居中。
  - 空闲时：每颗星各自漂移 2.5px（周期 6–14s），再叠一道缓慢的「水流」5px（波长 520 世界单位，周期 23s），都按屏幕像素算，缩放时幅度不变；主题聚类布局里每团约四分钟转一圈，相邻两团方向相反；只动位置，不闪、不发光、不改明暗。空闲时约每秒 30 帧。
  - 时间滚筒：笔固定在 12 点，年份在笔下转；回放时星星正好在笔下出现；时间小地图上的跳转让滚筒转过去，回放的小步直接跟随。
  - 漂移与转动没有含义，图例写明「Positions and drift mean nothing」。工具栏有「Pause motion」（WCAG 2.2.2）；画布不可见或页面隐藏时停；减少动画时漂移、转动、展开、滑行全部关闭，拖动只移动那一颗，松手即回。
- 第二批（未做）：Timeline 天/周/月缩放；自动记忆状态图形的形变（例如暂存 → 采用）；列表增删行的高度展开。新增动效不超过 Memory UI 规格的上限（常规反馈 120–180ms，布局过渡 180–240ms，平移 320ms 例外）。
- 减少动画：`prefers-reduced-motion: reduce` **或** Settings 选「Reduced」（`data-motion="reduced"`）时，所有动画、过渡与视图过渡为 0，笔迹直接画完，平移瞬时；不播放 `enouiaBreath`。
- 测试环境（Happy DOM）没有 View Transitions，状态直接更新；真实 WebView2 里状态更新晚一帧，界面测试应等待结果，不假设同步。

## 8. 数据可视语言

- 标记形式：**笔迹**（连续线 1.5px，笔色）= 随时间的活动；**竖块**（4×9px）= 写入：实心 canonical，空心 candidate，带横杠 superseded，点线框 archived；**圆点**（7px）= 检查点；**三角笔尖**（10×8px）= 现在；**区间带** = 有效时间；**点线** = 收到时间（第二支笔）。
- 图表库：无，手写 SVG + CSS（`theme/RecordStrip.tsx`、`theme/TimeMap.tsx`、`theme/chart.ts`、`theme/timeview.ts`）。
- 标注：直接标在线上，或用引线 + Martian 小字；不用图例框。必要的图例是一行文字（首页底部）。
- 四种状态：
  - 空：保留坐标与日界线，一行说明写清范围（例：「Nothing here matches. No reading in the loaded sample for that filter.」）；不写成「这天什么都没发生」。
  - 加载：保留结构，不闪成 0 条；不画骨架动画。
  - 错误：反相 + 斜线 +「✕」+ 一句原因 + 可用动作（只在 retryable 时给「Retry」）。
  - 部分范围/过期：范围读数里写「loaded sample」/「已加载范围」，不显示全库计数。

## 9. 文案声线

- 声线：**仪器读数 + 一点人声。** 短、具体、写清范围与后果；不用感叹号；先说事实再说动作。
- 界面三种语言：English、简体中文、日本語（`src/i18n/`）。英文原文就是键，中文与日文各一份字典，缺项退回英文；`tests/i18n.test.mjs` 检查每个界面字符串都有两种译文、占位符一致、没有多余条目。Settings → Language 选「跟随系统 / English / 中文 / 日本語」，只存在这个浏览器（本机）里；浏览器演示可用 `?lang=en|zh|ja`。只加载当前语言的字典。
- 不翻译的：产品名「Enouia Runtime」（`lang="en"`，保持大写与字距）、ID、哈希、文件名与路径、命令名、模型与服务商名、记忆与会话的正文（按原来的语言显示）。演示数据里的虚构记忆与对话也保持英文。
- 中文用「你」，不用「您」；日文用です・ます，标签用名词。中文标点全角，日文引号用「」，中文引号用“”。用语对照：Vault 记忆库 / 保管庫，canonical 正式，candidate 候选 / 候補，session 会话 / セッション，capsule 胶囊 / カプセル，provider 模型服务商 / プロバイダー，evidence 证据 / 根拠，grant 授权 / 許可，Adopted by system 系统已采用 / システムが採用，Corrected by you 你纠正过 / あなたが訂正，Star map 记忆星图 / 記憶の星図，Tile Blue 黛蓝 / タイルブルー，Xuan Paper 宣纸 / 宣紙。
- 日期：英文保持原格式（「1 Oct 2026」「THU 1 OCT」）；中文与日文用 Intl（zh-CN / ja-JP），记录带写「10月1日 周四」/「10月1日 木」，日历日仍按 Asia/Shanghai。
- 示例：
  - 按钮：「Edit · creates a revision」「Back to Vault · owner review」「Copy ID」
  - 空状态：「Nothing waiting for review.」「Nothing here matches. No reading on this strip for that text.」
  - 错误：「Review queue could not be read」「Could not copy. Select the ID and copy it manually.」
- 诚实规则（契约）：系统自动采用写「Adopted by system」，不写 approved/confirmed；演示永远标「Demo · local only」/「Fictional」；合成预览永远标「Synthetic preview · not running」；字面检索写「Literal search」，不叫语义检索。

## 10. 禁区（这个项目特有的）

- 不用颜色表达状态；不加第二个强调色；笔色不出现在笔以外的地方（不做按钮色、链接色、徽章色）。
- 不发光、不加阴影、不加圆角卡片、不加渐变背景。
- 不新增框：一屏只有 Inspector 的裁切角一种框。
- Runtime 不再有 Activity / Usage（用量）界面：不加回导航、页面、统计卡、Home/Settings/Runtime Inspector 里的状态或链接，也不加 tokens.ci 面板（决定记录 2026-10-25）。
- 不把合成预览的状态（采用、巩固、淡出……）用在原生真实记忆界面上；不把人工审阅改名成系统采用。
- 不在截图、测试快照、日志里放真实记忆正文；参考原图不进 Git（见 REFERENCES.md）。
- 不低于 12px；不引入远程字体或 CDN。

## 11. 依据

- 看过的参考与影响：
  - 第一轮五个方向（01 气压记录纸、02–04、05 胶片阅读机）与第二轮 06/07/08 的截图和自检记录 → 选 08。结构来自 01（记录带、时间主轴），字体与时间小地图来自 05。
  - 04 标本馆的配色方法（单一低彩度色相、墨带同一色相、只有一个强调色）→ 两套配色的做法。
  - Memory UI 规格（Memory 仓库的本地交接包 `memory-ui-2026-10-24/UI_SPEC.md`）与九张参考图 ref-01…ref-09 → 屏幕清单；逐条借鉴见 [REFERENCES.md](docs/design/ui-v2/REFERENCES.md)。
- 截图：本仓库 [`docs/design/ui-v2/shots/`](docs/design/ui-v2/shots/)（虚构演示数据）。完整截图与自检记录在被 Git 忽略的 `.design/`（`shots/v2/{dark,light}`、`directions/08-negative/critique-log.md`、`review/index-palettes*.html`），只在做探索的那台机器上。
