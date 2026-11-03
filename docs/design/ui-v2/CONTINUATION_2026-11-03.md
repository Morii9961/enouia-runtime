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
| `142e191` | [Settings 独立读取/重载错误跟随语言](../../validation/UI-v2-loaded-settings-errors-2026-11-03.md) |
| `1688c6a` | [星图光晕、混合与主题连线成本定位工具及八组结果](../../validation/UI-v2-starmap-cost-2026-11-03.md) |
| `3995c74` | [虚线/实线/手工虚线及同几何像素对照](../../validation/UI-v2-starmap-dashes-2026-11-03.md) |
| `25798d9` | [历史四面板独立保留错误跟随语言](../../validation/UI-v2-history-retained-errors-2026-11-03.md) |
| `b4ca035` | [首片合成 read-2 接线的公开源码与边界评审](../../integration/UI-v2-read2-synthetic-entry-review-2026-11-03.md) |
| `40948c2` | [记忆详情与本地任务回执保留当前语言](../../validation/UI-v2-detail-task-notices-2026-11-03.md) |

在 `4b16992` 上运行累计前端门禁：`npm test` 的 Node 部分 134 通过、3 跳过、0 失败；Happy DOM 86 场景、1,346 项断言通过。`npm run build`（含类型检查）通过，主 JS 452.19 kB；Memory pin 与 Activity 退役检查通过。此前各片按受影响范围运行定向检查，没有每片重复全套。保存日志位于忽略的 `apps/desktop/target/ui-v2-continuation/`。

后续 `142e191` 的 Settings 场景 24 项、类型检查、i18n 8 项、pin 检查通过；没有重复整套。两片星图诊断均只加工具与记录，完成独立无头 Edge 16 组测量、同几何像素对照、脚本语法与 diff 检查。主题线影响已复现，手工虚线未解决问题且存在少量像素差异，因此产品绘制不变，#24 未关闭。

`25798d9` 的四场景分别 24/19/44/44 项通过，Node 37 通过 / 3 跳过；`40948c2` 的四场景分别 20/7/16/16 项、Node 14 项通过；两片的类型、pin 与 diff 检查通过，均未重复全套。`b4ca035` 仅阅读公开源码并形成接线评审，未启动接线或运行测试/构建。

保存文本、JSON、哈希、确认码、状态值及原始 ID 保持原样。三处旧语言提示问题有修复前的失败复现，各片记录了范围。新增语言切换检查不自动发送、重读或写入，原有未知结果、锁定及迟到回执保护继续通过。

没有改 Rust、原生权限、安装包、正式状态快照或 Memory pin；pin 仍为 `bf6bfd1`，Workspace IPC v1 / schema 1 / 58 命令。既有合成自动记忆仍使用独立显式能力，没有采用 Owner 根。所有本批组件证据均为合成 DOM，不能替代 Windows、Provider 或 Morii 验收。

下一步继续检查当前前端的保存内容、等待/恢复分支。#24 不能靠删主题线或改实线宣称解决；后续需要新的完整绘制链路假设，视觉取舍仍另行确认。Memory session 已明确：新的合成接线应使用新建 segmented 根的 `SegmentedMemoryReader::from_authenticated_system`，首片仅 page + stats；不能复用旧 AutomationHost 根，也不能从 `active_vault` 推导身份或权限。该 API 就绪不代表 Runtime 已更新 pin、创建根或启用读取；Owner、原生与验收边界保留。

下一次接续从本分支最新提交继续，保持每项验证、提交与推送。仍可检查 Quick Search 的独立宿主错误提示；read-2 的具体范围见上表评审。主目录 `main@61715c1` 保留，工作成果位于 PR #115；没有把这些提交写成已合入或人工接受。
