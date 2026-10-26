# UI v2 · 交给 Codex 落地到 Windows 应用

写给接手把 UI v2 做进真正 Windows 软件的人（预计是 Codex）。先读 [README.md](README.md) 列的五份文档，这一页只讲**现在在哪、还差什么、按什么顺序做、做完怎么验收**。

## 1. 现在的状态（2026-10-27）

UI v2 不是一份设计稿，而是已经写进了 `apps/desktop/src`：**这就是 Tauri 应用的 WebView 前端本身**，原生壳 `apps/desktop/src-tauri` 加载的就是它。但它还没有成为「正式的 Windows 软件」，因为：

| 方面 | 状态 |
| --- | --- |
| 代码位置 | UI v2 基线已通过 PR #103 合入 `main`（`4dc502b`）。后续 W2、W3、W4 在逐片推送的堆叠 `codex/ui-v2-*` 分支，尚未因此合入 main；各片证据见 validation。 |
| 与 main 的关系 | W1 已完成（2026-10-26）：合入 main 的 6 个提交（PR #101、#102，到 `39a6081`），4 个冲突已解决，main 新增的 20 条界面文字已补中日译文（1,404 条），§4 检查全部通过（node 124 / 3 跳过，DOM 77/77）。`src-tauri/tests/memory_core.rs` 来自 main，Rust 测试没有在这一步重跑。 |
| 原生壳 | W3 已获授权并实现系统明暗对应的启动底色（`65e6e3a`）；见 [W3 验证](../../validation/UI-v2-W3-background-2026-10-26.md)与首帧测量边界。 |
| 验证 | W2 已完成三语、两尺寸、两主题、实机 100/125/150% DPI 验证并记录发现；见 [W2](../../validation/UI-v2-W2-native-2026-10-26.md)。W4 Node 127 通过 / 3 跳过、DOM 77/77、build、两个根检查通过；真实原始 IPA 字体恢复成功、个人数据及 owner 验收仍未完成。 |
| 真实数据 | 原生里的 Memory、Context、Sessions 仍走 Memory 适配器（pin 的 Memory Core），这一轮只换了皮。合成预览（自动记忆、记忆星图）只在浏览器演示里出现，原生不显示，失败也不得回退到演示。 |
| 字体 | W4 已打包 504 个 CJK WOFF2，保留定稿字形；IPA 派生中文正文改名 Enouia Text SC，并附完整授权与恢复入口。中日定义及切片按需加载，英文字体流量仍为 67,892 B。见 [W4 验证](../../validation/UI-v2-W4-fonts-2026-10-27.md)。 |

## 2. 这一轮做进去的东西（按提交）

| 提交 | 内容 |
| --- | --- |
| `redesign/v2` 及之前 | 08 Negative 方向、黛蓝 / 宣纸两套配色、六个表面换皮、记录带与时间小地图、动效（DESIGN.md §7）、自动记忆合成预览、Activity/Usage 界面移除 |
| `992a3fa`、`e370117` | 记忆星图原型：Canvas + Worker，拖动、弹簧、空闲动效、独立预览页 `starmap.html` |
| `8981ca8`、`c54eff1` | 后端文档：Memory 数据需求、缺口报告、重新初始化要求、MCP 要求（`backend/`） |
| `4f9cac2`、`674ee7c` | 三语界面（English / 简体中文 / 日本語，1,385 条），Settings → Language；时间小地图标签防重叠；星图在矮窗口里保底 240px |
| `bd858a1` | Runtime Inspector DOM 测试的时序修复 |
| `585a716` | 星图默认改为三维球体，新增螺旋星系；删除旧力导向 |
$1| 字体定稿提交 | 中日字体定稿与「I'm here.」不翻译（代码、DESIGN.md、决定记录、本页 W4） |

## 3. 落地顺序（每一片单独验证、单独提交；推送与开 PR 要 owner 同意）

### W1 · 合并到最新 main（已完成，2026-10-26）
- 在 `ui-v2/merge-main` 上合并了 `origin/main`（`39a6081`）。冲突处理：`CandidateSource.tsx`、`MemorySurface.tsx` 以 main 的行为为准（上下文来源模式、P0 核心筛选），再包上 `t()`；`dom-fixtures.mjs` 保留 main 新增的两个 fixture、保留 UI v2 删除的 `usage-manual`；`AGENTS.md` 保留 main 的文字与项目状态快照一节，加上 UI v2 的「只服务 Memory」范围段落，删除已结束的设计探索流程一节。
- 之后 main 若再有新提交：从 main 开分支照常开发即可；新增界面文字仍按 §5 补译文。
- 验收：已通过（见上表）。

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

### W4 · 中日字体打包（已定稿，owner 已同意下载与使用这些文件）
定稿见 DESIGN.md §3 与决定记录「中日字体定稿」。比较页：探索树 `.design/review/fonts2/`。

