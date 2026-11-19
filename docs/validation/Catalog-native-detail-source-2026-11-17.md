# R2 合成目录：原生详情与精确来源（2026-11-17）

基线 Runtime `47f1a93e748e1de0c820c7a398545f11cab85c01`，Memory pin 保持 `a543c1eb81e5d7150ebe7820592eea35a9042697` / aggregate `723ec245…` / Workspace 61 命令。Morii 要求继续按开发路线推进，本片完成最小只读入口的详情/来源合成接入，不打开正式 Morii 根。

## 变化及契约核对

进一步核对发现 Memory 当前 pin 的 `automation/catalog/process.rs` 已有 `memory_detail_native`，其 `process/conversations.rs` 已有 `memory_source_excerpt_native`。前一提议将这两项误列为 Memory 契约缺口，现已纠正；没有修改 Memory 或请求重复实现，也没有机械采用新主线。Memory 新合并 ADR147/148 分别涉及恢复接续和纯文本附件保留，当前只读 slice 不需要其新增助手。

- `memory_catalog` 增加闭合的 `detail`、`source` 只读操作，调用上述 Core 接口。根、System、Private 上限及 attention profile 仍由原生宿主固定。详情保留 process header v2 / selection v4，来源指定精确 SourceId+revision、Unicode 标量起点和有界长度；不存在/不可读的修订不退回其他版本。
- 目录行可选中并在现有侧栏读取详情。引文先展示 Core 已保存的证据，只有点击“读取引文来源”才读取原文。原文范围、字面内容、anchor hash 和当前授权 scope 必须匹配；按普通文字节点显示，不解析 HTML 或附件。
- 列表刷新/换页、选择变更、锁定和授权范围变更撤回详情与来源；迟到的旧回复不能覆盖新选择。读取失败显示错误，可显式重新读取。界面文案有中/英/日三种语言，不翻译源内容。
- 原生 `catalog_busy` 可由并发观察争用同一绑定触发；沿用既有 read-1 的两秒/20ms 有界等待，仅重试 status/page/stats/detail/source，逐次重新检查生命周期和 Core 授权。锁定/解锁控制不重放；关闭屏障可以中止等待。这处理具体读竞争，不宣称修复 R1 中原因未明的调试端口归属拒绝。
- 新侧栏令最初构建的主包达到约 504 kB、触发 500 kB 警告；按已有 React lazy/Suspense 模式仅在选择目录时加载该组件，最终主入口约 489 kB，未增加依赖。

## 实际验证

- Memory 集成守卫（对固定 checkout 的已提交 manifest）及 Activity 退役检查通过；`git diff --check`、原生脚本语法检查通过。
- 定向 `cargo test --release --offline --locked --bin enouia-desktop memory_catalog::tests`：**6 通过**、53 filtered，2.24s。覆盖真实 Core 详情、中文来源三标量分页重建、精确引文、旧修订/范围拒绝、CURRENT 不变、overlay 拒绝、锁定拒绝、关闭时撤回及两秒等待边界。测试输入和根均为合成。
- `cargo clippy --release --offline --locked --bin enouia-desktop -- -D warnings` 通过；执行了 Rust 格式化。
- Node 客户端与翻译定向测试 **15/15**；目录 Happy DOM **40 项断言通过**，工作区 Happy DOM **33 项断言通过**。受控延迟覆盖旧详情/来源晚到、锁定后晚到、失败撤回与明确读取；不是浏览器或真实存储故障验收。
- TypeScript/Vite 最终构建通过；内嵌资产 release 程序构建通过，最后一次按最终前端资产重建为 1m45s。
- 未改归属保护和时限的正式 `--catalog-only` 原生场景 **42/42** 通过，包括新增 Core 详情、精确 revision/引文/anchor、真实侧栏来源正文及原有三语言/明暗最小布局、分页、锁定和重启。人工查看保存的 `catalog-01-list.png`，确认侧栏文字与来源归属显示，没有可见横向裁切；这只是合成截图检查，不是 Morii 验收。本片该轮无原生脚本失败；R1 的失败仍保留在其原报告。

日志在忽略的 `apps/desktop/target/memory-pin-a543c1e-build/catalog-detail-*` 和 `apps/desktop/target/catalog-detail-*`，其中 `catalog-detail-native-location.txt` 指向这轮独立临时合成目录的 report.json 与截图。复用本工作树独占 target，不与 Memory 会话共享。未重跑无关前端全套、所有桌面测试、21 模式矩阵或安装包检查。检查中有一次从仓库根误启动 npm（该目录无 package.json），随后在正确桌面目录执行并取得上述有效结果；不将该错误计作前端通过。

## 剩余边界

仍是固定虚构 read-2 根，不会选中个人目录或正式 Morii 库；没有 Agent/OwnerReadGrant、Provider、安装/部署、真实恢复或手动状态快照变更。来源摘录的 complete_in_scope 仅描述该来源摘录范围，不提升原始 Partial，也不证明附件内容。

正式 Morii 打开须继续核实受信任原生启动与桌面选择的认证契约。Memory ADR110 明确 bootstrap 不是可被页面调用的工具，同账户 OS 进程事实本身不证明人的授权；本片不借用 Agent 读接口或直接读取磁盘 JSON 来绕过该边界。同一根关闭重开与 R3 新候选/人工验收继续沿 [R2 接入记录](../integration/RUNTIME_MORII_ENTRY_PROPOSAL_2026-11-16.md) 推进。
