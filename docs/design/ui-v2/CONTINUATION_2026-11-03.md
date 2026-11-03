# Runtime UI v2 · 2026-11-03 接续

基线为干净的 `main@61715c1`。Morii 已授权按当前路线持续开发、逐项提交并直接联系其他 session 协同。本批在隔离工作树的 `codex/ui-v2-review-continuation` 分支完成并推送，见[草稿 PR #115](https://github.com/Morii9961/enouia-runtime/pull/115)；尚未合入主线。

| 提交 | 切片与证据 |
| --- | --- |
| `5f115d2` | [历史比较、筛选、来源覆盖及保存批次选择](../../validation/UI-v2-history-comparison-copy-2026-11-03.md) |
| `643b453` | [来源导航简报快照标识](../../validation/UI-v2-history-brief-copy-2026-11-03.md) |
| `4e11034` | [冲突记忆读取、恢复及修订警告](../../validation/UI-v2-conflict-recovery-copy-2026-11-03.md) |
| `68821e3` | [共用进度、停止、备份回执及确认等待](../../validation/UI-v2-shared-operation-copy-2026-11-03.md) |
| `587ab1a` | [保留回执跟随语言，不重做操作](../../validation/UI-v2-retained-notice-language-2026-11-03.md) |
| `31a0c95` | [设置草稿保存/复制回执及错误跟随语言](../../validation/UI-v2-provider-draft-notices-2026-11-03.md) |
| `835366e` | [共用读取/操作错误跟随语言，保留原重试闭包](../../validation/UI-v2-retained-error-language-2026-11-03.md) |
| `413d318` | [隔离合成自动记忆的范围、时间、来源与状态说明](../../validation/UI-v2-automatic-memory-copy-2026-11-03.md) |
| `4b16992` | [候选、设置、调用及退出的遗漏观察标签](../../validation/UI-v2-observation-labels-2026-11-03.md) |

在 `4b16992` 上运行累计前端门禁：`npm test` 的 Node 部分 134 通过、3 跳过、0 失败；Happy DOM 86 场景、1,346 项断言通过。`npm run build`（含类型检查）通过，主 JS 452.19 kB；Memory pin 与 Activity 退役检查通过。此前各片按受影响范围运行定向检查，没有每片重复全套。保存日志位于忽略的 `apps/desktop/target/ui-v2-continuation/`。

保存文本、JSON、哈希、确认码、状态值及原始 ID 保持原样。三处旧语言提示问题有修复前的失败复现，各片记录了范围。新增语言切换检查不自动发送、重读或写入，原有未知结果、锁定及迟到回执保护继续通过。

没有改 Rust、原生权限、安装包、正式状态快照或 Memory pin；pin 仍为 `bf6bfd1`，Workspace IPC v1 / schema 1 / 58 命令。既有合成自动记忆仍使用独立显式能力，没有采用 Owner 根。所有本批组件证据均为合成 DOM，不能替代 Windows、Provider 或 Morii 验收。

下一步继续检查当前前端的保存内容、等待/恢复分支，并单独定位 #24 大规模星图成本；视觉取舍、原生验收与新 Memory 接入仍按各自边界推进。Memory session 已报告新接口合入并提供兼容基线，Runtime 尚未采用；最小合成接线 API 正在跨 session 核对，不从 `active_vault` 推导任何读取权限。
