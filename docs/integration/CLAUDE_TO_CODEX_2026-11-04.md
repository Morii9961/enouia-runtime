# Runtime：Claude → Codex 交接（2026-11-04）

Morii 要求：整理收尾，合并该合并的内容，交接给 Codex。本次已收尾。#115 → #116 → #117 → #118 → #119 都已按顺序以合并提交进入 `main`，分支保留。没有等待中的构建、测试或未合并的 PR。

## 从哪里开始

- **工作目录 `E:\Enouia Runtime`，分支 `main`。** 先 `git fetch`，确认 `origin/main` 是 #119 的合并提交，再从 `main` 开新分支做下一片。
- 主目录已快进到最新 `main`，平时请在那里开发。`.worktrees/read2-pin-compatibility` 与 `.worktrees/ui-v2-review-continuation` 的内容已全部进入 `main`，原样保留；是否清理由 Morii 决定，不要自行删除分支或工作树。
- 上一轮 [Codex → Claude 交接](CODEX_TO_CLAUDE_2026-11-03.md) 中的边界和 Memory 协同信息仍然有效；本文是之后的完整状态。

## 现在 `main` 里有什么

- UI v2 续作（三语动态文案、保留回执 / 错误、星图诊断工具）。
- Memory 精确 pin `0d338f12f51a859363e0725071bcf43874b492c7`（Workspace v1 / 58 命令兼容）。
- 独立的 read-2 合成原生入口（`--memory-catalog-synthetic`，`memory_catalog` schema 2），以及消费 page + stats 的前端，均只用固定的三条合成记录。
- Claude 本轮的切片（逐片记录见 [接续表](../design/ui-v2/CONTINUATION_2026-11-03.md)）：

