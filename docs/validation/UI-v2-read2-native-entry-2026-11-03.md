# read-2 原生合成入口

基线：Runtime pin 兼容性提交 `bbdea44`；独立分支 `codex/read2-synthetic-native`。固定 Memory 为 `0d338f12f51a859363e0725071bcf43874b492c7`。本片实现[既有评审](../integration/UI-v2-read2-synthetic-entry-review-2026-11-03.md)的原生入口部分，界面消费者另片接线。

## 行为

显式 `--memory-catalog-synthetic` 在原生工作线程新建唯一临时 `SegmentedV1` 根，绑定新 System、原生 attention profile 和 Private 上限。三个中英合成样本具备真实 Core 接受的 record_fields、引用、System receipt 及机器采用语义。它们来自内置固定文本，不运行模型、分析器、capture 队列或维护工作器。公开 fixture 来源固定在上述 SHA；不依赖本地 Memory checkout 路径。

新 `memory_catalog` 命令只授予 main。请求为 schema 2 / `memory-native-read-2` / 闭合 query：`status`、`page`、`stats`、`lock`、`unlock`。页面和统计保留 Core DTO，统计必须给出页面原 selection；Core 校验游标、筛选和上限。页面不能传入根、身份、profile、敏感度上限或 Owner 动作。状态明确 `synthetic_segmented_only`；锁定/解锁是 `native_control`，读取是 `native_read`。不做自动重试。

初始化与读取均离开 UI 线程；全局锁和退出先撤下读取，再释放自有 reader/根租约；初始化完成但尚未发布的根在锁定/退出后丢弃。关闭失败保持该入口不可用。合成模式从启动前即拒绝 Provider 更新并跳过设置加载，autostart 不初始化合成根。两个合成 flag 同时出现时 read-2 优先；旧 `--memory-synthetic` 单独使用仍走原 read-1。Workspace v1 和旧根布局没有改变。

## 实际验证

- Rust 格式检查；完整 offline/locked native tests：50 单元/adapter 测试与 8 pinned-Core consumers 通过。新增四项覆盖边界拒绝、页/统计同 selection、三页无重复、中文筛选、CURRENT 不变、上限、锁定/解锁、两个不同根、初始化发布前锁定/退出、Provider 拒绝及关闭失败。
- 严格 `cargo clippy --locked --all-targets -- -D warnings` 通过；`cargo build --locked --features custom-protocol` 调试原生程序通过。使用 pin 切片已构建的相同前端资产；本片未改前端或重跑前端全套。
- 拥有进程、真实 Tauri IPC 的 `memory-smoke.mjs --catalog-only`：17/17 通过。新临时 fixture/独立 WebView 配置覆盖实际新命令权限、旧两通道未采用新根、System 记录、分页/统计、中文筛选、失配拒绝、overlay 拒绝、锁定/解锁、退出、新根重启和 autostart 跳过。
- 同一新原生程序的旧 `--automatic-only` 回归最终 18/18 通过。首次回归在第一个进程正常退出后，重启调试端口分到 1720，Node `fetch` 在连接前报 `bad port`；独立探针复现，符合 [Fetch 禁用端口表](https://fetch.spec.whatwg.org/#port-blocking)。脚本改在 49152–65535 范围检查空闲端口，仅对实际占用作有限重选；原有 PID 所有权核对保留。随后旧 18/18 和新 17/17 顺序重跑均通过，未改产品网络或重发 Memory 请求。
- pin 和 Activity 退役检查、smoke 脚本语法、diff 检查通过。依赖图没有进一步变化；pin 切片的精确 surface/metadata 结果仍对应本片同一 SHA。

调试中，首次来源将 occurred_at 清空但保留 minute 精度，Core 正确拒绝；现以 Unknown 表示未知事件日期。Episode 的 reported occurrence 与未知具体日期分别保留。分页测试从原首屏 cursor 前进，避免把重新发起首屏产生的新 evaluated_at 当成同一 selection。没有放宽 Core 校验。

日志和临时合成根保留用于诊断。此片不表示界面已显示 read-2，也不表示 facets/时间分桶/图、Owner 动作、Agent/Runtime capture、持续形成、个人 Vault、真实 Provider 或 Morii 人工验收完成。没有安装、迁移或部署。
