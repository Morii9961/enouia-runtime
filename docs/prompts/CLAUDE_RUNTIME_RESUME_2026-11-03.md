# Claude 新 session 启动提示词

以下内容可直接复制：

---

请接手 Enouia Runtime 当前 UI v2 / read-2 合成集成路线。先阅读交接，不要从旧 main 或旧 pin 重新做一遍。

实际继续工作的目录：`E:\Enouia Runtime\.worktrees\read2-pin-compatibility`，当前分支应为 `codex/read2-synthetic-surface`。目录名虽然叫 pin-compatibility，但目前已包含后续原生和前端切片，不要切回旧分支。功能代码基线是 `3a5dc335f6b371756f518df2759cd2dfa86d49c2`，后面还有交接文档提交。原目录 `E:\Enouia Runtime` 的 main 保持 `61715c1`，不要在那里覆盖开发。

先核对 branch、HEAD、remote、status、worktrees，保留其他人的修改；然后读：

1. 当前工作树的 `AGENTS.md` 与 `CLAUDE.md`。
2. `docs/integration/CODEX_TO_CLAUDE_2026-11-03.md`，这是最新交接入口，包含全部完成事项、PR 依赖、验证边界和剩余任务。
3. `docs/validation/UI-v2-read2-surface-2026-11-03.md`、`docs/MEMORY_INTEGRATION_v1.md`。
4. 做到相关任务再读 `DESIGN.md`、`docs/design/ui-v2/README.md`、`OPEN_ISSUES.md` 和对应逐片报告，不要一次加载所有历史文档。

Codex 已完成并推送手头 read-2 前端，创建草稿 PR #118，叠放在 #117 原生入口、#116 精确 Memory pin、#115 UI 续作之上；均未合并。Memory pin 为已合并 `0d338f12f51a859363e0725071bcf43874b492c7`。当前固定三条合成记录的分页/字面搜索/同 selection 统计/锁定、授权到期观察已落地。最新原生 21/21、目标 Rust 5、DOM 23 和其他定向检查通过；不要把旧完整套结果写成最新全量结果。

先简短说明你理解的现状和第一项范围，然后继续现有路线。建议首项检查新 read-2 collection 的原生三语、窄窗口与主题表现，针对实际问题作最小修复；这些尚未做完整原生矩阵。之后再继续有证据的动态文案/等待恢复问题。每完成一个切片就按范围验证、提交、推送，再推进；项目协同可直接联系已有相关 session。合并、发布和真实环境激活仍按各自权限与激活门槛处理，不因为草稿 PR 或合成测试通过而推定获准。

只使用显式、自有的合成临时根和隔离 profile。不要打开个人 Vault、采用 Owner、启用真实 Provider/持续形成、迁移或部署；不要自动采用 Memory 未合并 #83。Runtime 不实现 Memory 域，不扩展冻结本地 crates，不恢复 Activity/Usage，不删旧任务/ledger。保留原始文本、未知操作结果和原始 packet/key，不因语言或轮询重发操作。

星图 #24 仍未解决，产品绘制保持原状。物理托盘、默认热键冲突、登录启动和安装升级是独立验收待办；不能用旧 Q smoke 或构建成功代替人工接受。遇到新契约或视觉取舍先解释具体问题，不做推测性复杂化。

请在现有授权范围内推进，不重复索要常规继续许可；也不要擅自把未完成的激活边界当作普通前端任务。
