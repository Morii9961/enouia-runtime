# UI v2：锁库与状态失读后的内容撤回截图（2026-11-11）

接续 [#169 的换库取证](UI-v2-vault-switch-fixture-2026-11-11.md) 和交接路线中 SCREENS §9 的状态缺口。基线 `main@c8c9b3c`，只扩展合成截图桩、取证脚本和文档，不修改产品组件、Memory pin 或候选包。

每次先在原有 `MemorySurface` 中显示 A 库的一条记忆并选中详情，再模拟以下只读回执。没有操作真实 Vault、文件权限、锁库命令或删除命令。

| 新状态 | 合成回执 | 已检查的界面结果 |
| --- | --- | --- |
| `locked` | `workspace_status` 从 open 变为 locked | 旧记忆行、详情和选中态撤下；显示锁库连接卡片和 Inspector 提示。库名可继续显示，记忆正文不可显示 |
| `status-error` | 状态读取返回 `storage_failed` | 状态变为未知，旧行和详情撤下；显示状态无法读取、会重试的说明；不冒充无库或展示新建卡片 |
| `permission-denied` | 状态读取返回 `permission_denied` | 同样撤下旧内容并显示失读说明；这是前端消费错误回执的证据，不证明 Windows 权限变化的后端链路 |

三语 × 双主题 × 上述三态，共 **18 组新增截图通过**；加上原有 before / loading / ready 的 18 组，共 **36 组通过**。所有场景都先确认 A 库选中详情已出现，再检查撤回结果；门禁关闭后不再读列表。每组检查水印可见、无横向溢出、无页面错误、无未预期宿主动作。Workspace 只允许状态、列表、详情三种读取；锁库卡片的 `VaultAdmissionNotice` 另有只读 `shell_status`，单独 mock 并记录，不放行其他宿主命令。

取证使用独立无头 Edge `157.0.4341.42`，1100×700、DPR 1。已目视核对全部截图的联系表，并原尺寸查看中文深色 locked、中文浅色 status-error、日文深色 permission-denied：旧正文已消失，提示和水印可见。

## 取证工具的失败与处理

开发服务器方式有六次未完成的尝试：首轮 Edge 在 Runtime.enable、单独重跑在 Page.enable、Chrome 对照在 Runtime.enable、先读 document.readyState 的 Edge 对照在 Runtime.enable、去掉 enable 的两组小对照在 Runtime.evaluate、限定 Vite 扫描入口的 Edge 对照在 Emulation.setEmulatedMedia，均达到原有 60 秒命令上限。没有将这些尝试计为截图通过，也没有增加自动重试或放宽超时。

最小 data-URL 浏览器探针正常；独立连接读到完整合成页面仍停在模块加载阶段，部分资源等待约 18 秒。仅改变浏览器或协议启用顺序没有解决问题。因此最终按 Vite 8.3.1 已安装类型和[官方 build / preview API](https://vite.dev/guide/api-javascript.html#build)，只构建这个 HTML 入口到本次输出目录，再用本地静态预览取证；不修改项目的开发配置、默认 dist 或安装包。最终运行前四个协议命令为 6 / 2 / 5 / 2 毫秒。此结果证明静态取证方式完成了本轮检查，不能把所有历史 CDP 超时归结为一个已确认根因。

首次静态运行到 locked 时，还因截图桩没有模拟 `VaultAdmissionNotice` 的只读 `shell_status` 而失败（计数 1）。核对真实组件后补齐该 mock，并另行断言只有 locked 场景出现这类读取；最终 36 组均通过。未发现需要修改的产品缺口。

## 验证与证据

- 完整 `npm test`：Node 151 项（148 通过、3 跳过、0 失败），DOM 122 场景、2,525 项通过；这些既有测试与新增浏览器截图检查分别记录。
- 原源码和新增 TSX 截图桩的 TypeScript 检查通过；取证脚本语法检查与最终 36 组静态浏览器执行通过。没有重跑 Rust、原生冒烟或完整桌面构建。
- 最终产物在 `apps/desktop/target/vault-status-evidence-20261111-final/`：`report.json`、36 张 PNG、`contact-sheet.png`、仅该 fixture 的 `preview/`；同名 `.log` 保存命令耗时。完整前端测试日志为 `target/vault-status-evidence-tests-20261111.log`。
- 失败日志保留在 `target/vault-status-evidence-20261111{,-retry,-chrome,-initial-read,-no-enable-probe,-focused-entry,-static}.log`；最小探针日志为 `target/vault-status-startup-probe-edge.log`。生成文件和实验脚本均留在忽略目录，不提交。

这些是 Memory Vault 列表与详情的合成浏览器证据，不是实际权限撤回、删除、其他表面、WebView2 原生或 Morii 人工验收。没有启动 Runtime 原生程序、安装或升级、发送系统热键、打开文件对话框、访问个人 Vault、调用真实 Provider、迁移或部署。待决定事项不变。
