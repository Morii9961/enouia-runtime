# Activity 并行续作：Codex → Claude 交接

更新日期：2026-10-10。仓库：`E:\Enouia Runtime`。这份文件补充已有的 `ACTIVITY_USAGE_CLAUDE_HANDOFF.md`，不覆盖它或原启动提示词。用户现在希望 Claude 与下一次 Codex 在不同工作树并行；配套 [下一次 Codex 交接](ACTIVITY_CODEX_NEXT_SESSION_2026-10-10.md) 规定分工与汇合规则。


## Claude 接手整合（2026-10-10，Codex 额度用尽后）

Codex 额度用尽后，所有者明确把整合分支、公共证据索引/计数、PR #28 和桌面原生验收交给 Claude 完成本轮。Claude 工作树为 `E:\Enouia Runtime\.claude\worktrees\activity-producer-followup-569bc3`，本地分支 `claude/activity-integration-work` 推送到 `codex/activity-desktop-integration`；worker 分支 `claude/activity-producer-followup` 保留原提交 `63d17b5`/`1c9cf9f`，以合并提交 `10a44c3` 汇入（无冲突）。主工作区 `E:\Enouia Runtime` 的本地整合分支落后于远端，恢复前先 `git pull --ff-only`，并保留用户未跟踪的两个交接文件。

[整合与原生验收](validation/Activity-late-switch-integration-2026-10-10.md)：
- 新增 `--run-switch-lock`：旧 runner `cb665419` 32/38（刷新的 orphan 阻塞下一次 run），整合 runner `ea6b732b` 46/46（退回 `.staging-<id>`，下一次 run 只预留一次序号 88）；先前的 33/38 harness 修订记录单独保留。
- 两个既有暂停演练改为预期 staging 命名残留：指针替换 50/50、指针创建 ACL 52/52（完整 SDDL 已恢复）；旧报告对旧 runner 仍有效。
- 实际操作/Core 隔离 35/35，release runner 强杀 24 项，store 强杀 23/161（worker 重跑）。
- 新鲜检查：根工作区 230 测试、桌面 35+3、fmt/clippy、严格 TS、前端 58、桌面与未签名 NSIS 构建、安装包 26/26、Memory/domain 守卫 8/7 负向。
- 随后完成 Codex 列出的候选：[保存选择文件共享写入拒绝](validation/Activity-claude-choice-write-2026-10-10.md) **16/16**（真实 picker 保存报 saved false 并保留旧字节；释放后保存规范选择、重启与清除恢复），无产品缺陷、产品源码未变。
- 当前二进制：桌面 `ff22aef5…`（源码自 a289e18 未变，换工作树路径重建）、安装包 `3344efeb…`、runner `ea6b732b…`。同源 release runner 多次干净构建字节不同，证据只认 proof 中的冻结副本。

下一候选：设置文件仍为原地截断写入，进程死亡/磁盘满中途截断未验证（可考虑临时文件+替换，但需权衡不共享删除的读者）；进程死亡后新批次/收据孤儿仍需运维对账（可考虑带审计的显式对账命令设计）、`CURRENT.<id>.tmp` 残留累积。真实登录/电源、磁盘满/断电、持续压力、真实账户/调度/收据/发布仍是未授权门槛。

## 本会话续作状态（2026-10-10）

共同交接基线保持 **451d70ed245d1a46166bf7d29a941b69cca3f111**，包含两份交接且 a289e18 为祖先。Codex 新工作树为 C:\Users\Morii\.codex\worktrees\activity-desktop-followup\Enouia Runtime，独立分支 codex/activity-desktop-followup。桌面共享读取验收已 commit/push：**e210bf852bc208a2b09f50a4f96e9e9f0bd4cc39**，远端 SHA 已核对。随后证据/交接提交由整合分支串行快进吸收，原 SHA 保持相同；接手实时核对 HEAD 与 PR #28。

[保存选择文件共享读取验收](validation/Activity-codex-choice-read-2026-10-10.md) **24/24**：实际 FileShare.None 拒绝读取；缓存连接保留三源历史但保存核验失败，释放后同一 host 恢复；锁定期间启动拒绝，释放后真实 picker 与重启恢复。设置与完整 Activity store 字节保留。未发现产品缺陷，未修改产品源码/协议/pin。最初独立 exe 副本缺 WebView2Loader.dll 的 **0/1 no main page** 前置失败已保留；补齐 DLL 后以全新 Temp 夹具通过。

