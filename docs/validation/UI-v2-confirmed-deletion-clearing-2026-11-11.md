# UI v2：删除确认后立即撤下旧列表（2026-11-11）

接续 [#170 的锁库与状态失读取证](UI-v2-vault-status-fixture-2026-11-11.md)，从 `main@7f66d24` 开始。本片在补删除截图时发现并修复了一个产品问题，不只是增加证据。

## 复现与最小修复

实际 `Explorer` 在收到 Memory 的遗忘或永久清除确认后，会关闭详情并重读列表，但重读期间仍保留旧行、总数和下一页游标。只要列表读取尚未返回，已删除的记忆就仍能留在界面里；这不是删除未提交，而是显示缓存未撤下。

在既有 `memory-forget-focus` 合成 DOM 场景中暂缓确认后的列表回执，新增遗忘、永久清除各一条断言。修复前 **22 项中这两项失败**，其余通过。修复只改 `Explorer` 已有的确认回调：收到 Memory 回执后清空列表、总数、游标和已加载标记，再沿用原来的重读。确认提示、选择撤回及读取完成后的焦点规则保留，不增加请求、写入或轮询，也不在提交确认前假定成功。修复后定向 **22/22**。

## 浏览器取证

复用原有静态截图工具和真实 `MemorySurface`，新增四态：

| 状态 | 合成流程 | 检查结果 |
| --- | --- | --- |
| `forget-refreshing` | 遗忘确认回执已返回，列表重读保持未完成 | 旧行、详情和旧计数已撤下；显示确认提示与读取中 |
| `purge-refreshing` | 永久清除确认回执已返回，列表重读保持未完成 | 同样撤下旧显示；提示明确是永久清除 |
| `forgotten` | 确认后读回空列表 | 保留遗忘回执提示，显示实际空结果，不继承选择 |
| `purged` | 确认后读回空列表 | 保留永久清除回执提示，显示实际空结果，不继承选择 |

每次先读取并选中 A 库的虚构记忆，再由真实按钮创建计划和确认；mock 只允许该记录、该模式及对应计划/hash 的一次确认。原先六态仍只允许读取。新增三语 × 双主题 × 四态 **24 组**，连同旧场景 **60 组全部通过**；无页面错误、横向溢出或未预期宿主动作。已查看新增 24 组联系表，以及中文深色遗忘重读中、日文浅色永久清除重读中、中文浅色永久清除完成的原尺寸截图。浏览器为独立无头 Edge `157.0.4341.42`，1100×700、DPR 1。

## 验证与边界

- 完整 `npm test`：Node 151 项（148 通过、3 跳过、0 失败），DOM 122 场景、2,527 项全部通过。
- 原源码与截图桩的 TypeScript 检查、取证脚本与原生冒烟脚本语法检查通过。`check-memory-integration.mjs --self-test` 通过（8 个反例检查），`check-activity-retirement.mjs` 通过；Memory pin 仍为 `731edd56a276ffa752c736b7d2be667b9e12776c`。
- 离线、锁定构建无安装包的 release 程序通过：`npm run desktop:build -- --no-sign -- --offline --locked`，包含前端类型检查和 Vite 构建，Rust release 编译 1m 12s。Rust 源码未改，未重跑 Rust 单元测试或全套原生模式。
- 使用此前从固定 pin 构建的 Memory CLI 初始化全新临时 Vault，release `--forget-only` **17/17 首次通过**。新增检查在真实 Core 已确认逻辑遗忘、真实列表回执被暂缓交付期间，验证旧行和详情消失、读取中可见；释放回执后剩余记忆正常显示。已查看原生 `38a-forget-list-refreshing.png`。该模式仅预览并取消永久清除计划，没有在原生程序中执行永久清除；永久清除后的撤回由上述合成 DOM / 浏览器场景验证。

本地证据（均为忽略目录）：

- `apps/desktop/target/forget-clearing-before-both-20261111.json`、`forget-clearing-after-20261111.json`：修复前后 22 项定向结果；完整测试为 `forget-clearing-tests-20261111.log`。
- `apps/desktop/target/forget-clearing-evidence-20261111/`：`report.json`、60 张 PNG、`deletion-contact-sheet.png` 和静态 fixture；同名 `.log` 为取证日志。
- `apps/desktop/target/forget-clearing-20261111-native/`：构建日志、另存的 exe / WebView2 DLL、`forget-smoke.log` 和 `fixture-path.txt`；原生逐项报告及截图在该文件指向的 `E:\enouia-smoke-temp\forget-clearing-20261111\` 独立 fixture 中。

这不是个人 Vault、其他表面或 Morii 人工验收。没有访问个人 Vault、调用真实 Provider、运行安装/升级、发送系统热键、打开文件对话框、迁移或部署；待决定事项不变。只构建了验证用程序，尚未打包含此修复的 Windows 安装候选包，`734b597` 候选仍不含本片。
