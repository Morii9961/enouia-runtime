# 登记只读入口目录验证（2026-11-18）

以 Runtime `94b3b4129dbdc0ae87c2c086e8c65dcca8710ee1` 构建原生程序，嵌入 Memory
`506d23dc174a3e927d323f8f8d0b8ecfc9d1726d`。本片为 PR192、PR193、PR195 的目录搜索、
引文按钮名称及侧栏导航补充实际 WebView2 证据。测试使用专门生成、受保护的合成登记 home。

`--owner-readonly-only` **23/23** 通过。新增三项断言确认侧栏只提供原生目录、搜索蓝陶杯时
仍停在目录且只显示一条匹配、引文按钮的无障碍名称带编号。随后读取的来源与引文一致。
完整流程也验证登记、拒绝 Workspace 写入、锁定撤回结果、跨进程重开同一 Vault、`CURRENT`
字节保持原样及自启动不开库。两段相同引文分别读回不同原始来源的证据来自 PR193 的组件
夹具。这里检查 WebView2 DOM 中的按钮名称，讲述人仍留待人工验收。

TypeScript/Vite 构建、内嵌资产的 release/offline/locked 构建、冒烟脚本语法检查通过。
原生登记合成测试显式执行 **1/1** 通过。日志在忽略的
`apps/desktop/target/memory-pin-a543c1e-build/registered-nav-*`，其中
`registered-nav-native-location.txt` 指向报告；PR190 的旧验证程序另存于同工作树的
`apps/desktop/target/registered-owner-pin-506d23d-b930b4d/`。

公共源码 `afefa61` 的 Memory PR119 只修改独立 initializer 和配套文档、测试。已比对
`runtime-surface.json`，aggregate `df3248e7…` 与 61 个 Workspace 命令保持原值。集成说明
确认 ADR149 兼容 reader 可读取该 initializer 形成的库。R3 候选仍待 Memory 的真实形成、
重开和精确来源核验、独立恢复结果。此次构建为合成验证程序，安装与个人库验收未执行。
