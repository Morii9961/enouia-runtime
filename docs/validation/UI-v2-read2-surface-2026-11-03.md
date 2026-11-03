# read-2 原生合成目录前端

基线：`73ca965b4ca9f88848b47524bb6e58e765d5bbd4`（[原生入口](UI-v2-read2-native-entry-2026-11-03.md)）；分支 `codex/read2-synthetic-surface`。Memory pin 仍为 `0d338f12f51a859363e0725071bcf43874b492c7`，没有新增依赖或更改 Core。

## 已实现

原生 Memory 侧栏增加明确标为隔离合成的 segmented catalog，使用独立 `memory_catalog` / schema 2 / `memory-native-read-2`。默认两条一页、游标翻页、显式字面搜索、刷新及锁定/解锁；页面和统计必须属于同一个原始 selection，二者都成功才显示记录与数量。失败撤下观察，不自动重发读取或控制，也不回退到 Workspace、read-1 或浏览器演示。

客户端在传输边界验证闭合能力、effect、DTO、selection 与游标绑定。语言切换保留原始记录、搜索草稿、输入焦点及当前页，不重新读取。锁定、退出、过期 selection、失配统计和迟到结果的 DOM 路径均有覆盖。短暂 busy 隐藏观察，保留输入和待恢复页面；恢复相同授权范围不会重读页面。

原生 open 状态现在向 Core 读取默认筛选的 selection，仅返回其授权标识。前端比较 snapshot、profile、withdrawal 及 scope，排除本次查询和观测时间；范围变化先撤下旧页再读取。原因是 fixture 的一小时授权到期时 CURRENT 可以不变，而 Core 的授权目标摘要会改变。新增可控时钟测试证明：到期前后 snapshot 相同、scope_hash 不同，新页为零，旧 selection 的统计被拒绝。生产 fixture 仍使用 SystemClock，未放宽策略。

## 本片实际运行

- 类型检查和生产前端构建通过；主 JS 460.45 kB / gzip 134.15 kB。
- Node 定向测试：新 catalog client 4、既有 automation client 5、i18n 8，共 17 通过。授权范围调整后重复受影响的 catalog + i18n 12 项通过。
- Happy DOM：新 catalog-memory 最终 23 项通过；既有 automatic-memory 19、memory-lifecycle-gate 24 项通过。DOM 使用受控合成传输，不等同真实 Core。
- Rust：`cargo test --locked memory_catalog` 最终 5 通过，46 个其他单元测试与 8 consumer 测试被过滤；fmt 与严格 all-target Clippy 通过。
- 调试原生构建（custom-protocol）通过。实际自有 Tauri 进程、独立临时根和 WebView 配置的 `memory-smoke.mjs --catalog-only` 最终 21/21 通过，含原入口 17 项与新增界面 4 项：两条/三条统计、下一页、真实中文筛选、原生锁定后撤行但保留草稿。未调用真实 Provider。
- pin、Activity 退役及 diff 检查通过。本片没有重跑完整 `npm test` 或完整 native suite。完整 pin 门禁见 [pin 报告](Memory-pin-0d338f1-2026-11-03.md)，原生入口完整 50+8 与旧 read-1 18/18 见原生入口报告；这些数字分别属于此前提交。

忽略日志：`apps/desktop/target/pin-verification/catalog-surface-{build,native-build,final}.log`；Rust 日志在 `apps/desktop/src-tauri/target/pin-verification/catalog-surface-{rust,clippy}.log`。最终 21/21 日志结尾已核对。最终合成根与两张截图位于本机 `C:\Users\Morii\AppData\Local\Temp\enouia-runtime-catalog-smoke-LSURKO\out\catalog-01-list.png`、`catalog-02-filter.png`，均已实际查看；日志和图片未提交 Git，清理临时目录后可能不再存在。

## 边界与后续

当前只是固定三条合成记录的 page + stats 消费者。未实现 facets、时间分桶、图投影、完整 UI v2 record 详情、形成工作器或真实数据接线。有限轮询会在下次状态观测时撤下失效范围，不能把本次快照写成持续实时授权证明。未进行全语言/尺寸/DPI 原生矩阵，未更新安装包；没有 Owner enrollment/adoption、个人 Vault、迁移、真实 Provider、生产部署或 Morii 人工接受。
