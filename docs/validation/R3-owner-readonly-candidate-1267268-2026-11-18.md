# R3 登记只读 Windows 候选（2026-11-18）

候选从 Runtime main `12672683d661ee47ee7b0937f989a0bb351385d5` 构建。内嵌 Memory pin 为
`506d23dc174a3e927d323f8f8d0b8ecfc9d1726d`，surface aggregate 为
`df3248e725f92952d0be265092babd5dbdbe6fec642720a0c400c71cbd9e7e53`，Workspace 61 命令。
沿用现有 x64、当前用户 NSIS 安装方式，产品版本为 0.1.0。安装包和程序均为 `NotSigned`。
候选产物在本机忽略目录 `apps/desktop/target/candidate-1267268/`。

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| `Enouia Runtime_0.1.0_x64-setup.exe` | 22,912,808 | `661673452c488f18e7f47b173ac956fa651a9b2d2acf15e19775a8945ad09970` |
| `enouia-desktop.exe` | 84,744,755 | `b2910fc08de02f3ea0d2c0c8b37d4c31d637e0a031e0f6ac4312f982b1055d02` |
| `WebView2Loader.dll` | 160,880 | `86545b66cdb0603bc26b626fb9ad610cb6e71f28d468f5ea66df23b03dda96d5` |

打包使用 `npm run desktop:bundle -- --no-sign -- --offline --locked`。TypeScript、Vite、Rust
release 和 NSIS 打包均通过。三份产物在冒烟完成后再次校验了大小和哈希。生成的 NSIS 模板
通过 26 项检查，覆盖数据目录保留、降级保护与登录项清理顺序。沿用现有模板与安装钩子。

候选目录内的程序及相邻 DLL 通过 `--owner-readonly-only` **24/24**。使用专用合成登记库，
覆盖目录搜索、精确引文、检查器、锁定撤回、原库跨进程重开和自启动拒绝开库。新增检查器
断言在打包后加入冒烟脚本，程序来自上表源码。Memory pin 守卫和脚本语法检查通过。
生成模板、构建日志、`artifacts.json`、冒烟日志和结果位置记录保存在候选目录。

Memory 会话在独立于 Runtime 的本机流程提供真实工程验收。`afefa61`（PR119）完成同一原始运行的
351 条形成，原生重开后 11 页、查询、2,149 个来源、2,347 条直接引文、86 条上下文引文及 969 条
附件元数据通过核对。主人选定的同盘导出验证 678 个文件，隔离恢复审计与原库一致，恢复副本
重跑时 `CURRENT` 与 journal 哈希不变。独立介质故障恢复待验证。上游的 Runtime surface 保持原值。

本轮只执行候选构建和上述定向测试。实际安装、升级、分发、及 Morii 在同一登记库上的界面验收
待执行。候选的免安装方式、登录启动限制和人工回执见[只读验收指南](../RUNTIME_OWNER_READONLY_ACCEPTANCE_2026-11-17.md)。
