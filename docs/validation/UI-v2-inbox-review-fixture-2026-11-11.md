# UI v2：收件箱审阅冲突与草稿恢复截图（2026-11-11）

从 `main@217cd7c6d61a72bc3423a83f11ff42fc78a76add`（#172 合并提交）接续 [2026-11-07 交接](../integration/CLAUDE_TO_CODEX_2026-11-07.md) 的状态截图路线，为 [审阅计划过期 DOM 场景](UI-v2-inbox-stale-plan-2026-11-07.md) 和 [草稿旁显示已保存提议](UI-v2-draft-shows-saved-2026-11-07.md) 补视觉证据。本片只新增取证桩、脚本和文档，没有修改产品代码、翻译或 Memory pin。

## 四个状态

`apps/desktop/e2e/inbox-review-preview.html` / `.tsx` 渲染真实 `MemorySurface` 的收件箱及真实 `PlanDialog`。候选、计划和全部回执均为合成数据，顶部始终带 `FICTIONAL FIXTURE · NO NATIVE CONNECTION` 水印。

| 状态 | 已发生的合成流程 | 取证结果 |
| --- | --- | --- |
| `plan-ready` | 对 r1 写入草稿，点击“编辑后接受…” | 对话框显示 r1、草稿和合成确认码，尚未确认 |
| `stale-dialog` | 确认返回 `revision_conflict` + `review.stale_plan`，保存候选在别处升到 r2 | 对话框说明需重新审阅；确认禁用，无重试按钮；恢复说明纳入可访问描述，没有自动重发或重新规划 |
| `cancelled-draft` | 取消旧计划并重新读取候选 | 丢弃 r1 计划；草稿原文保留，旁边显示已保存的 r2 提议，后者不带删除线 |
| `replanned` | 主动再次点击“编辑后接受…” | 新计划使用 r2 和保留的同一份草稿；没有第二次确认 |

mock 只允许状态/候选读取，以及绑定唯一虚构候选、修订、草稿的审阅计划；唯一一次确认绑定 r1 的 planId/hash 和非空 idempotency key。丢弃只能指向 r1 计划。其他 Memory 命令和所有原生宿主调用均拒绝并计数。计划的 `records` 为便于阅读的虚构 decision 记录，不据此声称真实 Core 的 diff 格式或写入结果。

## 验证与证据

- 独立无头 Edge `157.0.4341.42`，1100×700、DPR 1，三语 × 双主题 × 四态 **24 组首次全部通过**。沿用已有的 Vite 静态 fixture 构建与 preview 配方，没有改产品 Vite 配置或增加依赖。
- `inbox-review-diagnostics.mjs` 检查草稿、r2 原文和三语标签、计划/确认/丢弃的次数与目标、模态框可见范围、无横向溢出、水印、无页面错误及零宿主动作。已查看 24 组联系表，以及中文深色冲突、日文浅色取消后草稿、英文深色新计划的原尺寸截图。
- 原源码与新桩的 TypeScript 检查、取证脚本语法检查通过。`node scripts/check-memory-integration.mjs --self-test`（8 个反例）与 `check-activity-retirement.mjs` 通过；pin 仍为 `731edd56a276ffa752c736b7d2be667b9e12776c`。
- 完整 `npm test`：Node 151 项（148 通过、3 跳过、0 失败）；DOM 122 场景、2,527 项全部通过。该轮于 11 月 11 日结束，11 月 12 日收尾时核对保存日志，没有重复运行。

本地证据在忽略目录 `apps/desktop/target/inbox-review-evidence-20261111/`（`report.json`、24 张 PNG、`contact-sheet.png`、静态 fixture）；同名 `.log` 为浏览器取证日志，完整测试在 `target/inbox-review-tests-20261111.log`。

本片验证前端如何消费合成的冲突回执，不代表真实时钟到期、跨客户端并发、原生 WebView2 或 Morii 人工接受。现有 DOM 场景还覆盖同一页面切换语言不重发；本片截图矩阵每组独立加载，不把矩阵本身作为该行为的新证据。没有打产品候选包、运行 Rust 或原生冒烟；最新安装候选仍为 [5175284](UI-v2-candidate-5175284-2026-11-11.md)。没有访问个人 Vault、调用真实 Provider、安装、迁移、部署、系统热键或文件对话框；待决定事项不变。
