# Runtime：Claude → Codex 交接（2026-11-04）

Morii 要求：完成当前部分后停下，推送并合并该合并的内容，交接给 Codex。本次已收尾：#115 → #116 → #117 → #118 按依赖顺序合并进 `main`（合并提交，未删分支）。没有等待中的构建或测试。

## 2026-11-04 追加（合并之后）

在 `claude/starmap-options-and-decisions` 分支上（见对应 PR）：
- Morii 授权 Claude 直接决定 #3 / #4 / #13 / #15 / #17，决定已写进 `OPEN_ISSUES.md`：#3 已实现（Settings 主题三选一，默认跟随系统，见 [记录](../validation/UI-v2-theme-preference-2026-11-04.md)）；#4 保持三栏常驻 Inspector；#13 采纳五工作区二级导航，排在 #14 之后实现；#15 定稿；#17 维持随 Activity 后端统一清理。
- #24 用 `starmap-diagnostics.mjs --options` 画出了五种主题线方案的对照图并测速，结果见 [参考调研](../design/ui-v2/STARMAP_REFERENCES_2026-11-04.md)“效果对照”。推荐“静态底层缓存 + 运动中隐藏主题线”，**等 Morii 确认后再改产品绘制**。

## 从哪里开始

- **继续用 `main`**。合并后 `main` 包含 UI v2 续作、精确 Memory pin `0d338f12f51a859363e0725071bcf43874b492c7`、read-2 合成原生入口、read-2 前端，以及 Claude 接续的全部切片。先 `git fetch`，核对 `origin/main` 的 HEAD 与本文描述一致，再从 `main` 开新分支做下一片。
- 原目录 `E:\Enouia Runtime` 在合并后快进到新的 `main`。工作树 `.worktrees/read2-pin-compatibility`（`codex/read2-synthetic-surface`）和 `.worktrees/ui-v2-review-continuation` 原样保留，内容已全部进 `main`；是否清理由 Morii 决定，不要自行删除分支或工作树。
- 上一轮交接 [Codex → Claude](CODEX_TO_CLAUDE_2026-11-03.md) 的边界和协同信息仍然有效。本文只补充 Claude 这一轮的结果和新待办。

## Claude 这一轮完成的切片

逐片记录见 [当日接续表](../design/ui-v2/CONTINUATION_2026-11-03.md)。