当前证据索引为 **58 报告 / 902 选择器 / 60 负向检查**，18 行均 partial，B4/B5 false。桌面/runner 哈希与 a289e18 相同；此前 58 前端、35+3 host/Core、严格/原生/安装包构建、26 安装包与35/35实际操作证据明确复用，未重新执行以增加计数。新鲜检查仅为此次24/24、E2E语法/whitespace、Memory守卫8负向和证据守卫60负向。

Claude 正在 E:\Enouia Runtime\.claude\worktrees\activity-producer-followup-569bc3 的 claude/activity-producer-followup 实施 store reader/writer/late_switch_failure，起点已实时核对为451d70ed。此前新树登记路径曾变化，以 git worktree list 为准。Codex未改这些文件，未读取个人数据；截至此记录尚无Claude已推送最终切片可接收（初步原始报告状态见下），**不得把dirty代码或旧7309cb9再次汇合**。后续先收其已推送SHA与完整报告，再审查范围/祖先/哈希并串行整合；产品变更后需相关新二进制实际操作验证。

额度最新查询：5小时已用 **88%**，剩余 **12%**（账户共享快照，会变化）。本会话停止开启新功能，保留提交、推送、PR和交接余量，不使用重置券。主仓库仍保留用户 docs/ACTIVITY_USAGE_CLAUDE_HANDOFF.md、docs/prompts/CLAUDE_ACTIVITY_USAGE_START.md；main/旧Claude/e8f6未重置。此次原生进程/holder已结束，Temp夹具保留。

下一候选是**实际已存在保存选择文件的共享写入拒绝**：真实picker保存失败时保留旧字节和明确反馈，释放后恢复。先审查已有保存失败（目录阻塞）覆盖，额度足够再启动；不要重做缺runner/启动/busy/picker交错/bounded-read切片。


串行汇合已完成：Codex 两个提交保持原 SHA 快进进入 codex/activity-desktop-integration，整合远端和 PR #28（OPEN DRAFT）已核对到311cbe7b04b026d82e146c80befd3df2a6fb9721；之后仅补充本段交接记录，实时HEAD须再次查询。提交字节审计通过：58个索引报告及关联文件共138个SHA-256文件均与Git HEAD一致；产品源码/manifest/lock/pin相对a289e18完全未变。

收尾时额度已用90%，剩余10%，不启动新切片。Claude新生成的未跟踪原始报告 Activity-claude-late-switch-tests-2026-10-10.json 与 Activity-claude-late-switch-hard-kill-2026-10-10.json 已初步收取查看；仍无已提交/推送的最终交付。报告显示其关注新批次/收据在晚期指针失败后的可重试性及强杀保守恢复，属于producer/store/runner范围。未完成独立审查、不计入58/902/60、不汇合dirty代码；接手需取得完整提交SHA、原始报告与最终binary身份后再验证。此处不是Claude功能完成或产品验收声明。

## 首次交接快照：当前状态与接手入口