| 角色 | 字体 | 来源（只从这里取） | 授权 | 用到的字重 | 子集 |
| --- | --- | --- | --- | --- | --- |
| 中文标签/标题 | Sarasa Mono SC v1.0.43 | GitHub be5invis/Sarasa-Gothic 发布页 `SarasaMonoSC-TTF-1.0.43.7z` | OFL-1.1 | Light 300、Regular 400（500 也用它）、SemiBold 600 | 只取 `src/i18n/zh-Hans.ts` 字典值里出现的汉字与全角标点（拉丁由 Martian 负责） |
| 中文正文 | LXGW Neo XiHei v1.308 | GitHub lxgw/LxgwNeoXiHei 发布页 `LXGWNeoXiHei.ttf` | IPA 字体授权 v1.0 | 400 | 全字符，按 `unicode-range` 切片 |
| 日文标签/标题 | M PLUS 1 Code | google/fonts `ofl/mplus1code/MPLUS1Code[wght].ttf` | OFL-1.1 | 可变 300–600 | 只取 `src/i18n/ja.ts` 字典值里出现的假名、汉字与全角标点 |
| 日文正文 | Zen Kaku Gothic New | google/fonts `ofl/zenkakugothicnew/` 的 Light / Regular / Medium / Bold | OFL-1.1 | 300 / 400 / 500 / 700 | 全字符，按 `unicode-range` 切片 |

本机交付包的 `fonts/` 里已经放了这些原始文件（与上表同版本），可以直接用；授权全文要从各仓库取（OFL.txt / LICENSE），放进 `src/assets/fonts/<字体>/`。

步骤：
1. **先核对 LXGW Neo XiHei 的 IPA 授权**：子集化与转 woff2 是否算「派生程序」，派生后是否必须改字体名、是否要随附授权全文与原始文件获取方式。若子集化受限，就整份转 woff2 不改字形（或整份 ttf 原样随附），按授权要求处理命名；结论写进 `assets/fonts/README.md` 与决定记录。其余三款是 OFL：子集化允许，但 Reserved Font Name 规则要看各自 OFL.txt（有保留名的派生字体须改名，例如 `'Sarasa Mono SC UI'`）。
2. 生成子集：标签字体只含字典里出现过的字，写一个脚本（例如 `scripts/subset-cjk-fonts.mjs`，用 fonttools/pyftsubset 或同类工具）从 `zh-Hans.ts` / `ja.ts` 收集字符，字典改动后重跑；正文字体全字符，按 Google Fonts 的做法切成约 100 片 `unicode-range`，只有页面用到的片才会加载。全部 woff2，放在 `src/assets/fonts/`，CSP `font-src 'self'` 不变，不联网。
3. `theme/cjk-fonts.css`：写 `@font-face`（`font-display: swap`），按 DESIGN.md §3 的四条栈设 `:root:lang(zh-Hans)` / `:root:lang(ja)` 的 `--f-lab`、`--f-mono`、`--f-text`，以及 `[lang|="zh"]` / `[lang|="ja"]` 的正文栈；系统字体留在栈尾作回退。中文正文只有 400：给 `:root:lang(zh-Hans)` 设 `font-synthesis-weight: none`，不出伪粗体。
4. 星图画布的标签读 `--f-lab`，不用改；确认中文主题名（不在标签子集里）落到正文字体而不是方块。
5. 「I'm here.」与产品名已是 `lang="en"`，不受影响。

验收：中文、日文、英文下六个表面 + 自动记忆预览 + 星图截图（黛蓝、宣纸）；DevTools 里中日文字确实来自打包字体；记录每个字体子集与切片的总体积、首屏实际加载的体积；英文界面的字体与体积不变；§4 检查全过；DESIGN.md §3 的「加载方式」列补上实测体积。

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
- 不翻译：产品名、首页的「I'm here.」（任何语言下都是英文，`lang="en"`）、ID、路径、命令、模型名、记忆与会话正文。用语对照与声线在 DESIGN.md §9。

## 6. 交付包

本机交付包（不在 Git 里，路径见本机私有说明）包含：
- `START_HERE.md` 与 `CODEX_START.txt`（Codex 会话启动词）；
- `runtime-ui-v2-starmap.bundle`：合并前的备用 git bundle（`redesign/v2`、`redesign/v2-starmap`）；合并后不再需要；
- `runtime-ui-v2-src.zip`：分支上 `apps/desktop`、`docs/`、`DESIGN.md`、`AGENTS.md` 的快照（`git archive`，不含 node_modules）；
- `design-exploration.zip`：探索树的 `.design`（方向比较、评审页、字体比较、星图录像与截图；不含 node_modules）；
- `shots/`：最新的星图截图。

## 7. 不能做的事

沿用 README「不能动的契约」与 AGENTS.md。另外：不改 Memory 领域代码、不碰 Memory pin、不打开个人 Vault、不做个人迁移或生产启用；密钥只在原生；前端不能把「人工已确认」显示成「系统已采用」；推送、开 PR、合并都要 owner 同意。
