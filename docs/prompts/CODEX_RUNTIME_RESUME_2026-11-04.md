# Codex 新 session 启动提示词

以下内容可直接复制：

---

请接手 Enouia Runtime 的 UI v2 路线。上一轮由 Claude 完成，叠放的 PR #115 → #118 已按顺序合并进 `main`；不要从旧分支或旧工作树重新开始。

工作目录：`E:\Enouia Runtime`，分支 `main`。先 `git fetch`，核对 branch、HEAD、`origin/main`、status 和 worktrees，保留其他人的修改。`.worktrees/` 下的两个旧工作树内容已全部进 `main`，原样保留，不要删除。下一片从 `main` 开新分支做。

按顺序阅读：

1. `AGENTS.md`（硬规则与提交 trailer）。
2. `docs/integration/CLAUDE_TO_CODEX_2026-11-04.md`：最新交接，包括完成事项、验证边界、新规则和下一步。
3. 交接中引用的上一轮 `docs/integration/CODEX_TO_CLAUDE_2026-11-03.md`，其中的边界和 Memory 协同信息仍然有效。
4. 做到相关任务时，再读 `DESIGN.md`、`docs/design/ui-v2/SCREENS.md`、`OPEN_ISSUES.md`、`STARMAP_REFERENCES_2026-11-04.md` 和对应逐片报告，不要一次全读。

先简短说明你理解的现状和第一项范围，再按交接的“下一步”推进。建议首项是 #14 自动记忆演示的状态数据集（空库、仅暂存、开放端时间）：`fixture.ts` 不改；先处理交接里列出的崩溃点，每个视图要说明当前状态和下一步，文案通过新的 JSX 守卫和 `cjk-fonts`。之后做 #24 方案 1（静态底层缓存，外观不变），用 `--trace` 做前后对照，并逐像素比较空闲帧。

每完成一个切片就按范围验证、提交、推送。最近一次完整 `npm test` 在 #3 主题选择那一片（Node 139 通过 / 3 跳过 / 0 失败，DOM 88 个 fixture / 1,405 项断言）；原生 read-1 36/36、read-2 39/39 是更早 `d6d8dd4` 时的结果，本轮没有改 Rust；不要把这些写成合并后的最新全量结果。合并、发布和真实环境激活按各自权限与门槛处理。

只使用显式、自有的合成临时根和隔离 profile。不打开个人 Vault，不采用 Owner，不启用真实 Provider 或持续形成，不迁移、不部署；不要自动采用 Memory 未合并的 #83。Runtime 不实现 Memory 域，不扩展冻结的本地 crate，不恢复 Activity / Usage，不删除旧任务或 ledger。保留原始文本、未知结果和原始 packet / key，不因语言切换或轮询重发操作。

待 Morii 决定的事项（合成面板枚举 / 时间是否翻译、#24 是否采用“缓存 + 运动中隐藏主题线”）只记录、不推进；#3 / #4 / #13 / #15 / #17 已有决定，见 `OPEN_ISSUES.md`。物理托盘、热键冲突、登录启动、安装升级是独立验收项，不能用 smoke 或构建成功代替人工接受。遇到新契约或视觉取舍，先说明具体问题，不做推测性复杂化。