整合分支为 `codex/activity-desktop-integration`，现有 [PR #28](https://github.com/Morii9961/enouia-runtime/pull/28)，保持 OPEN DRAFT。下一次 Codex 负责最终汇合；Claude 在自己的新分支上工作，不直接更新整合分支或 PR。不要重建 PR、合并 main 或重做 Claude 已合入的工作。接手时必须先核对实际分支、工作区、远端 SHA、PR 状态和已附证据；这是一份快照。

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

最新用户要求：多任务共享限额，提前留余量，接近限额时停止新功能、完成可完成的当前切片并整理交接，不能等到完全耗尽。此次查询 Codex 的 5 小时窗口已使用 72%，剩余 28%，因此本轮只更新交接。不同 Codex 会话/工作树共用账户限额，开新会话不会重置它；这里没有查询 Claude 的独立额度。下次开始前刷新实际用量，给多任务波动、验证、提交、推送和交接留余量，不自行消费重置券。

## Claude 的并行范围

Claude 负责 Activity 生产器/store/runner 的本地合成验收和有复现依据的修复；Codex 负责桌面 host/surface/E2E、公共证据索引和最终整合。双方以新增配套 Codex 交接文件的同一个提交为起点，记录完整基线 SHA。它包含 `a289e18` 和两份交接；不要从 main 或旧 Claude HEAD `7309cb9` 开始。基线查找、文件归属和验收资源规则见配套交接。

Claude 可修改 `crates/enouia-activity/`、`crates/enouia-activity-store/`、`crates/enouia-activity-runner/`，新增 `scripts/claude-activity-*` 与 `docs/validation/Activity-claude-*` 文件。桌面文件、现有公共验收脚本、证据索引/检查器、汇总文档、根 workspace manifest/lock 和 PR 正文由 Codex 协调；不要同时修改。跨边界问题交付复现与建议，由对应负责人处理。

第一项先对照 store 的 writer/generation/recovery 测试和 C12/C17 已有覆盖，寻找一个尚未覆盖的晚期写入或 generation 恢复边界，用独立临时目录复现，必要时修复并验证。CURRENT 读取、generation 创建、临时指针创建与 CURRENT 替换的已完成拒绝/恢复验收不要重复。这里列的是研究候选，不是已确认产品缺陷；没有实际缺口时记录发现与剩余门槛，不新增凑数报告。不涉及物理断电、真实磁盘满或生产数据。

每个切片在自己的新分支验证、commit、push，再交付基线/提交 SHA、文件清单、检查与原始失败/成功报告及哈希。保留旧失败报告。独立原始报告可先提交，由 Codex 汇合后统一接入索引和调整计数；未经整合验证不得更新 57/878/59 或 B4/B5。保留已有 Codex trailer；Claude 自己的新提交不能把没有参与的 Codex 列为共同作者。

真实登录/电源/生产门槛需要另外授权。若授权范围内没有有价值的代码或隔离验收可继续，就整理具体所需证据与授权项，不要重复已完成检查来增加报告数量，也不要为了持续工作自行跨过真实环境门槛。

## 可复制给 Claude 的接手指令

```text
请接手 Enouia Runtime 的 Activity 生产器/store/runner 本地合成续作，与下一次 Codex 分工并行。
先在 E:\Enouia Runtime 阅读 docs/ACTIVITY_CODEX_TO_CLAUDE_2026-10-10.md、docs/ACTIVITY_CODEX_NEXT_SESSION_2026-10-10.md、AGENTS.md 和引用的验证/索引。
用 git log --diff-filter=A --format=%H -- docs/ACTIVITY_CODEX_NEXT_SESSION_2026-10-10.md 找到共同交接提交，核对它包含两份文档且 a289e18 为祖先，并记录完整 SHA。从该提交建立自己的新工作树和独立 claude/ 分支（例如 claude/activity-producer-followup；先检查名称和目录未被占用）。不要重置、复用或清理现有 Claude/Codex 工作树，不在主整合工作区实施。
核对 dirty/untracked、远端 SHA、draft PR #28、证据哈希和当前工具链；新工作树不保证已有 target/node_modules/忽略的 helper，按文档自行准备独立构建与夹具。
保存选择读取修复已在 a289e1882f5944fc1af2ba180eb38441ecbf0274 完成并推送，后面可能只有交接文档提交。
先审查 store 晚期写入/generation 恢复的真实覆盖缺口；只在自己的 producer/store/runner 和新 claude-activity 验证文件内先复现、按需修复、验证，每完成一个功能独立 commit 并 push 自己的分支。
Codex 独占桌面接入、公共索引/检查器/汇总和 PR 更新；你的交付记录基线 SHA、提交 SHA、检查范围、原始报告与哈希、剩余门槛。不要改公共索引计数、整合分支或 PR，也不要执行其他任务的原生窗口/快捷键/定时任务验收。遵循配套交接的资源隔离和汇合规则。
Activity 保持 github/codex/claude 三源及独立 Memory 边界；禁止个人数据/凭据/真实账户/生产上传、生产调度启用、Moriium 修改和服务器部署。B4/J1 仍 partial、B5 未启用，不能把合成或旧二进制证据当作生产验收。
共享额度快用尽时提前收尾并更新交接，留足提交、推送和核对余量。
```
