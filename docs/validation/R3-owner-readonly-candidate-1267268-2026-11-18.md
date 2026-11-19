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

候选交付后的定向回归沿用同一产物。三个隔离 NSIS 夹具通过版本保护 **7/7**、登录项清理
**5/5** 和锁定文件 **2/2**。版本测试使用 `HKCU\Software\EnouiaRuntimeTests` 下的专用键，登录
清理测试也在独立键下执行并确认已移除，锁定文件测试只使用新建临时目录中的假文件。结果
见候选目录内 `version-guard.log`、`startup-cleanup.log` 和 `locked-file.log`。

候选程序在内置分段合成模式的 `--catalog-only` 回归 **42/42**。覆盖三语明暗主题的最小窗口、
分页、中文检索、精确来源、overlay 读取拒绝、锁定撤回、解锁同根读取、退出与自启动。日志
和报告位置见 `catalog-smoke.log` 与 `catalog-location.txt`。随后再次核对三份候选产物的大小
和 SHA-256，均与上表一致。

普通 Workspace 在普通 Windows 桌面使用短路径合成根及新 WebView2 配置复测通过：

| 模式 | 结果 | 覆盖范围 |
| --- | --- | --- |
| `--rapid-nav-only` | 6/6 | 启用页面转场时，连续快捷键以最后一次为准；测试进程正常退出 |
| `--layout-only` | 33/33 | 1100×700 和 1600×700 下六个主界面，含长文本来源、可达的更正输入框、本地 Mock 会话及 Context |

日志 `workspace-native-rapid-nav.log`、`workspace-native-layout.log` 和报告位置记录均在候选目录。
使用的是新初始化的 Workspace v1 合成库，测试只操作候选自己的窗口。

同一候选随后通过 `--accessibility-only` **27/27** 和 `--keyboard-journey-only` **17/17**。
前者核对六个界面的 Windows UI Automation 名称、跳转链接和确认弹窗焦点；后者通过 WebView2
窗口内按键，从保存候选、批准、读引文走到本地 Mock 会话和 Context，并核对保存的回执。
两个模式各使用一个全新的合成库。辅助功能首次在 Runtime 页因窗口句柄归属校验中止
（8/9）；用原脚本完整复测通过，未修改窗口归属校验或产品。结果见候选目录的
`workspace-native-accessibility-final.log`、`workspace-native-keyboard-journey-final.log`
和对应报告位置记录。

首次 `--layout-only` 在 179 字符的合成根中打开库，准备数据的 `remember` 返回
`storage_failed`；随后在沙箱环境复跑，两项均未连上测试进程的主窗口。保留原失败日志。

用 `506d23d` 的 Windows CLI 在同一临时父目录新建四个合成根，提交同一条合成文本：142 字符根
的 `init`、`assert`、`verify` 均通过；165、179、192 字符根初始化通过，`assert` 均返回
`storage_failed`（`NotFound`），`verify` 仍通过，并确认库停在初始化提交。这个写入失败可脱离
Runtime 复现；测试长度不是通用路径上限。长路径写入仍由 Memory 定位，两项短路径回归
不构成长路径修复证据。三份候选文件在原生复测后再次核对大小和 SHA-256，均与上表一致。

Memory 会话在独立于 Runtime 的本机流程提供真实工程验收。`afefa61`（PR119）完成同一原始运行的
351 条形成，原生重开后 11 页、查询、2,149 个来源、2,347 条直接引文、86 条上下文引文及 969 条
附件元数据通过核对。主人选定的同盘导出验证 678 个文件，隔离恢复审计与原库一致，恢复副本
重跑时 `CURRENT` 与 journal 哈希不变。独立介质故障恢复待验证。上游的 Runtime surface 保持原值。

## 真实登记库的本机代理实测

11 月 18 日，Memory 交付会话使用原登记的 Windows 登录账户，以免安装方式运行同一
候选 `1267268` 和 pin `506d23d`。以下是会话交付的工程摘要；Runtime 会话未打开私人根或来源。

| 操作 | 观察 |
| --- | --- |
| 启动、Home 与 Settings | 原登记库显示已打开、只读；Settings 可进入原生记忆目录 |
| 检索、清空与翻页 | 无命中与已知项检索、清空后恢复列表及翻页通过 |
| 详情和来源 | 样本详情与精确引文读回通过 |
| 锁定、退出与同根重开 | 显示引文时锁定撤下列表、计数、详情和来源；通过 Runtime 退出后用原登记重开，复读同一样本，最终锁定并退出 |

桌面目录显示 **259 条**。交付会话的只读聚合探针使用候选的 `Private` 上限复现 259 条；
探针以 `HighlySensitive` 为上限时有 351 条，与 Memory 审计总数一致。无需扩大桌面
可读范围或新建 grant。交付会话核对 `CURRENT` 和初始化日志仍与已验证的恢复副本一致；
本次读窗口到北京时间 11 月 24 日 07:27:13。

以上是代理在真实桌面的实测。Morii 的人工验收、实际安装与升级、托盘、热键、登录启动、
分发和独立介质故障恢复仍待执行。免安装方式及人工回执见
[只读验收指南](../RUNTIME_OWNER_READONLY_ACCEPTANCE_2026-11-17.md)。

## 后续补丁

键盘锁定后焦点落到 `BODY` 的问题在 2026-11-19 修复，修复版原生 25/25，本候选同夹具 24/25。见
[键盘锁定焦点验证](R3-owner-lock-keyboard-focus-2026-11-19.md)。本候选的上述成绩不变。