| 提交 | 内容 |
| --- | --- |
| `678f475` | read-2 原生三语 × 双主题 × 1100×700 矩阵；`.mem-tag` 改为 `min-height`（Quick Search 结果标签保持 18px）；read-2 文案改用 CJK 子集已覆盖的字形；修复 `catalog-memory` 时序断言 |
| `a619013` | `tests/i18n.test.mjs` 新增解析守卫（Vite `parseSync`），覆盖 JSX 字面文字、可访问名称和子表达式字面量；52 处改为整句翻译 |
| `4ed0b3d` | `operation-stop-observation` 等终态渲染提交后再断言 |
| `233571b` | #24 CDP 追踪：成本在 GPU 进程的光栅反序列化，虚线主题线约占每帧 GPU 光栅的 80%（[记录](../validation/UI-v2-starmap-trace-2026-11-03.md)） |
| `0442ff0` | 演示记忆库区分空分组与搜索无匹配 |
| `d6d8dd4` | read-1 接入同一原生矩阵（`memory-smoke.mjs` 的共用 `surfaceMatrix`） |
| `139dbd0` | [#24 参考调研](../design/ui-v2/STARMAP_REFERENCES_2026-11-04.md)（OmbreBrain-folio、Obsidian、sigma.js、Cosmograph、Zep） |
| `8a9b46d` | #3：Settings 主题三选一（跟随系统 / 黛蓝 / 宣纸），本机偏好，Quick Search 跟随（[记录](../validation/UI-v2-theme-preference-2026-11-04.md)） |
| `7817f99` 及之后 | `starmap-diagnostics.mjs --options` 五种主题线方案的对照图与测速；记录 #3 / #4 / #13 / #15 / #17 的决定和 #24 选 B |

## 已定的决定（`OPEN_ISSUES.md` 有原文）

| 项 | 决定 | 状态 |
| --- | --- | --- |
| #24 星图性能 | **方案 B：运动中隐藏主题线**（Morii 选定） | 待实现，下一步第 1 项 |
| #3 应用内主题 | 三选一，默认跟随系统 | 已实现 |
| #4 1100–1279 Inspector | 保持三栏常驻，不做抽屉 | 已定，无需改动 |
| #13 Memory 信息架构 | 五个工作区作为二级导航，旧 Vault 列表作为“记忆”工作区的兼容视图 | 待实现，排在 #14 之后 |
| #15 两条试验口径 | 定稿：`+ / −` 为缩放；时间按 Asia/Shanghai（UTC+8） | 已定 |
| #17 Activity 旧脚本 | 维持随 Activity 后端统一清理 | 维持排期 |

#3 / #4 / #13 / #15 / #17 是 Morii 授权 Claude 决定的；#24 的 B 由 Morii 本人选定。

## 下一步（按顺序）

1. **#24 方案 B。** 在 `apps/desktop/src/screens/automemory/StarMap.tsx` 的 `draw()` 里，当 `loop.current.busy` 为真时跳过 `theme` 那一批连线。`busy` 汇总了布局过渡、星点漂移、拖住星点、相机平移 / 缩放、甩动惯性、自转和滚筒旋转（约第 336 行）。停下后的下一帧照常画回全部主题线。`source` / `supersedes` 连线和选中 / 悬停高亮线不变；空闲帧要与现状逐像素一致。验证方法：
   - 用 `starmap-diagnostics.mjs` 分别测运动中和空闲时的帧间隔，并与 [效果对照](../design/ui-v2/STARMAP_REFERENCES_2026-11-04.md) 的数字比较（无头 Edge 下原样约 141 / 104 ms，隐藏主题线约 40 / 33 ms）；
   - 空闲帧做前后像素比较；
   - 在浏览器里检查停下后主题线确实恢复。
   方案 0（静态底层缓存）不改外观，但不在本次决定范围内，B 落地后如仍需提速可另开一片。C / D / E 不采用。完成后在 `OPEN_ISSUES` #24 写入结果；只有达到目标更新频率，才能宣称 #24 解决。
2. **#14 自动记忆演示状态集。** 目标是 SCREENS §4 / §6 的“空库、仅暂存 / 候选、开放端时间（`occurred.end: null`）”等状态，只用于浏览器演示。
   - `fixture.ts` 按其自身注释不改。新增状态数据文件，再加模块级的数据集选择（例如 `dataset.ts` 读取演示专用 URL 参数），让 `model.ts`、`Grid.tsx`、`Timeline.tsx`、`AutoMemory.tsx` 改为从这里导入 `AUTO_MEMORIES`。
   - 空数据集会直接崩：`AutoMemory.tsx` 默认 `sel = 'am_05'`，并对 `byId.get(sel)` 做非空断言。`STREAM`（在 `fixture.ts` 里由 `AUTO_MEMORIES` 派生）、`RELATIONS`、`RECALL_CASES` 都引用固定 id，需要随数据集派生或过滤。
   - 每个视图都要有空 / 仅暂存分支，说明“现在是什么状态、下一步是什么”；文案走 `t()`，通过 JSX 守卫和 `cjk-fonts`。
   - Vault 演示（`App.tsx` / `demo-data.ts`）的整屏空库牵涉 Home、Context、Sessions 通过 `requireMemory` 引用固定记忆，建议另开一片。
3. **#13 Memory 信息架构**：按上表的决定实现。它会改动 #14 的同一块预览，所以排在 #14 之后。
4. **继续有证据的文案 / 等待恢复审阅**，沿用“先复现，再最小修复”。JSX 字面量已有守卫；`.ts` 模块返回给界面的字符串仍需人工检查。

## 验证状态（不要夸大）

- 最近一次完整 `npm test` 在 #3 那一片（`8a9b46d` 的工作树）：Node 142 项中 139 通过、3 跳过、0 失败；DOM 88 个 fixture、1,405 项断言全部通过。之后只改了诊断脚本和文档。
- 原生：`d6d8dd4` 时的调试构建（包含截至 `0442ff0` 的前端）上，`--automatic-only` 36/36、`--catalog-only` 39/39，均为新建的自有合成临时 fixture。新的 Settings 主题一行只在浏览器预览中验证过，**没有做原生验收**。
- Rust：本轮没改。最近的完整结果仍是 Codex 原生入口切片的 50+8，以及 `3a5dc33` 的目标 5 项。
- 合并后的 `main` 只跑了 Memory pin 与 Activity 退役检查，没有重跑整套。涉及原生或 Rust 的切片，先按 [Memory integration v1](../MEMORY_INTEGRATION_v1.md) 跑对应检查。

## 每片都要遵守的规则和工具

- 改了中日文字典，就要和 i18n 一起跑 `node --test tests/cjk-fonts.test.mjs`。缺字时改用子集已覆盖的等义措辞，不重新子集化字体（#19 是 Morii 定的字体包）。
- JSX 守卫会拦住未经 `t()` 的界面英文。例外只有 `lang="en"`、`<code>` / `<kbd>` / `<samp>`、产品名、`UTC+8`、`GiB`、按键名、路径和链接；演示数据和 fixture 里的虚构内容保持英文。
- 合成面板的库状态、枚举值和 ISO 时间按 `413d318` 的约定保持原样；Morii 尚未回答是否翻译，答复前不要改。
- 原生 smoke 的 `surfaceMatrix(s, app, id, prefix, titles, observed)` 可以复用到新的原生面板。四个位置参数都必须是新建、自有、不含个人数据的临时路径，fixture 目录名前缀要符合各模式的检查。
- 星图诊断：`node e2e/starmap-diagnostics.mjs <msedge.exe> target/<dir> [--dashes | --context | --trace | --options]`（cwd `apps/desktop`），只访问虚构星图，输出留在忽略的 `target/`。
- 本机命令的 PATH 需前置 `C:\msys64\ucrt64\bin;C:\Users\Morii\.cargo\bin;`，Cargo 设 `CARGO_NET_OFFLINE=true`、`CARGO_INCREMENTAL=0`、`CARGO_BUILD_JOBS=2`；Node ≥ 24.15.0。主目录合并后可能还没有 `node_modules`，第一次需要 `npm ci`（在 `apps/desktop`）。

## 待 Morii 决定（只记录，不推进）

- 合成面板的库状态 / 枚举 / 时间是否翻译。
- 独立验收：物理托盘 #25、安装 / 升级 #27、默认 Ctrl+Alt+M 冲突 #28、真实登录启动。不能用测试热键 Q 的 smoke 或候选包构建成功替代人工接受。

## 不变的边界

- Runtime 只维护宿主、适配器和前端；Memory 域归 `Morii9961/enouia-memory`。只用 exact Git pin，不提交路径依赖、分支或 patch，不扩展冻结的 Runtime 本地 crate。不要自动采用 Memory 未合并的 #83；Memory 协同 session ID 见上一轮交接。
- 不打开个人 Vault，不采用 Owner，不启用真实 Provider 或持续形成，不迁移、不部署。Activity / Usage 的 UI 和命令不得恢复；旧 producer、任务和 ledger 未经单独授权不清理。
- 每片按范围验证、提交、推送。Codex 实质参与的提交加 `AGENTS.md` 规定的 Codex trailer；不要给 Claude 的旧提交补 trailer。
- 新 PR 的合并需要 Morii 明确同意。

新 session 可以直接复制 [启动提示词](../prompts/CODEX_RUNTIME_RESUME_2026-11-04.md)。
