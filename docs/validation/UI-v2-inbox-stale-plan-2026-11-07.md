# UI v2：收件箱审阅计划过期时保留草稿（2026-11-07）

接续草稿 #146，分支 `claude/ui-v2-review-conflict-fixture`。SCREENS §9 要求“plan 过期 / revision 冲突（保留草稿）”。收件箱的审阅确认在过期时原来没有任何 DOM 场景（只有历史批次测过 `revision_conflict`），本片补上。只取证，不改产品。

新增 `inbox-stale-plan` DOM 场景（原 `Inbox` 与 `PlanDialog`，全部 IPC mock）：在候选内容里写草稿 → “Accept with edits…” 生成计划 → 确认时 Core 返回 `revision_conflict` + `review.stale_plan`，同时候选在别处升到 r2。11 项全部通过：
- 计划带草稿和当时看到的 r1；
- 对话框内显示“你审阅之后内容变了。请重新审阅”，确认按钮禁用、没有“重试”，并显示“这次确认不能重试”的恢复说明；
- 确认只发一次，不自动重新规划；三语切换提示随语言变化，不重发；
- 取消后丢弃原计划（`review_discard` 带 r1 的 planId），列表重读显示 r2，未发送的草稿保留；
- 再次“Accept with edits…”用保留的草稿对 r2 生成新计划。

发现的缺口（下一片处理）：草稿保留后，文本框里只有旧草稿，r2 在别处改成的新内容在卡片上看不到，主人无法比较“别人改了什么”。

检查：新场景 11/11。没有字典、字体或产品代码变动。没有截图、完整 npm test、Rust、原生 smoke、个人 Vault、Owner、Provider、迁移或部署；Memory pin 不变。
