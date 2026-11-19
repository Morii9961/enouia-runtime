# R2 正式 Morii 首个入口与接入记录

2026-11-17，Morii 要求继续按开发路线推进，沿用下述最小只读范围。先在合成根接入已合并的原生接口，不据此读取个人库、创建读取授权、安装或部署。依据 [11月16日路线](RUNTIME_ROADMAP_2026-11-16.md) 的 R2，核对 Memory `a543c1eb81e5d7150ebe7820592eea35a9042697`；R1 的兼容采用不代表正式入口已经实现。

进一步追踪 catalog 的 process 子模块发现，当前 pin 已有 `memory_detail_native` 和 `memory_source_excerpt_native`。此前将详情/来源列为 Memory 缺失契约不准确，现纠正；不要求 Memory 重做这些能力。R2 首片将它们接到已有合成 read-2 页面，详情采用 process header v2，来源范围按 Unicode 标量计数，不是字节范围。

接续结果：PR181 已合并详情/来源合成接入。PR183 采用 [ADR-038](../adr/038-registered-morii-readonly-entry.md) 的显式受信任本机启动，不新增页面认证工具；同一原生登记库的真实 OS 账户合成演练通过，桌面跨进程读取/关闭重开为 14/14，见[报告](../validation/Registered-morii-readonly-2026-11-17.md)。随后统一独立只读入口的壳层、Home/Settings 状态，旧 Workspace 保持 none，见[验证](../validation/Registered-morii-shell-status-2026-11-17.md)。使用方式和限制见[本机只读入口](REGISTERED_MORII_READONLY.md)。下一步准备 R3 的只读验收分流；图形目录选择和个人库验收仍独立。

## 建议首片：同一 Morii 根的只读入口

建议先在现有 Memory Vault 表面提供“选择已初始化 Morii 库 → 有界列表与文字检索 → 单条详情 → 精确来源 → 锁定 → 重新认证并打开”的完整路径。沿用既有 Windows 壳和布局，浏览器仍标注虚构示例；不承诺同时接通六种领域视图、Context、Sessions、形成、纠正或删除。

| 用户操作 | 原生接入与可复用部分 | 必须先明确的边界 |
| --- | --- | --- |
| 选择库 | 复用原生目录选择、只给页面不透明 token、Runtime 根占用检查；只接受已初始化 `SegmentedOwnerV1` | 目录选择不能代替 Morii 身份认证；需 Memory 明确正式桌面怎样重新认证已登记 home/operation/root 和同一 Host |
| 打开与检索 | `SegmentedAutomationVault::open`；`SegmentedMemoryReader::from_authenticated_system`、`memory_page_native`、`memory_stats_native` 支持已有目录数据和有界查询 | 由已认证宿主固定 System、主体、敏感度与 attention profile，不从页面接收身份；Morii selection v4，旧游标作废 |
| 详情与精确来源 | `SegmentedMemoryReader::memory_detail_native` 与 `memory_source_excerpt_native` 返回当前授权记录、精确引文、来源修订及 Unicode 标量范围 | Runtime 只转发已有 read-2/process v2 输出，不能直接读磁盘 JSON、套用旧 read-1 或把摘录的 complete_in_scope 当作原始来源 Complete |
| 锁定与重开 | 复用 Runtime 撤回显示、禁用读取、清空 Quick Search 的生命周期模式；关闭后重新认证、重新取得读取句柄与 selection | reader 的 `lock` 只是宿主读取门，不能声称已释放 Vault；须关闭所有相关句柄。重开不沿用旧来源回复、游标或权限 |

第一片搜索建议沿用现有目录的文字匹配及分页，不加入模型、语义检索或新的索引实现。检索范围和统计只显示 Core 实际返回的授权范围；来源只按当前条目的实际证据请求，默认不展开完整 Raw 会话或附件。

现有合成目录在 R1 原生检查中曾因 `catalog_busy` 未完成下一页显示，另有一次调试归属拒绝；见 [R1 证据](../validation/Memory-pin-a543c1e-2026-11-16.md)。这些结果不支持把当前合成页面直接当作已验收的正式入口。R2 应验证实际忙碌反馈、刷新恢复和锁定期间的观察撤回。

## 已有能力与缺口

核对的 Memory 文件：[catalog.rs](https://github.com/Morii9961/enouia-memory/blob/a543c1eb81e5d7150ebe7820592eea35a9042697/crates/enouia-memory-host/src/automation/catalog.rs)、[qualified_agent.rs](https://github.com/Morii9961/enouia-memory/blob/a543c1eb81e5d7150ebe7820592eea35a9042697/crates/enouia-memory-host/src/automation/qualified_agent.rs)、[owner_bootstrap/mod.rs](https://github.com/Morii9961/enouia-memory/blob/a543c1eb81e5d7150ebe7820592eea35a9042697/crates/enouia-memory-host/src/owner_bootstrap/mod.rs)。Runtime 适配器在 `apps/desktop/src-tauri/src/memory_catalog.rs`；`fixture.rs` 仅供固定合成根及显式原生合成测试使用，登记库的生产打开路径不调用夹具写入。

Memory 的 `registered_owner_root` 可以在受信任原生 CLI 中重新认证已登记的 bootstrap 操作和根；R1 仅带入此助手，R2 的 ADR-038 才通过明确本机启动采用它。`SegmentedAutomationVault::open` 不自动执行恢复；恢复根仍须经过 Memory 的显式激活，RecoveryRequired 也不应由普通“打开”偷偷修复。

无需借用 `QualifiedAgentHost` 的 Agent 通道：System catalog 已有详情与来源接口。第一片不创建 Agent/OwnerReadGrant、不复制形成策略作为长期读取权限。原生 Host 的 System 身份必须来自已认证根；页面不能填写 ActorRef、敏感度上限、profile 或根路径。

正式打开继续遵守 ADR110/145：`registered_owner_root` 属于受信任原生 CLI/启动器，不能将不可信页面请求路由到 bootstrap CLI。本片选择原生显式启动；图形目录选择另核认证契约。不把文件选择、descriptor 或同账户进程事实单独当作人的授权。

## 实施与验收顺序

1. 最小只读范围按 Morii 的继续指令推进。已有详情/来源契约直接采用；正式打开需核实受信任原生启动与桌面选择的认证边界，不要求另一会话提前打开或交付私人原文。
2. 接口明确后，Runtime 先用独占构建目录和全新合成 Morii 根完成接入，验证错误根/旧布局拒绝、查询分页、精确 Unicode 来源、锁定撤回、重开换句柄、过期或删除后的读取拒绝。相关集成守卫必须通过；只运行与变化有关的原生场景。
3. Memory 完成真实形成、关闭重开、查询/来源及独立备份恢复证明后，另按 R3 生成含确切源码/pin 的新候选。个人库 GUI 验收由 Morii 在批准入口操作；旧候选 `5175284` 不用于新 Morii 根。

首片保持上述只读闭环；若扩至六种领域视图或 Context/Sessions，应另列功能及契约清单后排期。Windows 环境、个人库/Provider 权限、安装和部署继续分别决定。
