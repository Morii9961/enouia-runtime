# UI v2 · 交给 Codex 落地到 Windows 应用

写给接手把 UI v2 做进真正 Windows 软件的人（预计是 Codex）。先读 [README.md](README.md) 列的五份文档，这一页只讲**现在在哪、还差什么、按什么顺序做、做完怎么验收**。

## 1. 现在的状态（2026-10-26）

UI v2 不是一份设计稿，而是已经写进了 `apps/desktop/src`：**这就是 Tauri 应用的 WebView 前端本身**，原生壳 `apps/desktop/src-tauri` 加载的就是它。但它还没有成为「正式的 Windows 软件」，因为：

| 方面 | 状态 |
| --- | --- |
| 代码位置 | 分支 `redesign/v2`，已推送到 GitHub（origin）。星图、三语、后端文档与本交接原先在本地分支 `redesign/v2-starmap`，2026-10-26 已快进合入 `redesign/v2` 并推送。没有合并进 `main`，也没有开 PR。 |
| 与 main 的关系 | 分叉点 `301a808`（PR #100）。之后 main 多了 6 个提交（到 PR #102），本分支多了 32 个提交。试合并有 4 个冲突：`AGENTS.md`、`memory/CandidateSource.tsx`、`memory/MemorySurface.tsx`、`tests/dom-fixtures.mjs`。 |
| 原生壳 | `src-tauri` **一行没改**（这一轮没有授权）。首帧底色仍是旧的 `#0C1117`（OPEN_ISSUES #1）。 |
| 验证 | 只在浏览器演示与无头 Edge 里看过；**没有在原生 WebView2 里跑过**（OPEN_ISSUES #20）。node 测试 124 通过 / 3 跳过，DOM 75/75，build，两个仓库检查都通过。 |
| 真实数据 | 原生里的 Memory、Context、Sessions 仍走 Memory 适配器（pin 的 Memory Core），这一轮只换了皮。合成预览（自动记忆、记忆星图）只在浏览器演示里出现，原生不显示，失败也不得回退到演示。 |
| 字体 | 拉丁字体已定（Geist + Martian Mono，自托管）。**中日字体未定**：系统字体被否决，第二轮候选见 OPEN_ISSUES #19。 |

## 2. 这一轮做进去的东西（按提交）

| 提交 | 内容 |
| --- | --- |
| `redesign/v2` 及之前 | 08 Negative 方向、黛蓝 / 宣纸两套配色、六个表面换皮、记录带与时间小地图、动效（DESIGN.md §7）、自动记忆合成预览、Activity/Usage 界面移除 |
| `992a3fa`、`e370117` | 记忆星图原型：Canvas + Worker，拖动、弹簧、空闲动效、独立预览页 `starmap.html` |
| `8981ca8`、`c54eff1` | 后端文档：Memory 数据需求、缺口报告、重新初始化要求、MCP 要求（`backend/`） |
| `4f9cac2`、`674ee7c` | 三语界面（English / 简体中文 / 日本語，1,385 条），Settings → Language；时间小地图标签防重叠；星图在矮窗口里保底 240px |
| `bd858a1` | Runtime Inspector DOM 测试的时序修复 |
| `585a716` | 星图默认改为三维球体，新增螺旋星系；删除旧力导向 |
| 本页所在提交 | 设计文档更新与这份交接 |

## 3. 落地顺序（每一片单独验证、单独提交；推送与开 PR 要 owner 同意）

### W1 · 合并到最新 main
- 从 `origin/redesign/v2` 开一个新分支，与 `origin/main` 合并，解决 4 个冲突。原则：**main 的行为与逻辑优先，UI v2 的外观与文案包装（`t()`）叠上去**。`AGENTS.md` 保留 main 的版本，再把「Runtime UI 只服务 Memory、六个表面」那段合进去。
- main 新增的界面文字要按 §5 的方法补翻译，否则 `tests/i18n.test.mjs` 会失败（这是故意的）。
- 验收：§4 的全部检查通过。

### W2 · 原生 WebView2 验证（只看，不改原生）
在 `npm run tauri dev`（或现有的原生 smoke 方式）里逐项看，截图存档：
1. 1100×700 与 1440×900 两种窗口，黛蓝与宣纸各一遍，六个表面。
2. Settings → Language 切到中文、日文：当场换字、重启后记住、「跟随系统」回到系统语言；左上角「ENOUIA RUNTIME」始终英文大写。
3. Settings → Motion 选 Reduced 与系统「减少动画」：所有动效为 0。
4. 原生 Memory/Context/Sessions 读真实 pin 时，界面没有虚构标注以外的演示内容。
5. 每屏的 DPI（100% / 125% / 150%）下 12px 文字是否清晰，中日文字是否落到预期字体。
- 星图只在浏览器演示里，原生看不到；它的验证在开发服务器 `starmap.html` 上做（见 W5）。
- 验收：清单逐项有截图；发现的问题记进 OPEN_ISSUES。

