# UI v2 · 实现入口

给接手实现的人（Claude 或 Codex）。先读这一页，再按顺序读：

1. [DESIGN.md](../../../DESIGN.md)：视觉的每个具体值（颜色、字体、间距、布局、动效、文案、禁区）。
2. [docs/design-decisions.md](../../design-decisions.md)：已经定下的决定。已记录的不重新讨论；要推翻就新增一条。
3. [SCREENS.md](SCREENS.md)：有哪些屏幕、每屏放什么、做到哪一步（已做 / 部分 / 未做 / 需后端）。
4. [OPEN_ISSUES.md](OPEN_ISSUES.md)：还没决定或已知有问题的地方。
5. [REFERENCES.md](REFERENCES.md)：参考图与方向的来历（参考原图不在仓库里）。
6. 截图：[shots/](shots/)，`dark-*` 是黛蓝、`light-*` 是宣纸；全部是浏览器演示的虚构数据，标「桩」的来自截图专用的 Tauri 桩。

仓库规则仍以根目录 `AGENTS.md`、`docs/MEMORY_INTEGRATION_v1.md`、`docs/design-kit/` 为准；本目录只描述界面。

## 参考实现

- 分支 `redesign/v2`（由 `redesign/08-negative` → `redesign/08-palettes` 收敛而来）。只在本地，未推送、未合并。
- 浏览器演示：`apps/desktop` 里 `npm ci && npm run dev`，打开开发服务器地址。`?theme=dark|light` 强制明暗（默认跟随系统）。
- 自动记忆合成预览：Memory Vault 左栏「Automatic memory · synthetic preview」。

## 文件地图（只列界面层）

| 文件 | 内容 |
| --- | --- |
| `apps/desktop/src/theme/palettes.css` | 两套配色的全部令牌（唯一写色值的地方） |
| `apps/desktop/src/quiet-runtime.css` | 共享 `.qr*` 类的外观、字体变量、反相规则、焦点、减少动画 |
| `apps/desktop/src/theme/negative.css` | 标题栏、记录带、时间小地图、首页图、Inspector 裁切角、Quick Search、原生门 |
| `apps/desktop/src/theme/automemory.css` | 自动记忆合成预览 |
| `apps/desktop/src/memory/memory.css`、`shell/quick-search.css` | 原生 Memory 表面与 Quick Search 的旧样式（由上面几份覆盖） |
| `apps/desktop/src/theme/negative-fonts.css`、`assets/fonts/` | Martian Mono + Geist，自托管，授权说明在 `assets/fonts/README.md` |
| `apps/desktop/src/theme/RecordStrip.tsx`、`TimeMap.tsx`、`chart.ts`、`timeview.ts`、`mapSpecs.ts` | 记录带、笔迹、时间小地图与平移状态（只在浏览器演示画迹线；原生是空白带） |
| `apps/desktop/src/screens/*.tsx` | 六个表面的浏览器演示 |
| `apps/desktop/src/screens/automemory/*` | 合成预览（`fixture.ts` 是 15 条虚构记忆；预览懒加载） |
| `apps/desktop/src/memory/*`、`src/shell/*` | 原生路径（真实 Memory pin）；这一轮只换皮，不改逻辑 |

## 不能动的契约

- 接口类名与属性：`.qr*`、`.mem-*`、`#quick-query`、`data-screen-label`、`nav[aria-label="Primary"]`、`role="switch"` 等都被测试、smoke 脚本或原生表面使用。只改外观，不改名。
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

另外：两套主题都看一遍（`?theme=dark`、`?theme=light`）；1100×700 不横向溢出；文字不小于 12px；对比度按 DESIGN.md §2 的口径测。DOM 测试在基线就偶发失败（OPEN_ISSUES #5），单独重跑确认。

## 协作

- Codex 实质参与提交时，按 `AGENTS.md` 加 `Co-authored-by: Codex <267193182+codex@users.noreply.github.com>`。
- 遇到 DESIGN.md 没写的问题：先在 `docs/design-decisions.md` 补一条决定，再改代码和 DESIGN.md。
- 截图与个人数据：截图只用虚构演示数据；不在测试快照、日志、文档里放真实记忆正文；参考原图不进仓库。
