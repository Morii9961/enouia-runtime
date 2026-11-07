# UI v2 · 实现入口

给接手实现的人（Claude 或 Codex）。先读这一页，再按顺序读。**要把 UI v2 落地进 Windows 应用，先读 [HANDOFF_CODEX.md](HANDOFF_CODEX.md)**：现状、落地顺序、验收与交付包。

2026-11-05：#115–#119 已合并；其后的 UI 接续仍在草稿 PR，不能视为 main 已采用。近期范围与证据见 [五工作区](../../validation/UI-v2-memory-workspaces-2026-11-04.md)、[演示反馈](../../validation/UI-v2-demo-feedback-2026-11-04.md)、[窗口反馈](../../validation/UI-v2-window-feedback-2026-11-04.md)、[旧 Vault 空状态](../../validation/UI-v2-empty-vault-demo-2026-11-04.md)、[月／日浏览](../../validation/UI-v2-month-day-preview-2026-11-05.md)、[覆盖日历](../../validation/UI-v2-coverage-calendar-2026-11-05.md)、[记忆列表/筛选](../../validation/UI-v2-memory-list-filters-2026-11-05.md)、[替代链/证据链](../../validation/UI-v2-lineage-2026-11-05.md)、[冲突/修订对照](../../validation/UI-v2-formation-comparison-2026-11-05.md)、[暂存假说列表](../../validation/UI-v2-held-hypotheses-2026-11-05.md)、[召回建议阅读卡](../../validation/UI-v2-recall-suggestions-2026-11-05.md)、[合成预览窄视口](../../validation/UI-v2-preview-reflow-2026-11-05.md)、[旧 Vault 窄视口](../../validation/UI-v2-vault-reflow-2026-11-05.md)、[Context/Sessions 窄视口](../../validation/UI-v2-context-session-reflow-2026-11-06.md)、[Inspector/Settings 窄视口](../../validation/UI-v2-inspector-settings-reflow-2026-11-06.md)与[Home 窄视口](../../validation/UI-v2-home-reflow-2026-11-06.md)。此前逐片记录见 [2026-11-03 接续](CONTINUATION_2026-11-03.md)。此前已合入的原生前端续作见 [2026-11-02 记录](CONTINUATION_2026-11-02.md)。这些开发证据不代表发布、安装或人工验收。

1. [DESIGN.md](../../../DESIGN.md)：视觉的每个具体值（颜色、字体、间距、布局、动效、文案、禁区）。
2. [docs/design-decisions.md](../../design-decisions.md)：已经定下的决定。已记录的不重新讨论；要推翻就新增一条。
3. [SCREENS.md](SCREENS.md)：有哪些屏幕、每屏放什么、做到哪一步（已做 / 部分 / 未做 / 需后端）。
4. [OPEN_ISSUES.md](OPEN_ISSUES.md)：还没决定或已知有问题的地方。
5. [REFERENCES.md](REFERENCES.md)：参考图与方向的来历（参考原图不在仓库里）。
5a. [MEMORY_DATA_REQUIREMENTS.md](MEMORY_DATA_REQUIREMENTS.md)：前端对 Memory 记录格式与后端读取能力的需求，以及与 Core-7 的差距。
6. 截图：[shots/](shots/)，`dark-*` 是黛蓝、`light-*` 是宣纸；全部是浏览器演示的虚构数据，标「桩」的来自截图专用的 Tauri 桩。

仓库规则仍以根目录 `AGENTS.md`、`docs/MEMORY_INTEGRATION_v1.md`、`docs/design-kit/` 为准；本目录只描述界面。

## 参考实现

- UI v2 经 PR 合入 `main`（合并前在分支 `ui-v2/merge-main`；设计过程的分支是 `redesign/v2`，由 `redesign/08-negative` → `redesign/08-palettes` 收敛而来）。
- 记忆星图独立预览：开发服务器上的 `/starmap.html`（`?lang=zh|ja|en`）。界面语言：`?lang=` 或 Settings → Language。
- 浏览器演示：`apps/desktop` 里 `npm ci && npm run dev`，打开开发服务器地址。`?theme=dark|light` 强制明暗（默认跟随系统）。
- 浏览器 Memory 预览：五工作区二级导航；记忆下有 grid 和旧 Vault 主人审阅兼容列表。`?auto-dataset=empty|held|open-ended|source-missing|unknown-result|read-only` 选择自动记忆状态，`auto-workspace` 选择工作区。
- 旧 Vault 整屏状态：`?vault-dataset=empty|candidates|original`，仅浏览器、模块加载时选择；页面内可恢复原始样本。原生入口忽略这些参数。

## 文件地图（只列界面层）

