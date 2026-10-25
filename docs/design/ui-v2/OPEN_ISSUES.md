# 未决问题

实现前或实现中要处理、或者要 owner 决定的事。解决一条就在 `docs/design-decisions.md` 记一条决定，并在这里标「已解决 → 决定日期」。

| # | 问题 | 为什么重要 | 建议 | 需要谁 |
| --- | --- | --- | --- | --- |
| 1 | **原生窗口首帧底色写死。** `src-tauri/tauri.conf.json` 两个窗口 `backgroundColor: #0C1117`，`apps/desktop/index.html` 的 `theme-color` 也是 `#0C1117`。 | 浅色（宣纸）打开时先闪一下深色；深色黛蓝 `#0F1C23` 与它也有轻微色差。 | 原生按系统明暗设首帧底色（黛蓝 / 宣纸），`index.html` 同步。 | owner 授权改 `src-tauri` |
| 2 | **测试断言了导出类名。** e2e 与 smoke 依赖 `button.qr43`、`.qr12 .qr10/.qr11`、`.qr31`、`.qr45`、`#quick-query` 等。 | 改名会让测试与原生 smoke 失效。 | 实现时只改外观；需要新结构就加新类名，旧类名保留。 | 实现者 |
| 3 | **没有应用内明暗覆盖。** 现在只跟随系统（演示可用 `?theme=`）。 | 有人想白天用深色。 | 若要加，放在 Settings → Appearance → Theme 一行（Follow system / Tile Blue / Xuan Paper），状态只存本地偏好。 | owner 决定要不要 |
| 4 | **1100–1279 宽的 Inspector。** Memory UI 规格建议 900–1279 改为抽屉；Runtime 最小窗口 1100，目前在 1100 仍是三栏（Inspector 336–400px）。 | 1100 下主列表偏窄，长正文换行多。 | 先在演示里各做一版（常驻 vs 抽屉）截图比较。 | owner 选 |
| 5 | **DOM 测试在基线就不稳定。** 3 次全量 `npm test` 曾有 2 次失败，失败的 fixture 不固定（如 `inspector-action-focus`、`operation-cancel`），单独重跑通过。 | 会把真实回归和偶发失败混在一起。 | 单独查时序；在那之前失败的 fixture 单独重跑确认。 | 实现者 |
| 6 | **记忆星图的规模与技术。** 现在只有 15 条虚构记忆的邻域图（SVG）。全库星图需要后端授权聚合投影。 | 节点到几百上千时 SVG 会慢。 | 按 Memory UI 规格：先用合成规模样例（如 200 / 1,000 / 5,000 节点）测帧率与布局时间，再在 SVG / Canvas / Web Worker 布局间选；需要新依赖时另记决定。 | 实现者 + owner（依赖） |
| 7 | **皮肤值写在视图模型里。** `App.tsx renderVals()` 仍输出旧 Quiet 颜色（`bg`、`fg`、`TONE`、`STATUS`、开关颜色），`demo-data.ts` 的 Context 分区也带色值；现在靠 CSS `!important` 覆盖。 | 改主题时容易漏；`!important` 越积越多。 | 实现时把这些字段改成状态名（如 `data-tone`），颜色只在 CSS。 | 实现者 |
| 8 | **Inspector 里的长 ID 越界。** Memory Vault 的 Session ID 超出右侧裁切角（截图 `dark-memory-1440`）。 | 破坏唯一的框。 | ID 用 `overflow-wrap: anywhere` 或中间省略 + Copy。 | 实现者 |
| 9 | **11.5px 文字。** `memory/memory.css` 的 `.mem-tag` 写 11.5px（原生表面旧样式）。 | 低于 12px 下限。 | 改 12px，检查标签高度 20px 是否还放得下。 | 实现者 |
| 10 | **全局 ↑/↓ 作用于看不见的列表。** 浏览器演示在 Memory 页对输入框与导航之外的 ↑/↓ 选择 Vault 演示记录并 `preventDefault`。 | 任何自带列表的新视图都会和它抢方向键。 | 只在焦点位于列表内时处理方向键。 | 实现者（改 `App.tsx` 键盘逻辑需谨慎，有测试） |
| 11 | **Quick Search 没有「虚构/真实」标注。** 原生里显示真实记忆；浏览器里不渲染。 | 截图只能靠桩，容易误认。 | 原生保持现状；截图桩里加「Fictional」水印即可。 | 实现者 |
| 12 | **已解决（2026-10-25，`AGENTS.md` 范围段落已改为六个表面、只服务 Memory）。** 原问题：仓库说明仍写七个表面与 Activity 页。 `AGENTS.md`「Current user scope」写 seven surfaces 与 ADR-028 的 Activity 页面；`docs/FRONTEND_IMPLEMENTATION_v1.md` 同。 | 后来的人（含 Codex）可能照着把 Activity 加回来。 | owner 更新 `AGENTS.md` 的范围段落；旧文档顶部已加一行指向决定记录。 | owner |
| 13 | **合成预览的入口位置。** 现在是 Memory Vault 左栏的一个入口，挤进首屏。 | 自动化后端到来后，五个工作区才是 Memory 的主结构。 | 实现前定 Memory 区域的信息架构：五个工作区作为 Memory 内的二级导航，旧 pin 的 Vault 列表作为「记忆」工作区的兼容视图。 | owner 选 |
| 14 | **合成数据缺口。** fixture 没有 `occurred.end: null` 的记录，开放端帽只在图例出现；也没有空库、仅候选、结果未知等状态的数据。 | 十种状态没法截图。 | 新增一份状态 fixture（不改现有 15 条）。 | 实现者 |
| 15 | **两条口径仍是「试验」。** 星图 `+ / −` 是缩放；时间按 Asia/Shanghai（UTC+8）。 | 已按此实现，但 owner 未最终确认。 | 确认后把决定状态改为定稿。 | owner |
| 16 | **Runtime Inspector 组件名挤。** 1440 宽下「Context Compiler」与状态读数挤在一行。 | 小的排版问题。 | 组件列加宽或状态换行。 | 实现者 |
| 18 | **主 JS 超过 500 kB。** 合并 main 后 `index-*.js` 为 513.6 kB（Vite 提示线 500 kB），新增的是原生历史任务、Provider 配置等面板。 | 首屏加载变慢；提示会一直出现。 | 把历史任务与 Provider 配置面板像合成预览一样 `React.lazy` 懒加载。 | 实现者 |
| 17 | **已无前端用途的脚本。** `scripts/prepare-activity-surface-sandbox.mjs` 只服务已删除的 Activity 页 smoke；`e2e/memory-smoke.mjs` 仍向原生程序传 `--activity-settings`（`src-tauri/src/activity.rs` 仍解析它；原生命令本身已由 ADR-037 撤下）。 | 清理范围约定为「等 Moriium 替代链路完成后另行清理」。 | 届时与 Activity 后端一起删。 | owner 排期 |
