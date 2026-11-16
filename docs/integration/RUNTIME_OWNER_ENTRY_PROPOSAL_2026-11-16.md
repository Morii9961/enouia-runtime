# R2 正式 Owner 首个入口建议（待 Morii 决定）

本文件只提出接入范围，不批准正式 GUI、个人库读取、读取授权、安装或部署。依据 [11月16日路线](RUNTIME_ROADMAP_2026-11-16.md) 的 R2，核对 Memory 已合并 `a543c1eb81e5d7150ebe7820592eea35a9042697` 源码；不读取私人根或初始化材料。R1 的兼容采用不代表下述入口已经实现。

## 建议首片：同一 Owner 根的只读入口

建议先在现有 Memory Vault 表面提供“选择已初始化 Owner 库 → 有界列表与文字检索 → 单条详情 → 精确来源 → 锁定 → 重新认证并打开”的完整路径。沿用既有 Windows 壳和布局，浏览器仍标注虚构示例；不承诺同时接通六种领域视图、Context、Sessions、形成、纠正或删除。

| 用户操作 | 原生接入与可复用部分 | 必须先明确的边界 |
| --- | --- | --- |
| 选择库 | 复用原生目录选择、只给页面不透明 token、Runtime 根占用检查；只接受已初始化 `SegmentedOwnerV1` | 目录选择不能代替 Owner 身份认证；需 Memory 明确正式桌面怎样重新认证已登记 home/operation/root 和同一 Host |
| 打开与检索 | `SegmentedAutomationVault::open`；`SegmentedMemoryReader::from_authenticated_system`、`memory_page_native`、`memory_stats_native` 支持已有目录数据和有界查询 | 由已认证宿主固定 System、主体、敏感度与 attention profile，不从页面接收身份；Owner selection v4，旧游标作废 |
| 详情与精确来源 | 原生返回记录、证据、来源修订和有界原文；保留 Partial、附件状态、字节范围与当前快照 | 现有 `memory_catalog` 没有 detail/source 操作；需 Memory 确认正式 Owner 原生读取契约，不能直接读磁盘 JSON 或套用旧 read-1 |
| 锁定与重开 | 复用 Runtime 撤回显示、禁用读取、清空 Quick Search 的生命周期模式；关闭后重新认证、重新取得读取句柄与 selection | reader 的 `lock` 只是宿主读取门，不能声称已释放 Vault；须关闭所有相关句柄。重开不沿用旧来源回复、游标或权限 |

第一片搜索建议沿用现有目录的文字匹配及分页，不加入模型、语义检索或新的索引实现。检索范围和统计只显示 Core 实际返回的授权范围；来源只按当前条目的实际证据请求，默认不展开完整 Raw 会话或附件。

现有合成目录在 R1 原生检查中曾因 `catalog_busy` 未完成下一页显示，另有一次调试归属拒绝；见 [R1 证据](../validation/Memory-pin-a543c1e-2026-11-16.md)。这些结果不支持把当前合成页面直接当作已验收的正式入口。R2 应验证实际忙碌反馈、刷新恢复和锁定期间的观察撤回。

## 已有能力与缺口

核对的 Memory 文件：[catalog.rs](https://github.com/Morii9961/enouia-memory/blob/a543c1eb81e5d7150ebe7820592eea35a9042697/crates/enouia-memory-host/src/automation/catalog.rs)、[qualified_agent.rs](https://github.com/Morii9961/enouia-memory/blob/a543c1eb81e5d7150ebe7820592eea35a9042697/crates/enouia-memory-host/src/automation/qualified_agent.rs)、[owner_bootstrap/mod.rs](https://github.com/Morii9961/enouia-memory/blob/a543c1eb81e5d7150ebe7820592eea35a9042697/crates/enouia-memory-host/src/owner_bootstrap/mod.rs)。Runtime 当前实现在 `apps/desktop/src-tauri/src/memory_catalog.rs` 与其 `fixture.rs`，仍是新建固定合成根，不会打开 Owner 根。

Memory 的 `registered_owner_root` 可以在受信任原生 CLI 中重新认证已登记的 bootstrap 操作和根；R1 仅带入此助手，没有把它接入桌面。`SegmentedAutomationVault::open` 不自动执行恢复；恢复根仍须经过 Memory 的显式激活，RecoveryRequired 也不应由普通“打开”偷偷修复。

`QualifiedAgentHost::from_authenticated_initialized_owner` 及其 reader 已有详情、来源分页和 SourceRead 检查，但这是独立的 Agent 读取通道，不是可自动视为已批准的桌面 Owner 接口。第一片不创建 Agent/OwnerReadGrant、不复制形成策略作为长期读取权限。若 Memory 选择复用该通道，须先明确主体、来源范围、敏感度、有效期和授权意义；若它提供 Owner 原生详情/来源接口，领域改动由 Memory 仓库负责，Runtime 再采用精确已合并 pin。

## 实施与验收顺序

1. Morii 确定是否采用上述最小只读范围。Memory 确认原生 Owner 认证、读取/来源契约和工程交付版本；本提议不要求另一会话提前打开或交付私人原文。
2. 接口明确后，Runtime 先用独占构建目录和全新合成 Owner 根完成接入，验证错误根/旧布局拒绝、查询分页、精确 Unicode 来源、锁定撤回、重开换句柄、过期或删除后的读取拒绝。相关集成守卫必须通过；只运行与变化有关的原生场景。
3. Memory 完成真实形成、关闭重开、查询/来源及独立备份恢复证明后，另按 R3 生成含确切源码/pin 的新候选。个人库 GUI 验收由 Morii 在批准入口操作；旧候选 `5175284` 不用于新 Owner 根。

待 Morii 决定的产品项只有入口首片范围：建议采用上述只读闭环；若要求首片覆盖六种领域视图或 Context/Sessions，应另列功能及契约清单后排期。Windows 环境、个人库/Provider 权限、安装和部署继续分别决定。
