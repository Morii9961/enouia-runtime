# 历史批次响应：固定 Core 与恢复消费者验证

2026-10-23，Asia/Shanghai。范围为 Memory #40 的 Runtime 原生采用和独立恢复状态模型。**原生消费者完成，产品入口待 Claude 整合；未作全功能验收。**

## 基线、授权与固定版本

- 新工作区 E:/Workteree/history-results/Enouia Runtime，分支 codex/history-batch-results，从 main `e1e7e922b288c13dbc483c4089e7da146b7596b4` 创建。
- Morii 在 #93 合并后明确要求开始下一片历史结果功能。未触碰旧主目录的未提交交接、#93 工作区、Claude redesign 分支/worktree、手动项目状态快照或其他项目功能。
- 采用 Memory [PR #40](https://github.com/Morii9961/enouia-memory/pull/40) 实际合入 `9d68d3d8707749ad3b0e2a36cfc97d71a27e712f`，源 feature `fdd1d85ea1bfe117cc7b3007cab36a815581a4ef`；55 commands。
- surface aggregate：`c88a12cce61b9601dffea3795a72decfe7de53082c0b4a10548947c993bd31e8`。
- Cargo.toml 三个声明、desktop Cargo.lock 八个 Memory Git source 和 memory-pin 同步；锁文件仅替换旧 `18f4081d` 来源，未更新 registry 版本或无关依赖。根领域 workspace 不引入 Memory。
- 固定源码依据：[ADR-MEM-72](https://github.com/Morii9961/enouia-memory/blob/9d68d3d8707749ad3b0e2a36cfc97d71a27e712f/docs/adr/072-history-batch-response-application.md)、[command catalog/arguments](https://github.com/Morii9961/enouia-memory/blob/9d68d3d8707749ad3b0e2a36cfc97d71a27e712f/crates/enouia-memory-contract/src/workspace.rs)、[native implementation](https://github.com/Morii9961/enouia-memory/blob/9d68d3d8707749ad3b0e2a36cfc97d71a27e712f/crates/enouia-memory-workspace/src/native.rs)。本机 Memory checkout HEAD 后来已前进；核对和采用均读固定 Git 对象，不依赖它的当前工作文件。

## 实际实现

`historyResults.ts` 通过既有 memory_call 访问 history_batch_preview / history_batch_apply，校验原 task/batch/child/run/input、模型与额度、来源版本、响应 hash、cursor/candidate 前缀以及原提议/引文/完整上下文和有限审核状态。观察在复制后深度冻结，外部修改不会改变已检查的写参数。没有添加 Tauri 命令或窗口权限。

应用键为 `ui-history-apply-v1-` 加上版本化有序 JSON 的 SHA-256，输入是 Vault ID、原 task ID、原 batch index、responseHash、cursor。只有显式确认的一步会写；同一元数据在进程重启后可恢复同一键，不存正文或确认到 WebView storage。

HistoryResultOwner 保留未知写的精确 args/key；同步写成功或未知后均撤回预览，需明确重新读取。新鲜读取若观察到同响应 cursor 已前进，只建立当前进度，不归因哪次写或候选发布。未前进则只允许明确 recover 原请求；没有自动重试、自动选下一 cursor 或遍历所有结果。Web Crypto 等待后的身份复查、A→B→A、锁定/卸载与晚回执均由 generation 和选择 owner 约束。

client.ts 写集合加入 history_batch_apply，preview 保持无 key；新 Core 的 is_write 自动使原生共享写 gate 覆盖 apply。窗口仍 main-only，overlay 继续只允许 memory_search。Core 负责源访问、删除、暂停、幂等、pending 限制和候选治理；Runtime 不读取 Vault 文件或增加 Memory 私有 helper。

## 本次实际运行

全部运行针对本片及其新 pin，没有把旧报告或未运行检查计为本次成功。

| 检查 | 结果 / 保存输出 |
| --- | --- |
| cargo fetch --locked --manifest-path apps/desktop/src-tauri/Cargo.toml | 获取精确 Git revision，锁文件无重解析变动。 |
| cargo test --offline --locked --test memory_core history_tasks_prepare_saved_batches_and_send_only_after_exact_confirmation -- --exact --nocapture | 1 个扩展后的固定 Core 消费者场景通过，7 filtered。target/history-results/native-core.txt。 |
| cargo test --offline --locked --bin enouia-desktop memory::tests:: -- --nocapture | 16 pass、56 filtered。覆盖新 catalog 的 gate、页面写集合、overlay 及生命周期。target/history-results/adapter-tests.txt。 |
| node --test --test-isolation=none tests/history-results.test.mjs tests/history-batch.test.mjs tests/history-tasks.test.mjs tests/memory-client.test.mjs（设置明确的合成 Core fixture 路径） | 最终 31 pass、0 skipped。包含 10 个新结果场景，以及原 preparation/task/client 回归。target/history-results/node-tests.txt。 |
| 实际 Core 响应交给生产 TypeScript 消费者 | 3 个预览和 2 个应用回执通过；已纳入上行的显式 fixture 用例。没有再次调用 Core/Provider。原独立输出 target/history-results/core-consumer-fields.txt。 |
| npm run check | 最终 TypeScript 通过。target/history-results/typescript.txt。 |
| cargo clippy --offline --locked --bin enouia-desktop --test memory_core -- -D warnings | 通过。target/history-results/clippy.txt。 |
| resolved desktop metadata + check-domain-boundaries.mjs --self-test | 8 Memory packages 固定同一 revision，桌面不依赖 Runtime 领域 crate，7 个负例通过。target/history-results/domain-guard.txt。 |
| check-memory-integration.mjs --memory-checkout E:/Enouia Memory --self-test | 三声明/八锁定包一致，55 commands/surface 与固定 Git 对象匹配，8 个负例通过。target/history-results/pin-check.txt。 |
| 受影响 Rust 文件 rustfmt；最终差异空白/文档本地链接检查 | 通过。 |

上述 target 原始输出被 Git 忽略，保存在本机该独立工作区；本文件是可提交的结果记录，不把 ignored 日志冒充公开 PR 附件。

## 合成证据与恢复含义

扩展既有 native consumer 的 fake ports 保存两条虚构提议，然后设置端口不许调用并从 Workspace 移除 Provider。随后真实固定 Core 的 preview 不改变 head；错误 hash、未来 cursor 拒绝；第一步只使 cursor 0→1；相同 key 重放及重开返回同一步；另一旧 cursor 不消费第二项；同 key 改 cursor 冲突；明确第二步才到 cursor 2/completed。两候选仍 pending，Memory 列表为空。端口计数始终为此前的 1 次 fake secret read / 1 次 fake exchange，预览/应用不增加调用；没有真实凭据或 HTTP。

Node 场景覆盖跨 Vault/task/batch/hash/cursor 键隔离、原提议与当前候选分离、quote/上下文/来源/有限状态验证、不可变观察、真客户端 envelope 的读/写 key、单步确认、空响应、丢失/不匹配回执、原键恢复、完整重启后的显式旧步骤恢复、A→B→A 与 Web Crypto 竞态、晚读/写回执、暂停/源读取拒绝和变更 hash。默认前端测试不读取任何 Core fixture；只有显式设置 RUNTIME_HISTORY_RESULT_FIXTURE 才读取这份自有合成输出。

复现受影响消费者检查：先在此工作区创建 target/history-results，并将 RUNTIME_HISTORY_RESULT_FIXTURE 设为其中 core-fields.json；从 apps/desktop/src-tauri 运行表内单个 memory_core 场景生成 fixture，再从 apps/desktop 运行表内 Node 命令。清除该环境变量后，普通 Node 测试仅跳过这一显式 actual-Core fixture 场景。

## 界限与交接

App.tsx/main.tsx、HistoryTaskPanel 和样式均未修改；[Claude 最小页面契约及可复制启动文字](../integration/HISTORY_RESULTS_CLAUDE_HANDOFF.md) 明确绑定/失效/恢复 API。未完成产品入口、实际浏览器/物理交互或个人历史质量验收。没有新 GUI 构建、安装包、smoke、性能或全量 workspace/前端测试；未改范围复用原 main 的已有证据。

这片保持 embedded、无 Host/MCP/云端迁移、无个人日志/Vault/凭据读取、无真实 Provider/网络发送、无安装部署、无自动入队或 Canonical 批准。Activity/Usage 和 Dashboard 协议未改。提交与推送按仓库本次开发授权执行，新 PR 供评审；#93 的合并授权不延伸为本片自动合并权。

## 确认与所展示预览的绑定补修

继续评审发现具体缺口：原 apply(true) 取调用时的最新 owner.preview。用户在 cursor 0 核对后，页面刷新观察到其他客户端推进的 cursor 1，旧确认回调仍可能写入 cursor 1；即使同 cursor，刷新后的候选内容也可能已经变化。恢复动作同样需要绑定这次实际核对的观察。

先在未修改的生产模型上复现：定向用例 1 fail（Missing expected rejection），保存 target/history-results/inspection-binding-before.txt。修复只给 apply / recover 增加 inspected 参数，必须与当前深度冻结的预览为同一引用；刷新、重绑、导航或失效后旧引用不能发写。Claude 接口示例同步要求保留所展示的 shown，不能从旧回调临时换取最新 snapshot。

本补修实际运行：含两个新增回归的相邻 Node 消费者检查 **33 pass、0 skipped**（复用本片已保存的合成 Core fixture），TypeScript 通过，check-memory-integration.mjs 通过。输出分别为 target/history-results/inspection-binding-after.txt、inspection-typescript.txt；未改 Rust/pin/协议，未重跑原生、Clippy、打包或全量检查。上面的 31 个用例和原生结果仍属于初始工作片，不改写为补修重跑。

## 独立结果面板

补齐 apps/desktop/src/memory/HistoryResultPanel.tsx，供 Claude 在原 task/batch 详情直接挂载。没有修改 HistoryTaskPanel、App.tsx、main.tsx、路由、壳或 CSS。挂载不读取，明确按钮预览后才允许勾选单步；成功/未知均撤销观察，恢复同一 args/key。全部正文为普通 React 文本节点。完整上下文、来源/角色/证据、未知时间、原提议与当前候选分开展示；完成只表示本地处理进度。

单个 DOM 旅程通过 24 项断言：未挂载调用、初始未确认、同内容 task 副本不重置核对、刷新撤销确认、双击一步、精确 IPC 参数/键、候选内容分离、未知原键恢复、已写丢回执后只读恢复、暂停/来源拒绝、外部焦点、批次往返、锁定、Vault 切换、空响应、晚写回执及重开后不消费下一项。运行 `node tests/dom-fixtures.mjs --worker history-results`，输出 target/history-results/result-panel-dom.txt。这是 Happy DOM 模型与假 IPC，不是浏览器、原生窗口或人类验收。TypeScript 及 Memory 集成检查通过；沿用固定 Core 的原生证据，不再调用它或 Provider。

Claude 的交接增加可复制组件挂载示例与 enabled/lifecycle 要求。产品页面入口仍待整合，不把独立 fixture 当作已上线功能。

## 已保存结果的本地暂停 / 恢复

固定 55 命令已有 `extraction_pause({sessionId, runId, paused})`，返回 `{job}`。本片在独立结果 owner / 面板接入该正式本地控制；身份由已观察的原 task/batch 派生，不添加 Memory 私有逻辑或更新 pin。操作绑定展示的不可变预览和明确确认；成功或未知后都撤回预览。只保留控制参数/键，先明确重读，再作新的状态决定，不自动重发旧控制；不将其冒充候选应用的持久同键回执恢复。未知候选应用的原 hash/cursor/key 始终保留，可在本地恢复并重读后继续 recover 原步骤。

实际验证：扩展既有单个 fixed-Core 场景通过（1 pass、7 filtered），暂停后 history_batch_apply 返回 history.batch_paused，preview 保持原 items/hash，恢复后仍 cursor 0；此前的两步候选流程与 ports 1 次 fake secret read / 1 次 fake exchange 断言继续通过。新 Core 输出保存为 target/history-results/paused-core-fields.json，不覆盖初始 fixture。

相邻 Node 检查 37 pass、0 skipped，含实际 Core 的暂停/恢复回执与观察。单个 Happy DOM 面板旅程 31 项断言通过，增加明确状态控制、未知回执重读、新决定新键、暂停/恢复后仍保留原应用身份。TypeScript、受影响 memory_core 测试的严格 Clippy、Memory pin 检查和差异空白检查通过。保存输出为 pause-native-core.txt、pause-node-tests.txt、pause-panel-dom.txt、pause-typescript.txt、pause-clippy.txt（均在 target/history-results/）。旧 31/33 用例和 24 项面板记录保留为各次实现时的证据，不改写成新检查次数。

没有新 Tauri 命令、协议采用、Usage 导出、壳、样式、安装或真实数据操作；未重跑全量前端、workspace、构建、打包、smoke、性能或 publisher conformance。新 UI 入口仍由 Claude 整合。

## 可手动评审的合成浏览器预览

新增开发专用 e2e/history-results-preview.html / .tsx。它直接把内存假 request 传给生产 HistoryResultPanel，不调用 native IPC；所有任务、来源、引文和候选均为虚构数据。预览提供本地丢回执、来源拒绝、当前候选已修订、长行上下文和详情卸载场景。它不是正式产品路由，不修改壳或 CSS。

本机已用浏览器实际操作：明确暂停/恢复均保持 cursor 0；单步写入后模拟丢回执，旧预览/确认撤回；只读重读观察 cursor 1，并分开展示原提议和当前候选。下一步确认保持未勾选、按钮禁用。浏览器预览与固定 Core 证据分开；没有原生窗口或人类验收结论。

长行场景在原组件上复现横向溢出：视口 1270px、页面 17399px、面板 880px、内容 17204px。最小修复只复用现有 mem-history-request / mem-content 类；同一场景修复后页面 1270px、面板与内容均 880px。来源限定语换行和缩进保留，实际 computed white-space 为 pre-wrap。没有新增样式、截断文本或替换 Claude 壳。观察摘要在 target/history-results/browser-layout-observations.json；截图在本次本机交付附件，不入库。

运行方式：apps/desktop 下用已有依赖执行 `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 1437 --strictPort`，打开 http://127.0.0.1:1437/e2e/history-results-preview.html 。只监听本机回环；无安装、发布或采集。页面显著标明合成环境；刷新或重置只丢弃该夹具内存状态。此片另做定向预览源码类型检查、生产 TypeScript 与 pin/空白检查；复用未受影响的原生和消费者证据，不再跑全量套件。
