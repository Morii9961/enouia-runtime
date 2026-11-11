# UI v2：换库清除列表与详情的合成截图（2026-11-11）

接续 [2026-11-07 交接](../integration/CLAUDE_TO_CODEX_2026-11-07.md)「下一步建议」第 1 项，以及 [#149 的行为验证](UI-v2-vault-switch-clearing-2026-11-07.md)。产品代码基线为 `main@0f39e05`（#168 已合并），本片只补截图桩、取证脚本和文档，没有修改产品组件、Memory pin 或原生程序。

新增 `e2e/memory-vault-switch-preview.html` / `.tsx`，渲染原有 `MemorySurface` 和状态 provider。全部 Workspace IPC 用两个虚构 Vault 的状态、列表和详情读取替代，其他命令拒绝；页面始终显示 `FICTIONAL FIXTURE · NO NATIVE CONNECTION`。

每次都先读取 A 库并选中一条详情，然后按 URL 的 `state` 停在以下三个状态之一：

| 状态 | 截图前实际经过的步骤 | 检查结果 |
| --- | --- | --- |
| `before` | A 库列表与选中详情已显示 | A 的行、选中态和详情均存在 |
| `loading` | 状态直接从 A open 变为 B open，未观察到 `vaultChanging`；B 的列表请求保持未完成 | A 的行和详情消失，列表显示读取中，Inspector 提示先选择记忆；没有继承选择 |
| `ready` | 同样切到 B，B 的列表读取完成 | 只显示 B 的行，未自动读取 B 的详情，没有继承 A 的选择 |

独立无头 Edge `157.0.4341.42`、1100×700、DPR 1、三语 × 双主题 × 三状态，共 **18 组全部通过**。检查还覆盖虚构水印可见、无页面横向溢出、无页面错误、只发送三类只读 Workspace 命令、真实宿主调用为 0。已查看全部截图的联系表，并原尺寸检查中文深色 `before`、中文浅色 `loading` 和日文浅色 `ready`：水印、列表、详情撤回和空选中提示可见。

取证过程保留两次失败：首次在 `Runtime.enable`、第二次在 `Page.enable` 达到脚本的 60 秒命令上限，均未完成截图验证。首次另有共享 Vite 依赖缓存重命名 `EPERM`；脚本改用输出目录内的独立 `cacheDir` 后该错误未再出现。第三次直接启动合成页面、记录各命令耗时后完成全部 18 组；启动阶段前四个命令约 10.2 / 21.2 / 9.6 / 31.5 秒，之后命令恢复到毫秒级。尚不能据此确定前两次协议超时的根因；没有增加自动重试或放宽超时。

验证：

- 完整 `npm test` 通过：Node 151 项（148 通过、3 跳过、0 失败）；DOM 122 场景、2,525 项全部通过，包括既有 `memory-vault-switch` 的 6 项行为检查。
- 原产品源码和新增 TSX 截图桩的 TypeScript 检查通过；取证脚本语法检查及实际 18 组浏览器执行通过。
- 最终本地证据：`apps/desktop/target/vault-switch-evidence-20261111-page-start/` 下的 `report.json`、18 张 PNG 和 `contact-sheet.png`；同名 `.log` 保存命令耗时。前两次日志分别在 `target/vault-switch-evidence-20261111.log` 和 `target/vault-switch-evidence-20261111-retry.log`。全部生成文件留在忽略目录，不提交。

这是合成浏览器组件的截图与行为证据，**不是实际换库、权限撤回、删除、个人 Vault 或 Morii 人工验收**；也未覆盖 Inbox、Home、Context、Sessions 等其他表面的换库视觉。未启动 Runtime 原生程序、运行安装或系统热键 / 文件对话框模式、访问个人 Vault、使用真实 Provider、迁移或部署。没有发现需要修复的产品缺口；剩余状态取证和人工验收按原路线继续，待决定事项不变。
