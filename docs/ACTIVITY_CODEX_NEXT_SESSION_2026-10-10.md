# Activity：下一次 Codex 会话交接

更新日期：2026-10-10。此文件与 [Claude 交接](ACTIVITY_CODEX_TO_CLAUDE_2026-10-10.md) 一起定义并行续作。两份文件内的启动指令供用户启动会话；下文保留首次交接快照；顶部续作状态记录本会话实际工作。


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

## 首次交接快照：已完成到哪里

仓库为 `E:\Enouia Runtime`，整合分支 `codex/activity-desktop-integration`，现有 [PR #28](https://github.com/Morii9961/enouia-runtime/pull/28) 为 OPEN DRAFT。本文更新前，本地与远端 HEAD 均为 `70b7dc5147e7b5754a25c92a61a390e6b17be494`；两份交接的更新会形成后续文档提交。接手时重新核对，不能把此快照当作实时状态。

最后产品提交 `a289e1882f5944fc1af2ba180eb38441ecbf0274` 已推送：原生 Activity 保存选择只接受绝对安装包根路径，按同一文件句柄最多读取 64 KiB+1，拒绝超大/损坏设置并保留原字节。真实基线 14/20 → 20/20；前置脚本错误 10/17 的原始报告保留。此前的运行时设置 busy、已打开 picker 与实际 run 交错、安装包 runner 缺失和保留选择后的缺失 runner 重启恢复均已完成，勿重做。

原生 Activity 通过自己的 runner 使用分别安装的生产器；Memory/Context/Sessions 通过 pinned Memory Core。浏览器预览/Inspector 仍为明确的虚构数据。已有 Claude 实现已合入，不能把旧 Claude 分支当作尚未整合的新基线。

现有提交证据：**57 报告 / 878 选择器 / 59 负向检查**，18 行全部 partial，B4/B5 false。最后产品的有效检查包括前端 58/58、host 35 + Core 3、fmt/clippy、严格 TS/前端构建、原生与未签名 NSIS 构建、安装包 26/26、Memory/domain 守卫 8/7 负向、原生设置边界 20/20、独立实际操作/Core 隔离 35/35。数量含重叠，不能称完整验收。

先读 `AGENTS.md`、Architecture v0.3、ADR-025/028/030/031、[Memory integration v1](MEMORY_INTEGRATION_v1.md)、[汇总验证](validation/Activity-unified-2026-10-08.md)、[B4 覆盖](validation/B4-coverage.md)、[证据索引](validation/B4/coverage.json)、[最后产品证据](validation/Activity-saved-choice-boundary-2026-10-10.md)。Claude 交接保留更详细的历史、二进制哈希和忽略目录记录。

## 共同基线与工作树

首次并行续作固定从**同时包含两份交接的文档提交**分出两个独立分支。用下面的只读查询找出新增本文的提交，核对它含两份文档、`a289e18` 是祖先，并记录完整 SHA；不要分别从不断变化的分支 HEAD 开始。

```text
git log --diff-filter=A --format=%H -- docs/ACTIVITY_CODEX_NEXT_SESSION_2026-10-10.md
```

建议分支名 `codex/activity-desktop-followup` 和 `claude/activity-producer-followup`，只是计划，尚未创建。启动前检查名称/目录归属；有适合此续作且干净、无人实施的工作树才可复用，否则建立新工作树。在 Codex 新会话中选 Worktree，以整合分支中上述提交为起点，再建立独立分支；如果 UI 只能选分支，创建后先核对 HEAD 与固定基线，避免静默使用默认 main。

当前已存在且必须保留：

| 工作区 | 本次检查的分支/HEAD | 处理 |
| --- | --- | --- |
| `E:\Enouia Runtime` | `codex/activity-desktop-integration` / `70b7dc5`（随后有本文提交） | 最终整合入口；下一次 Codex 核对无人实施后才在这里汇合 |
| `E:\Enouia Runtime\.claude\worktrees\moriium-activity-usage-runtime-4bc09f` | `claude/moriium-activity-usage-runtime-4bc09f` / `7309cb9` | 旧工作树，保留，不重置/强行搬到新基线 |
| `C:\Users\Morii\.codex\worktrees\e8f6\Enouia Runtime` | detached / `29401fe` | 其他会话工作树，保留 |

主工作区还有用户未跟踪的 `docs/ACTIVITY_USAGE_CLAUDE_HANDOFF.md`、`docs/prompts/CLAUDE_ACTIVITY_USAGE_START.md`。不覆盖、不暂存，也不推断它们会出现在新工作树中。main 本次为 `29401fe318f457af5f33ee84620ee276921a69f3`；不切换/重写它。

工作树分别拥有源码与工作区，仍共享 Git refs、对象库与 stash；参见 [Codex 官方工作树说明](https://learn.chatgpt.com/docs/environments/git-worktrees)。每个分支只供一个实施会话使用；不 force push、不共享 stash、不操作别人的分支或清理别人的工作树。依赖、`dist`、`target` 与忽略的记录 helper 不保证复制：在各自工作树准备依赖/构建，保持独立输出，不能指向另一个任务的 `target` 或替换其正在使用的二进制。UCRT64 优先的 Rust 1.98.1 GNU 工具链通过本进程环境设置；缓存可用时离线构建，不改变系统环境。

## 谁负责哪些文件

| 负责人 | 实施范围 | 首个候选切片 |
| --- | --- | --- |
| Claude | `crates/enouia-activity/`、`crates/enouia-activity-store/`、`crates/enouia-activity-runner/`；新 `scripts/claude-activity-*`、`docs/validation/Activity-claude-*` | 对照现有测试/C12/C17，找一个尚未覆盖的晚期写入或 generation 恢复边界，在独立临时目录复现并按需修复 |
| 下一次 Codex | `apps/desktop/src/`、`apps/desktop/src-tauri/src/activity.rs`、`apps/desktop/e2e/`；桌面侧新验证文件 | 实际保存选择文件的 Windows 共享读取拒绝与释放后恢复；只用新的合成设置，不动个人配置 |
| 下一次 Codex，汇合时串行处理 | 公共 `scripts/check-activity-evidence.mjs`、现有共享验收 helper、`docs/validation/B4/coverage.json`、B4/汇总文档、根 workspace manifest/lock、两份交接、PR #28 | 汇合各自已推送的切片，核对新二进制和报告后统一维护索引/计数/PR |

这些是待研究边界，不是已确认缺陷。先查看已有测试和报告；若已经覆盖或无实际缺口，记录结论与下一项具体候选，不凭猜测修改、不重复验收凑数。Codex 不进入生产器侧实现；Claude 不进入桌面侧实现。发现跨边界问题，提交复现、关联 SHA 和修改建议，由对应负责人实施；根 manifest/lock 或协议变更先协调，不能让两个工作树独立改变同一公共契约。

## 并行验收与汇合

代码/独立构建可并行。原生 UIA/CDP、全局快捷键、单实例窗口、Windows 定时任务验收应错开，由 Codex 统一安排；Claude 首个切片只跑独立 store/runner 夹具。每项使用自己明确拥有的临时数据、安装包、设置目录、WebView profile、端口和进程，检查 PID/监听器归属。不能占用另一任务窗口、修改已存在定时任务、复用个人 Vault 或改变全局环境；不绕过 foreground-PID hotkey guard。

Claude 每个切片验证后独立 commit/push 自己分支，交付：完整基线 SHA、工作树/分支、提交及远端 SHA、文件清单、检查命令/结果、哪些实际执行/哪些复用、原始失败和成功报告/哈希、剩余门槛。新原始报告用自己的前缀，旧报告保持不可覆盖；由 Codex 后续接入公共索引，worker 不提前增加公共计数。只有经过核对的报告才能成为新的已提交证据。

Codex 自己的每个功能同样验证、commit、push。接收 Claude 切片后先检查范围/祖先/冲突，再在无人实施的整合工作区串行汇合可审查的提交；保留作者与原有 trailer，避免把整个旧 Claude 分支再次合入。若从 worker 分支 cherry-pick，记录原提交与整合提交的对应 SHA。汇合后按受影响范围重新检查，产品变化需要新的相关实际操作验证；不把旧二进制证据算在新产品上。最后统一更新索引、哈希、汇总与现有 draft PR #28，不合并 main。

Codex 有实质贡献的提交使用精确 trailer：

```text
Co-authored-by: Codex <267193182+codex@users.noreply.github.com>
```

桌面改动执行 Memory integration v1 的受影响检查，包括 `node scripts/check-memory-integration.mjs`。证据检查入口为 `node scripts/check-activity-evidence.mjs --self-test`。忽略目录的 `target/record-*.mjs` 已执行，不重新执行以重复追加/覆盖记录；新工作树不能假设这些 helper 存在。原始 JSON 统一 LF 后哈希，核对提交内实际字节。

## 范围与额度

Activity 公开源只有 github/codex/claude，不合并 AI 总量、不改变单位/日边界。Memory/Context/Sessions/Core/Provider/云属于 Enouia Memory；Runtime pin 保持 `ff692ccb6fbc1c387254d5ffbef41b105eeb2a84`，不升级、不延伸冻结的 Runtime Memory crates。新 tray/login/installer 集成切片需要 owner 单独要求。

本次续作仅授权本地合成实施/验收：不触碰个人档案/Vault/凭据，不启用真实账户采集、生产上传/调度、种子切换，不修改 Moriium checkout、不部署服务器。临时 Vault 必须通过实际 Core picker/命令建立；不直接改规范文件。ACL 验收只使用新合成对象、保存/恢复完整 SDDL 并比较；helper 有限时退出，Temp 默认保留。B4/J1 partial、B5 false；真实登录/电源/电池、磁盘满/断电、持续压力、真实远端收据/发布观察保持未验证门槛。

文档更新时 Codex 5 小时窗口使用 72%，剩余 28%；这个账户用量快照不代表下一次会话可用额度，也不是 Claude 额度。开新 Codex 会话/工作树不重置账户限额。接手先查询当前限额与其他任务活动，动态留出验证、提交、推送、远端核对与交接余量；剩余额度不足时不启动新切片，安全收尾后更新交接。不擅自使用重置券。

## 可复制给下一次 Codex 的启动指令

```text
继续 Enouia Runtime 的 Activity 桌面接入与并行整合工作。
先在 E:\Enouia Runtime 完整阅读 docs/ACTIVITY_CODEX_NEXT_SESSION_2026-10-10.md、docs/ACTIVITY_CODEX_TO_CLAUDE_2026-10-10.md、AGENTS.md 和引用的最新证据。
查询当前账户额度、分支/dirty/untracked/工作树/远端和 draft PR #28。用 git log --diff-filter=A --format=%H -- docs/ACTIVITY_CODEX_NEXT_SESSION_2026-10-10.md 确定共同交接基线，核对两份文档及 a289e18 祖先，建立属于本会话的独立新工作树和 codex/ 分支；不要使用默认 main 或重置旧 Claude/e8f6 工作树。
Claude 负责 producer/store/runner；你负责桌面 host/surface/E2E 和最终证据/PR 汇合，不同时修改对方范围或公共契约。先审查实际保存选择文件共享读取失败/释放恢复是否已有覆盖，只在新合成设置中复现，按需修复、验证，每完成一个功能独立 commit 并 push，使用精确 Codex trailer。
原生验收与 Claude 错开；所有夹具、构建、profile、端口和进程独立并核验归属。旧 missing-runner/startup/busy/picker/bounded-read 切片均已完成，勿重做。收集 Claude 提交/原始报告后串行汇合，再按受影响范围验证、统一维护证据索引和现有 PR #28；当前基线为 57/878/59，18 行 partial，B4/B5 false。
保持 Memory pin/domain 和 github/codex/claude 三源边界，不接触个人数据、真实账户、生产上传/调度或服务器。共享额度接近耗尽时提前停止开新功能并更新两份交接，留足提交、推送和核对时间。
```
