# Claude 交接：Runtime 前端回归与验收边界

日期：2026-10-17（Asia/Shanghai）。仓库：`E:\Enouia Runtime`，远端 `Morii9961/enouia-runtime`。文档制作前已核实本地 `main` 与 `origin/main` 同为 `3e6f1614fd101efa700ef0a0855c9ad9cd8cc783`；这是代码及证据基线，不是随后文档提交的 SHA。接手时重新核对分支、HEAD、远端和工作区。

配套文件：[启动提示词](prompts/CLAUDE_RUNTIME_START_2026-10-17.md)、[中文状态](status/PROJECT_STATUS.md)、[Dashboard 标准导入 JSON](status/project-status.json)。Morii 最后要求完成手头工作后停止；本次交接不启动后台任务，也不自动把任务交给另一个聊天。只有 Morii 将提示词交给 Claude 后，Claude 才按其中的范围开始工作。

## 已完成并合并

本轮接续先确认并清理 PR #65，随后完成 #66、#67、#68。它们均已推送、实际合并到 main，并清理各自的本地/远端工作分支。

| PR | 结果 | 代码提交 / 合并提交 |
| --- | --- | --- |
| [#65](https://github.com/Morii9961/enouia-runtime/pull/65) | 已审阅记忆的来源读取、翻页、错误/Retry 焦点恢复；来源身份或可用性变化使旧意图失效 | `bc54ca5` / `3f6ce4a` |
| [#66](https://github.com/Morii9961/enouia-runtime/pull/66) | 关闭来源建议面板后返回 Suggest memories 入口，尊重已移走的焦点；不额外准备、发送或入队 | `78e2e5c` / `c0c19c9` |
| [#67](https://github.com/Morii9961/enouia-runtime/pull/67) | 候选冲突显式读取和 Retry 聚焦当前原文，Hide 返回 Read；身份和候选版本边界保持原样 | `3621462` / `a457d37` |
| [#68](https://github.com/Morii9961/enouia-runtime/pull/68) | 默认 DOM 门禁从 17 个扩展至全部 48 个既有模拟用例；修正两处旧测试等待方式并改善失败定位 | `70748a2` / `3e6f161` |

更早的导入别名校验、空候选编辑拒绝、Settings/Exit 观察、操作取消错误恢复、Sessions/Inbox 重试归属、保存的 Context 读取等已经在 main；先读当前代码和 [Memory integration v1](MEMORY_INTEGRATION_v1.md)，不要重复实现。老 `codex/activity-desktop-followup` 已通过 PR #39 处理，不应再次合并。

## 可复用的验证证据

- [默认 DOM 门禁报告](validation/Frontend-dom-regressions-v1.md)及其 [JSON 摘要](validation/Frontend-dom-regressions-v1.json)：98 项 Node/前端测试、48 个 DOM 用例共 677 项断言全部通过；两项修改过的用例严格类型检查、runner 语法和 diff 检查通过。Node 与 DOM 两个组成阶段分别跑过，未为凑次数重复其 npm 包装命令。
- 48 个用例涵盖实际组件的 Session 列表/详情/草稿/重试、Context/保存 Mock 读取、Provider 准备和发送回执恢复、来源建议入队/审阅路由、分页、身份与实际 `src/shell/QuickSearch.tsx`。每个独立进程，使用模拟 IPC/SDK；不是 48 次 Windows/浏览器验收。
- Quick Search 的 Escape 检查等待实际清空状态；Saved Context 等父级释放 disabled 状态再点击，保留原断言。默认门禁失败会注明用例，`--details` 输出断言细节及进度。
- `--settings-baseline` 和 `--operation-baseline` 诊断仍准确匹配各自历史失败清单；预期失败不能算产品通过。
- 最近产品代码构建见 [候选冲突报告](validation/Candidate-conflict-focus-v1.md)：普通无安装包的 release 构建成功（24.54 秒），Memory pin 检查八项负例、领域边界检查七项负例通过。随后 #68 只改测试及文档，产品源码/依赖未变，没有重复构建。
- 原生源码/依赖/pin 未变，原有 61 项 host、5 项固定 Core、严格 Clippy 与格式检查证据沿各报告引用复用；不要称为本轮新跑。旧 [2026-10-07 完整冒烟](validation/Desktop-stack-integration-2026-10-07.md)的 101/101 只属于其原版本，不能冒充当前完整原生复验。

本轮曾因自动审批服务用量限额而无法提交，该条命令未执行。后续普通用量恢复可用，重新通过审批后已完成提交、推送和合并；没有绕过审批或购买/消耗额度重置。所有原始临时开发输出位于忽略的 `apps/desktop/src-tauri/target/`，提交的报告才是可移交记录。

## 接手约束

1. 先读根 `AGENTS.md`、Architecture v0.3 的后续修订、[当前计划](IMPLEMENTATION_PLAN_v0.3.md)、[ADR register](adr/README.md)、Memory integration 和上述报告。旧 Architecture 中“尚无代码”等历史段落不代表当前状态。
2. Memory pin 仍是 `8186aed861af08cf7a2c5d8c912a24eae51b4d66`、workspace IPC v1 的 47 条命令。Memory、Context、Sessions、Vault、Provider 及云端领域由 `Morii9961/enouia-memory` 负责。Runtime 只处理现有适配器/前端；不延伸冻结的 Runtime 本地 Memory/Session/Context/Provider/Core-contract crates。
3. Activity & Usage 始终独立，不进入 Memory adapter、Vault 或模型上下文。J1/B4 仍为 partial，C01–C18 未签收，B5 未激活。合并、模拟测试和 SSH 传输成功均不等于真实发布/验收。
4. 不借交接授权读取个人 Vault、活动原始历史或凭据，不做真实 Provider HTTP、个人迁移、生产采集/上传/计划任务/部署。Memory pin、安装器、新 Windows 集成切片和真实验收需要 owner 单独指令；不把这些门槛作为自动下一步。
5. 交接前原有 `AGENTS.md` 修改、`docs/ACTIVITY_USAGE_CLAUDE_HANDOFF.md`、`docs/prompts/CLAUDE_ACTIVITY_USAGE_START.md` 是 owner 工作。保留它们，禁止 `git add .`。本次仅更新明确请求的两份 status 文件，旧 Activity 交接保持原样。旧 Activity 提示词的启动基线已过期，不能据此宣称当前缺少已完成代码。
6. 四个历史分支仍被其他 worktree 占用：`claude/activity-audit-scale`、`claude/activity-integration-work`、`claude/memory-mv7-provider-host`、`codex/activity-choice-atomic-save`。不强删、不切换、不清空其目录；重新检查 `git worktree list` 后再做任何整理。

## Claude 的下一步

先只读核对现状，简要说明目前实现与验收的差别。若 Morii 用启动提示词授权继续，从现有 Runtime 前端路线选择一个有证据的未完成缺陷；先复现，再修正并运行受影响门禁。不要为持续工作而制造重构或重复测试，也不要把真实验收缺口改写成“已完成”。若剩余项都需要个人数据、系统交互或生产授权，列出具体缺口后停在边界前。

默认验证：`npm --prefix apps/desktop test`、`npm --prefix apps/desktop run check`；产品变更按 Memory integration 执行相应桌面构建和 pin/领域检查。48 个 DOM 用例由 Node 内的 Happy DOM 执行，不需要浏览器服务。当前电脑使用工具曾无可用浏览器；后续应重新核实工具能力，不通过其他技术绕过浏览器工具约束。不要把 `src/memory/QuickSearch.tsx` 的未使用参考组件当成主窗口实际入口。

每个完成切片按仓库规则验证、明确提交文件、推送；Morii 要求 PR 最终合并并清理本次自己的分支。先核实远端 head、可合并状态及检查结果，合并后核实 main 包含该提交，再删除分支。贡献署名必须准确，按 `AGENTS.md` 只给实际有贡献的作者署名。文档快照单独整理，保持 `source.tests_rerun=false`，不得把历史或开发阶段证据写成快照阶段新跑。

真实 Provider、Windows/Narrator、签名/分发、物理启动/托盘、存储错误及长期个人工作流仍未获 Morii 验收，通用工具体验仍未知。下一阶段由 Morii 决定。
