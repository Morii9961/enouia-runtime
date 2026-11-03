# UI v2 read-2 首片合成接线评审

评审基线：Runtime `25798d9`，现有 pin `bf6bfd10bf3c870ae2ce7ceb5c6bd635b08bf327`；Memory 主线已只读核对为 `0d338f12f51a859363e0725071bcf43874b492c7`，surface aggregate 为 `61e8712d37e456de326725caf589a74950a10992437632b59bbaaa2b3635b4ef`。本文只形成具体接线边界，没有更新 pin、启动原生进程或创建/打开 Vault。

## 已确认的最小路径

Memory 持续开发 session 已确认，并以公开源码复核：

1. `enouia_memory_host::automation::catalog::SegmentedMemoryReader::from_authenticated_system(Arc<SegmentedAutomationVault>, ActorRef)` 仍可用于独立新建的合成 segmented 根。构造器核对 actor 与根的 `descriptor.system_actor` 一致且类型为 System，再检查快照。身份、profile、敏感度上限和根绑定由原生合成宿主持有，页面不能指定。
2. 首片仅消费 `memory_page_native(&CatalogReadRequest, Option<&CatalogCursor>) -> CatalogMemoryPage` 和 `memory_stats_native(&CatalogReadRequest, Option<&CatalogSelection>) -> CatalogMemoryStats`。筛选使用既有 `CatalogFilter`；选项上限仍由 Core 校验：limit 1–100，字节预算 1KiB–`MAX_DOCUMENT_BYTES`。
3. DTO 是 schema 2 / `memory-native-read-2` / `native_read`。当前 selection 为 `owner-qualified-catalog-4` / version 4，旧游标不能改标签复用。统计应绑定页面的同一 selection；快照、策略或删除变更要求显式重新读取。
4. 新合成样本必须具备已冻结 UI-v2 `record_fields`，可复用 Memory 的 `host/tests/catalog.rs` 与 `vault/tests/support/segmented_fixture.rs` 的构造语义。不能把 Runtime 当前 `AutomationHost` 的 `automation-host-v2` 根直接交给 segmented reader。

System 合成构造器并不要求产品 Owner 原生登记，也不建立 Owner 身份。Owner 根、Owner 动作、Agent 委托、Runtime capture 和 worker 都不是首片依赖。

## Runtime 现有边界与实现范围

当前 `memory_automation.rs` 的请求封装、闭合 query、状态及 `automation.ts` 客户端均明确只接受 read-1；旧 fixture 持有 `AutomationHost`、生成/维护工作器和独立临时根。首片保留整条旧路由，新增明确独立的合成 read-2 入口及新根生命周期，不静默将旧请求解释成 read-2，也不改 Workspace v1 的 58 条命令。

建议实现顺序：

1. 在独立 Runtime 集成分支按 [Memory integration v1](../MEMORY_INTEGRATION_v1.md) 评审兼容日志，统一更新五个依赖 rev、Cargo.lock 和 pin record；实际锁文件调整以 `cargo fetch --locked` / metadata 为准，不能预先宣称只需替换 SHA。Memory 的 manifest 差异包含 Host 新依赖/feature，需按实际解析结果复核。
2. 原生宿主只在新的显式合成入口中创建新 segmented fixture，持有其 System/profile/ceiling、reader 和租约；读请求在 worker 上执行，锁定/退出撤下观察并释放自有资源。没有目录选择、自动记忆上次根或个人资料恢复。
3. 前端单独标记“隔离合成 read-2”，只显示实际页及同 selection 的授权范围计数。不能冒充全人生、Owner 接受、真实形成或已有 Context/Sessions；旧读-1、本地 Workspace 及浏览器设计示例各保留自己的模式说明。

针对性出口：翻页不重不漏、页/统计同选择、版本/能力/布局/原生窗口拒绝、锁定/退出的迟到结果撤下、原 v1 与 read-1 消费不退化。按集成协议运行相应 Rust/前端/边界检查和拥有进程的合成原生检查。时间分桶、facets、图、Owner 动作与持续形成分别后续交付，不在首片顺带加入。

## 来源与限制

只读依据是上述 Memory revision 的 `docs/integration/RUNTIME.md`、`docs/integration/runtime-surface.json`、`docs/contracts/UI_V2_CATALOG.md`（含后续版本说明）、`UI_V2_OWNER_ACTIONS.md`、`crates/enouia-memory-host/src/automation/catalog.rs`、`crates/enouia-memory-contract/src/next/catalog_read.rs`，以及本仓库 `memory_automation.rs`、其 `fixture.rs` 和 `automation.ts`。

本文不改现有路线或开启新阶段。Memory API 就绪和此评审不等于 Runtime 接入完成、pin 已采用、正式 Owner 根可读或模型/Provider 已启用。没有检查个人根、创建合成根、运行测试/构建或修改 Memory 仓库；只检查文档引用和 diff。
