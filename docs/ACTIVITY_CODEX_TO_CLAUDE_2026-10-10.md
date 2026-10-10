# Activity 原生整合：Codex → Claude 交接

更新日期：2026-10-10。仓库：`E:\Enouia Runtime`。这份文件补充已有的 `ACTIVITY_USAGE_CLAUDE_HANDOFF.md`，不覆盖它或原启动提示词。

## 当前状态与接手入口

工作分支为 `codex/activity-desktop-integration`，现有 [PR #28](https://github.com/Morii9961/enouia-runtime/pull/28)，保持 OPEN DRAFT。不要重建 PR、合并 main 或重做 Claude 已合入的工作。接手时必须先核对实际分支、工作区、远端 SHA、PR 状态和已附证据；这是一份快照。

截至当前，最后已提交并推送的功能为 `a289e1882f5944fc1af2ba180eb38441ecbf0274`。本文自身会有后续文档提交，不改变该功能 SHA。原生 Activity 已接入分别安装的生产器，Claude 分支的剩余 Runtime 实现已通过合并保留祖先关系。不是完整 J1/B4 验收，也没有启用 B5。

最近完成：

- `87c7706`：运行期间原生 select/clear 返回 busy；同一次运行结束后恢复，12/12 原生检查和 35/35 实际操作检查通过。
- `c518c6f`：选择器先打开、再启动实际运行、随后确认选择的交错验收，15/15 通过。
- `2cb0e0c`：安装包运行器文件缺失时实际读取/暂停/两种运行/重选被拒绝；开发仓库运行器存在也没有回退，22/22 通过。
- `0a94272`：保留保存选择但运行器缺失时真实重启，显示连接入口、保留配置和暂停数据，不误报保存/忘记失败；恢复后重新选择/继续/重启，26/26 通过。
- `a289e18`：保存选择只接受绝对路径，按同一文件句柄限制读取 64 KiB+1；可比原生 14/20 提升至 20/20，实际操作/Core 隔离 35/35 通过。

完整范围、各次二进制、检查复用和剩余门槛见 [汇总验证](validation/Activity-unified-2026-10-08.md)、[B4 覆盖说明](validation/B4-coverage.md) 和 [证据索引](validation/B4/coverage.json)。当前已提交证据为 57 报告 / 878 选择器 / 59 负向检查；18 行全部 partial，B4/B5 均为 false。数量重叠，不能作为完整验收总数。

## 本轮最后完成的切片

保存的 Activity 安装包选择需要拒绝相对路径和超大设置文件。旧版真实原生可比基线为 **14/20**，相对路径及超过 64 KiB 的配置各失败三项：status、overview、连接入口/历史卡片。格式损坏配置正确拒绝；所有异常输入字节和完整 Activity 数据保持原样。

原先验收脚本的 Windows 扩展路径比较曾在恢复步骤报 `EISDIR`，原始结果 **10/17** 已提交到 [前置失败记录](validation/Activity-unified/saved-choice-boundary-harness.json)。脚本已修正，再用新夹具得到上述可比 14/20。不要把最初的脚本失败当作产品回归，也不要删除它以掩盖前置失败。

代码在 `apps/desktop/src-tauri/src/activity.rs` 增加独立 `read_saved_root`：同一文件句柄最多读取 64 KiB+1，超过限制或非绝对根路径返回未配置，不改写异常文件。现有真实 picker 的规范绝对选择保持兼容。`apps/desktop/e2e/activity-smoke.mjs` 增加 `--saved-choice-boundary`，只有该合成模式以自己的临时包父目录为启动工作目录。

最终结果已经验证并随 `a289e18` 提交、推送：前端 **58/58**、原生 **35** + pinned Core **3**、fmt/clippy（warnings denied）、strict TypeScript/frontend build、桌面与未签名 NSIS 构建、安装包所有权 **26/26**、Memory/domain 守卫 **8/7** 负向、真实设置边界 **20/20**、独立实际操作/Core 隔离 **35/35**、证据完整性 **57/878/59**。完整报告见 [保存选择读取边界](validation/Activity-saved-choice-boundary-2026-10-10.md)。没有未提交的产品代码或等待中的运行任务；原始 Temp 夹具保留。

当前二进制标识（接手时再次计算确认）：

- 桌面 `apps/desktop/src-tauri/target/release/enouia-desktop.exe`：`bfc52c51fb0a3ac4bf2e40229bc354c97e600b6a9901030e6145b4ff3ec413f9`。
- 未签名安装包 `apps/desktop/src-tauri/target/release/bundle/nsis/Enouia Runtime_0.1.0_x64-setup.exe`：`94531ab0a142842d63b380e1f818bcfffeee815c612631a3682e2f9bd99ffe57`。
- Activity runner `target/release/enouia-activity.exe`：`cb665419f42ff088425012f9e43cebf22a21d2647f0a1a19b97df7ca236c8b7a`，本轮没有修改生产器协议或调度实现。

忽略目录下的运行入口和记录：

- `target/activity-saved-choice-boundary-{harness,before}-package.json`：首次脚本失败和可比旧版夹具元数据。
- `target/activity-saved-choice-boundary-before-native.log`：14/20 可比基线。
- `target/activity-saved-choice-boundary-*`：当前切片已完成的日志/夹具。
- `target/record-saved-choice-boundary.mjs` 及其他 `record-*.mjs`：本轮相关记录脚本已经执行，不能再执行以重复追加报告或覆盖证据。
- `target/audit-activity-evidence-blobs.mjs`：提交后核验索引、原始关联报告在工作区与 Git HEAD 中的实际字节；当前 57 报告、134 个哈希文件已核对。
- `target/activity-pr-refresh.md`：现有 PR 的精确正文草稿。

## 继续工作的边界与约定

先读根目录 `AGENTS.md`、Architecture v0.3、ADR-025/028/030/031 和 `docs/MEMORY_INTEGRATION_v1.md`。Activity 是 Runtime 独立领域，公开源只含 github、codex、claude；不得混合 AI 总量或变更单位/日边界。Memory 仓库拥有 Memory/Context/Sessions/Core/云领域；Runtime 的 Memory pin 为 `ff692ccb6fbc1c387254d5ffbef41b105eeb2a84`，不得顺手升级或延伸冻结的 Runtime Memory crates。

保持 main `29401fe318f457af5f33ee84620ee276921a69f3`、Claude 分支 `claude/moriium-activity-usage-runtime-4bc09f` 的 `7309cb92863694e34eb907317c323deef4f24fbd` 和其工作树原样。不要覆盖当前未跟踪的 `docs/ACTIVITY_USAGE_CLAUDE_HANDOFF.md`、`docs/prompts/CLAUDE_ACTIVITY_USAGE_START.md`。多任务共享仓库时先查状态，不能把别人的变更加入自己的提交。

用户要求每完成一个功能单独 commit；仓库要求验证后 commit 并 push，保留其他贡献者变更，并使用精确 trailer：

```text
Co-authored-by: Codex <267193182+codex@users.noreply.github.com>
```

只使用新建、明确拥有的合成临时安装包/设置/原生进程，必要的临时 Vault 通过实际 Core picker 和命令建立，不能直接修改其规范文件。Temp 夹具默认保留，禁止广泛清理。UIA 和 CDP 只能触碰已核验 PID/监听器归属的本次窗口。过去的临时 Windows 任务均已删除；不要复用或改动现有/生产任务。文件权限验收仅能对新合成文件/目录添加不继承的当前 SID 规则，保存完整原 SDDL、恢复 DACL 并比较完整描述符；所有 helper 有限时退出。

没有授权：个人活动档案/Vault/凭据、真实账户采集、个人迁移、生产上传、生产定时任务启用、真实种子切换、Moriium checkout 修改、服务器部署。Moriium 只可按既有 allowlist 读取公开参考文件。实际登录/电源/电池、磁盘满/中途写入/断电、持续压力、真实远端收据与发布观察等仍须保留门槛，不能把合成验证写成生产证明。

Windows 工具链为 Rust 1.98.1 GNU，PATH 中 UCRT64 在 cargo 前；已缓存依赖可离线构建。按 Memory integration v1 运行受影响检查，尤其 Memory pin 和生产依赖边界；新产品二进制需要新实际操作回归。仅脚本/文档变化可明确复用未变更产品的有效证据。原始 JSON 统一 LF 后再哈希，索引和 Git 提交中的字节必须一致，不覆盖旧失败报告。

最新用户要求：多任务共享限额，提前留余量，接近限额时停止新功能、完成可完成的当前切片并整理交接，不能等到完全耗尽。Codex 当前采用短周期使用量约 70% 即开始收尾的保守阈值。上一轮额度耗尽导致自动审批没有执行下一组命令；恢复后已经继续，不能绕过审批或自行消费限额重置券。

## 后续候选项

先核对最终 SHA、PR 和本文的快照，确认保存选择切片已经完成，避免重做。下一步可选一个未覆盖且有价值的独立故障/兼容性边界，例如实际保存选择文件的 Windows 共享读取失败及恢复；只用新合成设置文件，不改变个人设置。运行选择与 admission 的其他竞争顺序可以先研究，但当前并没有已复现的新增缺陷，不要按猜测修改产品。

真实登录/电源/生产门槛需要另外授权。若授权范围内没有有价值的代码或隔离验收可继续，就整理具体所需证据与授权项，不要重复已完成检查来增加报告数量，也不要为了持续工作自行跨过真实环境门槛。

## 可复制给 Claude 的接手指令

```text
请接手 E:\Enouia Runtime 的 Activity 原生整合剩余工作。
先完整阅读 docs/ACTIVITY_CODEX_TO_CLAUDE_2026-10-10.md、AGENTS.md 和其中引用的最新验证/索引。
核对当前分支、dirty/untracked 状态、远端 SHA、现有 draft PR #28、证据哈希和产品二进制；不要覆盖其他任务文件，不要重做已完成切片或改动 main/原 Claude 工作树。
保存选择读取修复已在 a289e1882f5944fc1af2ba180eb38441ecbf0274 完成并推送，后面可能只有交接文档提交。
选择一个有价值且仍未覆盖的 Runtime 本地合成验收/实现项，先复现，再修复、验证，每完成一个功能独立 commit 并 push，保留精确 Codex trailer 的既有提交。
Activity 保持 github/codex/claude 三源及独立 Memory 边界；禁止个人数据/凭据/真实账户/生产上传、生产调度启用、Moriium 修改和服务器部署。B4/J1 仍 partial、B5 未启用，不能把合成或旧二进制证据当作生产验收。
共享额度快用尽时提前收尾并更新交接，留足提交、推送和核对余量。
```