| 提交 | 内容 |
| --- | --- |
| `678f475` | read-2 原生三语 × 双主题 × 1100×700 矩阵；修复英文标签越框（`.mem-tag` 改为 `min-height`，Quick Search 结果标签保持 18px）；read-2 新增文案改用 CJK 子集已覆盖的字形（`3a5dc33` 起 `cjk-fonts` 失败）；修复 `catalog-memory` 的时序断言 |
| `a619013` | `tests/i18n.test.mjs` 新增解析守卫：用 Vite 的 `parseSync` 检查 JSX 字面文字、可访问名称和子表达式里的字面量；52 处改为整句翻译 |
| `4ed0b3d` | `operation-stop-observation` 等终态渲染提交后再断言（OPEN_ISSUES #5 同类） |
| `233571b` | #24 的 CDP 追踪诊断（`starmap-diagnostics.mjs --trace`），见 [追踪记录](../validation/UI-v2-starmap-trace-2026-11-03.md) |
| `0442ff0` | 演示记忆库区分空分组和搜索无匹配 |
| `d6d8dd4` | read-1 接入同一原生矩阵；矩阵抽成 `memory-smoke.mjs` 的共用 `surfaceMatrix` |
| `139dbd0` | [#24 参考调研](../design/ui-v2/STARMAP_REFERENCES_2026-11-04.md)：OmbreBrain-folio、Obsidian、sigma.js、Cosmograph、Zep |

## 验证状态（不要夸大）

- 最近一次完整 `npm test` 在 `0442ff0`：Node 142 项中 139 通过、3 跳过、0 失败；DOM 87 个 fixture、1,399 项断言全部通过。之后的 `d6d8dd4` 只改 smoke 脚本，`139dbd0` 和本交接只改文档。
- 原生（`d6d8dd4` 时的调试构建，包含截至 `0442ff0` 的前端）：`--automatic-only` 36/36，`--catalog-only` 39/39，均在新建的自有合成临时 fixture 上运行。
- Rust：本轮没有改 Rust。最近的完整 Rust 结果仍是 Codex 原生入口切片的 50+8，以及 `3a5dc33` 的目标 5 项；不要写成最新全量。
- 合并后的 `main` 没有再跑整套。若下一片涉及原生或 Rust，先按范围跑 [Memory integration v1](../MEMORY_INTEGRATION_v1.md) 列出的检查。

## 新规则和工具（以后每片都要遵守）

- 改了中日文字典，就要和 i18n 一起跑 `node --test tests/cjk-fonts.test.mjs`。缺字时改用子集已覆盖的等义措辞，不重新子集化字体（OPEN_ISSUES #19 是 Morii 定的字体包）。
- 新守卫会拦住未经 `t()` 的界面英文。例外只有 `lang="en"`、`<code>` / `<kbd>` / `<samp>`、产品名、`UTC+8`、`GiB`、按键名、路径和链接。演示数据和 fixture 里的虚构内容保持英文。
- 合成面板的库状态、枚举值和 ISO 时间按 `413d318` 的约定保持原样。Morii 尚未回答是否要翻译，答复前不要改。
- 原生 smoke 的 `surfaceMatrix(s, app, id, prefix, titles, observed)` 可以复用到新的原生面板。四个位置参数都必须是新建、自有、不含个人数据的临时路径，fixture 目录名前缀要符合各模式的检查。

## 下一步（按顺序）

1. **#14 演示状态集（实现者负责）。** 目标是 SCREENS §4 / §6 的“空库、仅暂存 / 候选、开放端时间（`occurred.end: null`）”等状态，只用于浏览器演示。已确认的约束和崩溃点：
   - `fixture.ts` 按其自身注释不改。新增状态数据文件，再加一个模块级的数据集选择（例如 `dataset.ts` 读取演示专用的 URL 参数），让 `model.ts`、`Grid.tsx`、`Timeline.tsx`、`AutoMemory.tsx` 改为从这里导入 `AUTO_MEMORIES`。
   - 空数据集会直接崩：`AutoMemory.tsx` 默认 `sel = 'am_05'`，并对 `byId.get(sel)` 做非空断言。Formation 的 `STREAM`（在 `fixture.ts` 里由 `AUTO_MEMORIES` 派生）、`RELATIONS` 和 `RECALL_CASES` 都引用固定 id，需要随数据集一起派生或过滤。
   - 每个视图都要有说明“现在是什么状态、下一步是什么”的空 / 仅暂存分支，文案走 `t()`，并通过新守卫和 `cjk-fonts`。
   - Vault 演示（`App.tsx` / `demo-data.ts`）的整屏空库牵涉 Home、Context、Sessions 对固定记忆的引用（`requireMemory` 会抛错），建议在自动记忆状态之后另开一片。
2. **#24 方案 1：缓存静态底层（外观不变）。** 把“背景 + 环 + 连线”缓存到同 DPR 的离屏画布；只在布局、缩放、平移、选择、悬停、主题或尺寸变化时重画，空闲闪烁帧只做一次 1:1 `drawImage` 再画星点。先确认高亮 / 悬停线与星点的叠放顺序不变；用 `--trace` 做前后对照，并逐像素比较空闲帧。球体自转期间缓存帮不上，运动中的成本属于视觉取舍（隐藏连线 / 实线等），等 Morii 决定，不要擅自改。
3. **#13 Memory 信息架构**：已采纳五个工作区作为 Memory 二级导航，旧 Vault 列表作为“记忆”工作区的兼容视图；在 #14 之后实现。
4. **继续有证据的文案 / 等待恢复审阅**，沿用“先复现，再最小修复”的做法。新守卫已覆盖 JSX 字面量；`.ts` 模块返回给界面的字符串仍要人工检查。

## 待 Morii 决定（不要擅自推进）

- 合成面板的库状态 / 枚举 / 时间是否翻译。
- #24 是否采用推荐的“缓存 + 运动中隐藏主题线”（缓存部分外观不变，可先做）。
- #3 / #4 / #13 / #15 / #17 已于 2026-11-04 由 Claude 经授权决定，不再列为待决。
- 独立验收：物理托盘 #25、安装 / 升级 #27、默认 Ctrl+Alt+M 冲突 #28、真实登录启动。不能用测试热键 Q 的 smoke 或候选包构建成功替代人工接受。

## 不变的边界

- Runtime 只维护宿主、适配器和前端；Memory 域归 `Morii9961/enouia-memory`。只用 exact Git pin，不提交路径依赖、分支或 patch，不扩展冻结的 Runtime 本地 crate。不要自动采用 Memory 未合并的 #83；Memory 协同 session ID 见上一轮交接。
- 不打开个人 Vault，不采用 Owner，不启用真实 Provider 或持续形成，不迁移、不部署。Activity / Usage 的 UI 和命令不得恢复；旧 producer、任务和 ledger 未经单独授权不清理。
- 每片按范围验证、提交、推送。Codex 实质参与的提交加 `AGENTS.md` 规定的 Codex trailer；不要给 Claude 的旧提交补 trailer。

新 session 可以直接复制 [启动提示词](../prompts/CODEX_RUNTIME_RESUME_2026-11-04.md)。