| 文件 | 内容 |
| --- | --- |
| `apps/desktop/src/theme/palettes.css` | 两套配色的全部令牌（唯一写色值的地方） |
| `apps/desktop/src/quiet-runtime.css` | 共享 `.qr*` 类的外观、字体变量、反相规则、焦点、减少动画 |
| `apps/desktop/src/theme/negative.css` | 标题栏、记录带、时间小地图、首页图、Inspector 裁切角、Quick Search、原生门 |
| `apps/desktop/src/theme/automemory.css` | 自动记忆合成预览 |
| `apps/desktop/src/memory/memory.css`、`shell/quick-search.css` | 原生 Memory 表面与 Quick Search 的旧样式（由上面几份覆盖） |
| `apps/desktop/src/theme/negative-fonts.css`、`assets/fonts/` | Martian Mono + Geist，自托管，授权说明在 `assets/fonts/README.md` |
| `apps/desktop/src/theme/RecordStrip.tsx`、`TimeMap.tsx`、`chart.ts`、`timeview.ts`、`mapSpecs.ts` | 记录带、笔迹、时间小地图与平移状态（浏览器画虚构迹线；原生标示最新 Vault 提交及已读取会话的时间地图） |
| `apps/desktop/src/screens/*.tsx` | 六个表面的浏览器演示 |
| `apps/desktop/src/screens/automemory/*` | 合成预览（`fixture.ts` 是 15 条虚构记忆；预览懒加载） |
| `apps/desktop/src/memory/*`、`src/shell/*` | 原生路径（固定 Memory pin）；沿用领域契约，呈现实际回执与生命周期 |

## 不能动的契约

- 接口类名与属性：`.qr*`、`.mem-*`、`#quick-query`、`data-screen-label`、`nav[data-runtime-nav="primary"]` / `button[data-runtime-page]`（aria-label 继续本地化）、`role="switch"` 等都被测试、smoke 脚本或原生表面使用。只改外观，不改名。
- 行为：浏览器演示的虚构标注（「Demo · local only」「Fictional」）、原生里 Memory/Context/Sessions 走 Memory 适配器、Quick Search 的独立窗口与权限、1100×700 最小窗口、CSP、键盘（Ctrl+1…6、↑↓）、减少动画（系统设置与 `data-motion="reduced"`）。
- 三种状态分开（SCREENS.md 开头）：旧 pin 真实能力 / 合成预览 / 以后的受控采用。合成内容只在浏览器演示里出现，原生失败不得回退到演示。
- Activity / Usage 界面已移除，不要加回；它的后端与原生命令暂留，前端不调用。
- 不改 `apps/desktop/src-tauri`、Memory pin、后端契约，除非 owner 另行授权（OPEN_ISSUES #1 需要的原生改动也一样）。

## 每次界面改动后的检查

在 `apps/desktop`：

```bash
npm run check
```

```bash
npm test
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

另外：两套主题都看一遍（`?theme=dark`、`?theme=light`）；1100×700 不横向溢出；文字不小于 12px；对比度按 DESIGN.md §2 的口径测。DOM 测试在基线就偶发失败（OPEN_ISSUES #5），单独重跑确认。

## 协作

- Codex 实质参与提交时，按 `AGENTS.md` 加 `Co-authored-by: Codex <267193182+codex@users.noreply.github.com>`。
- 遇到 DESIGN.md 没写的问题：先在 `docs/design-decisions.md` 补一条决定，再改代码和 DESIGN.md。
- 截图与个人数据：截图只用虚构演示数据；不在测试快照、日志、文档里放真实记忆正文；参考原图不进仓库。

2026-11-06：Quick Search 的独立合成截图桩已带固定虚构标识，四态/三语/双主题及不重发检查见 [#11 记录](../../validation/UI-v2-quick-search-fixture-2026-11-06.md)。原生组件和历史 shots 未改。

2026-11-06：主题泳道日/7 天/自然月/六周缩放及标签可读性修正，见[合成验证](../../validation/UI-v2-timeline-scale-2026-11-06.md)；不改变时间精度，不代表原生时间投影接入。

2026-11-06：read-2 目录八种加载/失败/库状态的[独立合成截图桩](../../validation/UI-v2-catalog-state-fixture-2026-11-06.md)已补，原组件未改。

2026-11-07：read-1 自动记忆八种加载/失败/库状态的[独立合成截图桩](../../validation/UI-v2-read1-state-fixture-2026-11-07.md)已补，读取中增加可见提示。

2026-11-07：read-1 空库、召回无选中、详情已不在授权范围三种[无结果说明](../../validation/UI-v2-read1-empty-outcomes-2026-11-07.md)。

2026-11-07：read-2 目录检索无匹配与空目录的[分开说明](../../validation/UI-v2-read2-empty-results-2026-11-07.md)。

2026-11-07：记忆库列表七种加载/无结果/索引不可用状态的[独立合成截图桩](../../validation/UI-v2-memory-state-fixture-2026-11-07.md)，原组件未改。
