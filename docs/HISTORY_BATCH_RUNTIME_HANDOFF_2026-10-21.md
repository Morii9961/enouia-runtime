# Runtime 历史批次请求接续记录

2026-10-21（Asia/Shanghai）。本轮完成“已有批次 → 本地准备 → 精确请求检查 → 独立确认发送”的接入及合成验证。随后Morii明确授权任务完成后直接合并；Memory #39已合并，Runtime已采用实际合并pin，并在本片复核后合并#92。本文件是Runtime合并前的证据快照，实际合入SHA以PR页面及接手时查询为准。

## 当前基线

- Runtime：`codex/runtime-history-batch-prepare`；功能实现到 `5136af9dda7e48941c47c405ef4d61203a582318`，此前交接到 `9880541eddf74540f1bbdb1a06f6be5e340697da`。本片统一更新正式pin并验证后合并[PR #92](https://github.com/Morii9961/enouia-runtime/pull/92)，不预先记录尚未发生的Runtime合入SHA。
- Runtime PR基线：`5deb9546eead991b0ea7382aa7574a6b4e6cd712`。
- [Memory #39](https://github.com/Morii9961/enouia-memory/pull/39)：已于2026-10-21T04:36:36Z合并为 `18f4081d5fe8eef879d4383e306c24660f416c5e`。原head `d565181e0cb3bf14c938eb66a945269bba57ac8d`、base `a6e4da9958730ac8d7a151ce49c1108ff80f4228`；合并树与功能树相同。
- 当前Memory pin精确采用实际合并SHA `18f4081d5fe8eef879d4383e306c24660f416c5e`：Workspace IPC v1、53 commands，aggregate `9b25885480cf2e220b37f231fe9973afaecb3bd68b8939fdf1c918d42ac233b2`。pin记录为 `merged`，原开发验证仍保留历史未合并SHA。
- Memory工作树中两个集中交接Markdown仍是未跟踪文件，未改动、暂存或提交。其他工作树未动。接手时仍需重新检查各自状态。

## 行为和验证

| 约束 | 当前证据 |
| --- | --- |
| 使用原task/batch/child/run，准备时无凭据或transport | [固定Core消费者及初始UI](validation/History-batch-request-v1.md)：68项桌面Rust、8项消费者；fake ports准备为零、正确独立确认后一次fake exchange |
| head、页面重挂载、失效handle、错误身份、未知回执、已有invocation | 实际组件批次fixture31项；不得用extraction_prepare重建任务，不自动发送或重试另一call |
| 配置A→B→A及读取失败/恢复不复活旧请求 | [配置竞态](validation/History-batch-config-race-v1.md)：三个修正前失败、四项通过 |
| 正文焦点、尊重移走焦点、配置输出上限 | [焦点与上限](validation/History-batch-focus-v1.md)，后续扩展为10项，包含键派生期间取消 |
| 最小窗口内中央内容区不被导入表格撑宽 | [布局](validation/History-batch-layout-v1.md)：原生失败复现、独立有名称表格滚动、页面内方向键 |
| 完整进程重启可重建相同准备键，仍需新handle检查 | [最新恢复证据](validation/History-batch-restart-v1.md)：122项Node、71个DOM场景/953项断言、63/63真实WebView2合成检查 |
| Memory实际合并SHA上的Runtime完整复核 | [正式pin验证](validation/History-batch-merged-pin-v1.md)：原生68+8、前端122/953、WebView2 63/63、pin/domain与新工件 |

准备键是固定v1命名空间及精确Vault/任务/批次/policy/输出参数的UTF-8/SHA-256，不依赖head、不持久化正文或handle。异步派生结束后先重查当前归属，再提交IPC。完整重启不恢复选择、草稿、旧body或确认；主人需读任务并显式选择原参数。旧版随机准备键不可逆推；发送键仍属于原call，不是本次确定性键。

最终合并pin上的完整复核、普通Windows/NSIS构建、26项实际rendered installer检查和工件哈希见[正式pin验证](validation/History-batch-merged-pin-v1.md)及JSON；此前恢复JSON保留其原开发构建。隔离测试exe与普通NSIS payload哈希不同，不能混用。测试exe旁必须有同构建WebView2Loader.dll；原生harness要求hash绑定manifest、专用配置目录、空临时合成Vault。用过的fixture不得删除后伪装为首次空Vault。

Rust/Core、fmt/Clippy、domain boundary的初始证据在未受后续UI修改影响时复用；不宣称每一轮全部重跑。最终pin/surface与8个负例重新通过。正常包未安装；真实WebView2不等于物理键盘、Narrator、主人统一验收或真实模型质量。

## 后续边界

1. 接手先核对分支/HEAD/工作树/远端及两份PR的实际合入状态，保留并发修改。Morii已明确授权这两份当前历史批次PR在完成后合并；不要将本授权扩大到其他PR或旧Memory草稿#36。
2. Memory实际合并SHA已核实，Cargo.toml、Cargo.lock和memory-pin.json已统一更新。Runtime #92在正式pin检查通过后合并，并只读复核主线包含精确已测提交且合入树一致；本机工作树保留，不为同步状态重置或清理。
3. 候选结果预览/逐条入队/审核、语义分析、个人历史初始化、真实Provider、安装/部署、MV-8、MCP和云端仍不在本工作包。Activity保持独立。

本轮无真实Provider请求，也没有代点真实Send。原生模式有捕获阶段Send保护，完整报告无external_send operation；一次fake exchange只来自明确合成端口测试。权威接口见固定Memory源码的 [ADR-MEM-71](https://github.com/Morii9961/enouia-memory/blob/d565181e0cb3bf14c938eb66a945269bba57ac8d/docs/adr/071-history-batch-request-preparation.md) 和 [Runtime接入说明](https://github.com/Morii9961/enouia-memory/blob/d565181e0cb3bf14c938eb66a945269bba57ac8d/docs/integration/RUNTIME.md)。
