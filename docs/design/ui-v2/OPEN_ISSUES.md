# 未决问题

实现前或实现中要处理、或者要 owner 决定的事。解决一条就在 `docs/design-decisions.md` 记一条决定，并在这里标「已解决 → 决定日期」。

| # | 问题 | 为什么重要 | 建议 | 需要谁 |
| --- | --- | --- | --- | --- |
| 1 | **已解决（2026-10-26 → 决定「W3 原生启动底色」）。** 在创建窗口前按 Windows 应用主题设置两个窗口的底色；HTML 首次解析也按媒体查询使用同一套纸色。详见 [W3 记录](../../validation/UI-v2-W3-background-2026-10-26.md)。 | 浅色系统的空白 WebView、脚本加载前 HTML 和完整界面均为宣纸；深色 HTML 与完整界面为黛蓝。 | 保留记录中的原生第一帧测量边界；不把 `about:blank` 的 Chromium 暗色默认底当成应用文档底色。 | 已获 owner 授权并实现 |
| 2 | **测试断言了导出类名。** e2e 与 smoke 依赖 `button.qr43`、`.qr12 .qr10/.qr11`、`.qr31`、`.qr45`、`#quick-query` 等。 | 改名会让测试与原生 smoke 失效。 | 实现时只改外观；需要新结构就加新类名，旧类名保留。 | 实现者 |
| 3 | **没有应用内明暗覆盖。** 现在只跟随系统（演示可用 `?theme=`）。 | 有人想白天用深色。 | 若要加，放在 Settings → Appearance → Theme 一行（Follow system / Tile Blue / Xuan Paper），状态只存本地偏好。 | owner 决定要不要 |
| 4 | **1100–1279 宽的 Inspector。** Memory UI 规格建议 900–1279 改为抽屉；Runtime 最小窗口 1100，目前在 1100 仍是三栏（Inspector 336–400px）。 | 1100 下主列表偏窄，长正文换行多。 | 先在演示里各做一版（常驻 vs 抽屉）截图比较。 | owner 选 |
| 5 | **DOM 测试在基线就不稳定。** 3 次全量 `npm test` 曾有 2 次失败，失败的 fixture 不固定（如 `inspector-action-focus`、`operation-cancel`），单独重跑通过。 | 会把真实回归和偶发失败混在一起。 | 单独查时序；在那之前失败的 fixture 单独重跑确认。 | 实现者 |
| 6 | **记忆星图的规模与技术。** 已有合成原型（`redesign/v2`）：Canvas 绘制；球体一次算好（5,000 条 28ms），星系在 Worker 里用自写的 Barnes–Hut 收敛（5,000 条约 460ms）；以下为旧力导向的数据：生产构建实测 5,000 节点布局约 0.5 s、每帧 JS 绘制 < 1 ms（无头 Edge，未在 WebView2 实测）。全库星图仍需要后端授权的图投影（MEMORY_DATA_REQUIREMENTS §3）。 | 节点到几百上千时 SVG 会慢。 | 按 Memory UI 规格：先用合成规模样例（如 200 / 1,000 / 5,000 节点）测帧率与布局时间，再在 SVG / Canvas / Web Worker 布局间选；需要新依赖时另记决定。 | 实现者 + owner（依赖） |
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
| 17 | **已无前端用途的脚本。** `scripts/prepare-activity-surface-sandbox.mjs` 只服务已删除的 Activity 页 smoke；`e2e/memory-smoke.mjs` 仍向原生程序传 `--activity-settings`（`src-tauri/src/activity.rs` 仍解析它；原生命令本身已由 ADR-037 撤下）。 | 清理范围约定为「等 Moriium 替代链路完成后另行清理」。 | 届时与 Activity 后端一起删。 | owner 排期 |
| 19 | **已解决（2026-10-26 → 决定「中日字体定稿」，打包见 HANDOFF_CODEX W4）。中文、日文字体。** 系统字体（雅黑 UI、游ゴシック UI）被 Morii 否决：太常规，没有 Geist / Martian Mono 那种个性（2026-10-26）。第一轮比较（只用已装字体）在 `.design/review/fonts/`；第二轮（2026-10-26，下载了下列候选，按「标签/标题」与「正文」两个角色配对，真实界面截图对比）在 `.design/review/fonts2/`。第二轮倾向：日文 M PLUS 1 Code（标签/标题）+ Zen Kaku Gothic New（正文）；中文 得意黑（标签/标题）+ 霞鹜新晰黑（正文），若 12px 小标签嫌得意黑太响，则只让 ≥18px 的标题用它。更纱等宽的汉字近似普通黑体，不推荐；Noto Serif 只适合大标题。 | 中文、日文界面的气质全靠它。 | 按角色分开选：**标签/标题**（Martian 的角色）要有技术感或个性，**正文**（Geist 的角色）要清晰。第二轮候选（需要先下载，下载前要 owner 同意）：中文标题 得意黑 Smiley Sans（OFL，v2.0.1 zip 5.5 MB）、中文正文 霞鹜新晰黑 LXGW Neo XiHei（IPA 授权，v1.308 ttf 7.1 MB）、中日等宽标签 更纱 Sarasa Mono SC / J（OFL，按单个字族下载）、日文标签 M PLUS 1 Code（OFL）、日文正文 Zen Kaku Gothic New（OFL）。不用下载就能试的：已装的 Noto Serif SC / JP 做大标题（宋体/明朝的对比）。选定后子集化成 woff2 按 `unicode-range` 分片自托管，更新 DESIGN.md §3 与 `assets/fonts/README.md`。 | owner 选；实现者打包 |
| 20 | **W2 已执行（2026-10-26），发现项待后续处理。** 原生 WebView2：两尺寸 × 两主题 × 三语言 × Windows 实机 100/125/150% DPI，共 216 张无库截图；另有 36 张空测试库截图，中文/日文完整进程重启、跟随系统与实际 Windows 减少动画验证。详见 [W2 记录](../../validation/UI-v2-W2-native-2026-10-26.md)。字体仍为系统回退，星图性能属于 W5。 | 原生截图和检查不等于个人数据、真实 Provider 或 owner 验收。 | W4 打包字体；W5 单独测星图；本次新发现见 #21–23，不在 W2 修复。 | 实现者 |
| 18 | **主 JS 超过 500 kB。** 合并 main 后 `index-*.js` 为 513.6 kB（Vite 提示线 500 kB），新增的是原生历史任务、Provider 配置等面板。 | 首屏加载变慢；提示会一直出现。 | 把历史任务与 Provider 配置面板像合成预览一样 `React.lazy` 懒加载。 | 实现者 |
| 21 | **本地化后的导航名与记录的选择器契约不一致。** W2 实测中文 `nav[aria-label="主导航"]`、日文 `nav[aria-label="メインナビゲーション"]`，英文为 `Primary`；README 的固定 `nav[aria-label="Primary"]` 不匹配中日界面。 | 原生 smoke 若直接沿用英文选择器，会把正常加载误报为超时。 | 后续单独协调本地化可访问名称与稳定测试挂钩；W2 使用原有 `.bg-nav-item` 观察，不改产品契约。 | 实现者 |
| 22 | **中日原生表面仍有裸英文文案。** W2 无库状态出现 `No Vault open`、`New Vault in an empty folder. Type create new vault to confirm.`；空库有 `No approved memories here yet.`、`Choose a session`；Inspector 的轮询说明仍为英文。 | 字典覆盖检查通过，仍未覆盖动态分支和未标记文字。 | 后续单独补 `t()`/`msg()` 与中日译文，并在原生无库/空库路径复验。 | 实现者 |
| 23 | **日文原生 Sessions 按钮换行越过按钮底边。** W2 1100×700 空库截图中，「ワークスペースの呼び出しを更新」末字落到边框下方。 | 仅检查页面横向溢出发现不了固定按钮高度与翻译长度的冲突。 | 后续单独检查原生按钮的最小高度、换行与纵向可达性；保留现有键盘与类名契约。 | 实现者 |
