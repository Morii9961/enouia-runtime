# R2 已登记 Owner 只读启动验证（2026-11-17）

基线 Runtime `06fec094af5f9b62892099b0d62273e6dbfa3bce`，Memory 保持已合并 pin `a543c1e` / aggregate `723ec245…` / Workspace 61 命令。Morii 要求持续按路线推进，本片采用现有受信任原生启动契约，接入同一登记根的只读打开、来源读取与关闭重开，不操作个人资料。

## 采用与边界

Memory ADR110/145 及已合并 `owner_bootstrap::registered_owner_root` 明确允许受信任原生 CLI/启动器重新认证登记，禁止把页面包转发为 bootstrap 调用。Runtime 只接受完整、无冲突的显式启动参数，不提供页面开库/登记工具，不根据 descriptor、SID 或名字自行制造授权。错误参数/操作不回退到旧 Workspace 或固定合成根；自启动不尝试打开。

读取仍用现有 System catalog/process API，身份来自真实登记返回值。复用 Runtime 目录 identity lease 与 Core 的根锁，旧 Workspace 保持 none；写入、开旧库、picker 和 Provider 更新在改变生命周期前拒绝。锁定丢弃 Core 读取句柄及目录占用；页面 Unlock 拒绝，需新的显式本机启动。无恢复、策略续期、Agent、读取 grant 或形成 worker。

目录采用明确的 registered_owner_readonly 状态与只读文案，固定示例仍显示 synthetic_segmented_only。导航改为通用“原生记忆目录”并放入 Vault 组。数据与错误仍是普通文字；不显示 home、原操作或原生 ActorRef。

## 实际检查

- 桌面 release/offline/locked 测试：原生 **61 通过、1 忽略**；Core 消费者 **9 通过、1 忽略**。定向目录首轮为 8 通过、1 忽略；未把 ignored 原生登记演练当成已执行。
- 显式运行 ignored 的 `registered_native_owner_opens_same_root_reads_closes_and_reauthenticates`：**1 通过**，0.23s。使用指定的非 Git、非临时合成父目录，当前 Windows 账户走真实 prepare/commit 登记后，只在这个新假库写入三条固定夹具。两轮读取/关闭/重新认证仍为同一 Vault；占用中第二个 Runtime 拒绝，错误操作拒绝，来源引文精确，CURRENT 和登记元数据字节不变。没有私人输入，也不是用 synthetic 登记冒充真实认证。
- 最终补验“拒绝旧 Workspace 请求不触发原生关闭屏障”的定向测试 **1 通过**。
- `cargo clippy --release --offline --locked --all-targets -- -D warnings` 通过；Rust 格式化通过。最初 cargo check 缺 ActorRef 导入，已补齐，后续完整检查通过。
- TypeScript/Vite 构建通过，主入口约 489 kB；Node 客户端/翻译 **16/16**，目录 Happy DOM **42 项**、工作区 Happy DOM **33 项**断言通过。
- 内嵌资产 release 程序构建通过，1m47s。正式 `--owner-readonly-only` 桌面脚本 **14/14**：真实登记模式、旧 Workspace 不重解释、同根三条记录、只读界面与来源、写入拒绝、锁定撤回、页面不能重认证、退出、同一 Vault 跨进程重开且不增殖、CURRENT 不变、自启动忽略登记与退出。只读取上述新建合成 home；保存的 owner-01-readonly.png 已查看。
- Memory pin/surface 集成守卫、Activity 退役检查、脚本语法和差异检查通过。未运行无关工作区/前端全套、21 模式或安装包验收。

日志在忽略的 `apps/desktop/target/memory-pin-a543c1e-build/registered-owner-*` 与 `apps/desktop/target/registered-owner-*`。`registered-owner-fixture.json` 只指向该测试自己创建的登记；`registered-owner-native-location.txt` 指向这轮独立 WebView2 输出。专用 durable home 带有保留标识及 synthetic_validation_only；它不是编译缓存，不自动清理，也不上传。当前工作树独占 target，没有使用其他会话的 CLI。

## 未覆盖与下一步

未打开个人 Vault、原文、备份或初始化分析；无真实 OwnerReadGrant、Provider、安装/部署或手动状态快照更新。实际 OS 账户登记的是新建的合成数据 home，不等于私人库验收。此程序不是 R3 安装候选；旧 `5175284` 仍是旧 pin。

全局 Workspace 徽标仍忠实显示旧 Workspace none，不伪造新根为 v1 Vault。壳层的独立只读入口状态、Home/Settings 的一致提示及图形选择仍未完成；下一片继续统一这些表现层，不冒称整个正式 Owner GUI 或日用 v1 已交付。真实库与独立备份证明仍由 Memory 会话交付。