### W3 · 原生首帧底色（需要 owner 授权改 `src-tauri`）
- `tauri.conf.json` 两个窗口的 `backgroundColor` 与 `index.html` 的 `theme-color` 按系统明暗取黛蓝 `#0F1C23` / 宣纸 `#F1F0EB`（OPEN_ISSUES #1）。
- 验收：浅色系统下打开不闪深色。

### W4 · 中日字体（等 owner 在 OPEN_ISSUES #19 里选定）
- 下载候选前先报文件名、来源、大小、授权，等 owner 同意。
- 选定后：子集化为 woff2，按 `unicode-range` 分片放进 `src/assets/fonts/`，在 `theme/cjk-fonts.css` 按 `:root:lang(zh-Hans)` / `:root:lang(ja)` 分角色（标签 = Martian 的角色，正文 = Geist 的角色）接上；CSP `font-src 'self'` 不变；更新 DESIGN.md §3 表格、`assets/fonts/README.md` 的授权说明，记一条决定。
- 验收：中文、日文下全部页面截图；首屏字体体积写进决定记录。

### W5 · 记忆星图
- 现在是合成数据的原型（`screens/automemory/StarMap.tsx`、`starLayout.ts`、`starWorker.ts`、`starfield.ts`），规格在 DESIGN.md §7「唯一例外」。
- 在 WebView2 里测 200 / 700 / 1,000 / 5,000 条的帧时间（页面有 `window.__starPerf`），与无头 Edge 的数字比较（DESIGN.md / 决定记录里有）。
- 接真实数据要等后端的图投影（`backend/01-BACKEND_GAPS.md` 的相关条目、`MEMORY_DATA_REQUIREMENTS.md` §3）。在那之前**不得**把合成星图放进原生。
- 验收：帧时间记录；暂停、减少动画、画布离屏时停止都成立。

### W6 · 小修（OPEN_ISSUES 里标「实现者」的）
#7 皮肤值写在视图模型里、#8 Inspector 长 ID 越界、#9 11.5px 文字、#10 全局 ↑/↓、#16 Runtime Inspector 组件名、#18 主 JS 500 kB（历史任务与 Provider 面板懒加载）。各自一片。

### W7 · 以后（owner 排期）
托盘、全局热键、悬浮窗、开机启动、安装包（AGENTS.md：每个 Runtime 集成切片等 owner 开口才开始）。这些表面也要接入 i18n（窗口标题、托盘菜单）。

## 4. 每片都跑的检查

在 `apps/desktop`：

```bash
npm run check
```

```bash
npm test
```

```bash
npm run test:dom
```

```bash
npm run build
```

在仓库根目录：

```bash
node scripts/check-memory-integration.mjs
```

```bash
node scripts/check-activity-retirement.mjs
```

DOM 测试曾经偶发失败（OPEN_ISSUES #5，Runtime Inspector 那一项已修）；失败时先单独重跑那一个 fixture 确认。

## 5. 三语界面的维护方法

- 英文原文就是键：`t('Open Vault')`、`tn(n, '{n} record', '{n} records')`、句中带元素用 `tj()`、模块级表格用 `msg()` 标记再用 `labels()` 包起来（切换语言后才会重新翻译）。
- 字典在 `src/i18n/zh-Hans.ts`、`ja.ts`，按语言懒加载。`node tests/i18n-keys.mjs --missing` 列出缺译文的键；`tests/i18n.test.mjs` 检查覆盖、占位符一致、没有多余条目、没有留英文。
- 扫描器看不到模板字符串（\`…${x}…\`）与裸 JSX 文本：新写界面文字时一律用 `t()`。
- 不翻译：产品名、ID、路径、命令、模型名、记忆与会话正文。用语对照与声线在 DESIGN.md §9。

## 6. 交付包

本机交付包（不在 Git 里，路径见本机私有说明）包含：
- `START_HERE.md` 与 `CODEX_START.txt`（Codex 会话启动词）；
- `runtime-ui-v2-starmap.bundle`：备用的 git bundle（含 `redesign/v2` 与 `redesign/v2-starmap`，前提提交 `301a808`）；分支已在 GitHub 上，正常用 `git fetch origin redesign/v2` 即可；
- `runtime-ui-v2-src.zip`：分支上 `apps/desktop`、`docs/`、`DESIGN.md`、`AGENTS.md` 的快照（`git archive`，不含 node_modules）；
- `design-exploration.zip`：探索树的 `.design`（方向比较、评审页、字体比较、星图录像与截图；不含 node_modules）；
- `shots/`：最新的星图截图。

## 7. 不能做的事

沿用 README「不能动的契约」与 AGENTS.md。另外：不改 Memory 领域代码、不碰 Memory pin、不打开个人 Vault、不做个人迁移或生产启用；密钥只在原生；前端不能把「人工已确认」显示成「系统已采用」；推送、开 PR、合并都要 owner 同意。
