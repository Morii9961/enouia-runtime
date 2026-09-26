# 用量数据更新交接：Moriium → Enouia Runtime

日期：2026-09-26。本文供独立项目 Enouia Runtime 接手关于页活动数据更新功能时使用。当前只更新了 Moriium 的构建快照并准备交接；Runtime 中的采集、调度和上传尚未由本文实现或启用。

公开版已脱敏个人统计、精确采集时间和本机路径；未脱敏原件保存在本地 Git 忽略目录。文中的 Moriium 源码相对链接属于历史交接引用，不是本仓库的运行依赖。

## 接手范围

关于页有 GitHub、Codex、Claude Code 三张活动日历。Moriium 的公开页面仍由 Astro 预渲染，Nginx 提供静态 HTML；构建时读取 [活动快照](../src/data/activity.json)。另有一条已实现、尚需单独部署验收的动态更新链路：本机采集日汇总，经受限 SSH 接收，由 VPS 发布为静态 JSON，浏览器按需刷新。它不经过作者后台的 `/api/status/`。

建议 Runtime 接手**本机的采集、持久归档、调度与上传**。Moriium 继续维护关于页展示、公开数据校验、接收与发布协议，直到两个项目另行约定并验证新的服务端归属。Runtime 是独立项目；不要让它在运行时依赖 Moriium 的仓库目录、构建过程或作者数据库。现有 Runtime 心跳 `runtime.json` 是另一项状态输入，不能代替活动批次。

迁移期间保留手动 `pnpm activity:refresh` 作为构建快照的更新方法。自动链路使用独立工作目录，不能与手动命令共写一个 `activity.json`。新旧自动任务也不能并行写同一份归档、序号或待发批次。

## 2026-09-26 已核对的基线

本次在本机运行 `pnpm activity:refresh`，三项均成功；仓库外档案副本与仓库快照的 SHA-256 一致。公开版已移除个人统计、精确采集时间和本机档案路径。未脱敏原件保留在本地、Git 忽略的私有目录；移交前仍须重新读取最新状态。

三项均未丢失旧日期。GitHub 有一个已有日期的贡献数发生修正，因此增量并不只来自新增日期。日期数指快照中实际有记录的天数，不等于范围内的自然日数；当天数据也可能尚未完整。该快照更新的是本地构建输入，不能据此声称线上页面已更新。

## 当前代码与数据流

| 职责 | Moriium 当前实现 |
| --- | --- |
| 三源采集与单源失败保留 | [`scripts/collect-activity.mjs`](../scripts/collect-activity.mjs) |
| 手动刷新、增量报告与仓库外归档 | [`scripts/refresh-activity.mjs`](../scripts/refresh-activity.mjs) |
| Codex app-server 读取和总量校验 | [`scripts/lib/codex-usage.ts`](../scripts/lib/codex-usage.ts) |
| Claude Code 日报转换、GitHub 贡献转换和旧日合并 | [`scripts/lib/activity-import.ts`](../scripts/lib/activity-import.ts) |
| 本机 Cowork task store 查找 | [`scripts/lib/cowork.ts`](../scripts/lib/cowork.ts) |
| 自动链路的本机锁、归档、序号、待发批次与 SSH 上传 | [`scripts/activity-sync.mjs`](../scripts/activity-sync.mjs) |
| 批次白名单、接收及静态发布 | [`scripts/lib/status-batch.mjs`](../scripts/lib/status-batch.mjs)、[`scripts/status-receive.mjs`](../scripts/status-receive.mjs)、[`scripts/status-publish.mjs`](../scripts/status-publish.mjs) |
| 公开数据结构和页面 | [`src/lib/activity.ts`](../src/lib/activity.ts)、[`src/components/AboutActivity.astro`](../src/components/AboutActivity.astro)、[`src/scripts/about-live.ts`](../src/scripts/about-live.ts) |

手动命令更新仓库中的 `src/data/activity.json` 并在仓库外归档，不提交、不上传、不构建。自动命令使用 `MORIIUM_ACTIVITY_WORK` 指向独立目录；首次从构建快照初始化，此后以该目录的 `activity.json` 为持续档案。它先重试原有 `pending.json`，再采集、增加 `sequence.json` 的序号、保存新待发批次并上传。其接收端与发布端的现有行为见 [ADR 0003](adr-0003-about-status.md) 和 [状态服务操作说明](status-operations.md)。这些文档描述实现与验收步骤，不证明生产调度已启用。

## 必须保持的数据契约

`ActivityData v1` 只有 `version: 1` 和固定的 `sources.github/codex/claude`。每个来源可为 `null`，否则只含 `updatedAt`、`timezone`、`metric`、`days: [{ date, value }]`。`value` 是非负安全整数；日期为真实的 `YYYY-MM-DD`，同一来源不能重复。公开序列化必须重建白名单，不能带入路径、标题、模型、费用、会话、凭据或原始报告。

| 来源 | 指标与边界 | 读取条件 |
| --- | --- | --- |
| GitHub | `contributions`，日期标签 `GitHub`；官方贡献日历一次最多查询一年 | 登录状态可用的 `gh` 或本机环境令牌；旧日汇总须保留 |
| Codex | 含缓存的账号级 `tokens`，日期标签 `Codex`，沿用服务端日界 | 本机 Codex app-server 的 `account/usage/read`；日桶之和须等于返回的 lifetime 总量 |
| Claude Code | 含缓存的 `tokens`，`Asia/Shanghai` 自然日 | 固定的 `ccusage@20.0.20` 离线日报；额外逐个读取本机 Cowork 私有 store |

Claude 的总量为非缓存输入、缓存读取、缓存写入和输出之和；reasoning 已包含在输出中，不能再加一次。Codex 与 Claude 的日界不同，不能合并日桶或把 Codex 日期重标为北京时间。远程 Cowork 不在本机日志里。不要用限额百分比、费用或非缓存 token 数替换这些热力图的单位。

本次采集发现 PATH 上的 `codex-cli 0.130.0` 对 `account/usage/read` 返回 JSON-RPC `-32600 unknown variant`；桌面应用自带的 `0.158.0-alpha.2` 可返回 `summary` 与 `dailyUsageBuckets`，并通过现有导入校验。本机通过 `MORIIUM_CODEX_CLI` 指向后者完成采集。Runtime 应在启动前检查它实际选用的 CLI 是否支持该方法；不要把当前带版本号的安装绝对路径固化进项目。凭据始终留给 CLI 自行管理，不从 `auth.json` 取 bearer token。

上游历史可能缩短。现有采集器把新日报与旧档案逐日合并，保留已知日期；`2026-01-01` 是 AI 档案地板，而 GitHub 当前一年查询窗可早于此日。迁移时应从**最新且完整**的本机持续档案或已验证副本初始化，逐来源核对旧日期与数值。不能仅用一次上游响应重建全部历史；不能因为没有当天记录就删去过去的日期。

自动上传沿用 `validateBatch` 的 v1 契约：`producer` 固定为 `morii-workstation`，`sequence` 是持久递增整数；`createdAt`、每源 `attemptedAt`、`result: success|failed` 与完整 `data` 一起发送。成功源的 `updatedAt` 必须等于尝试时间；失败源保留旧快照与旧成功时间。零新增也算采集成功。接收端拒绝旧序号，发布端拒绝丢失旧日期或倒退采集时间。若 Runtime 要更改生产者名、协议版本或服务端归属，须先同步修改并验收 Moriium 接收端，不能单边切换。

## Runtime 接手顺序

1. 在 Runtime 项目中明确运行位置：Claude Code 与本机 Cowork 需要这台 Windows 电脑上的日志，所以即使 Runtime 的主服务部署在别处，也需要本机采集执行点。记录 Node、Codex CLI、固定 ccusage 和 GitHub CLI 的实际路径与登录会话条件；不要复制任何登录文件到服务器。
2. 盘点当前自动工作目录、仓库快照及仓库外归档，选取日期最全的有效 `ActivityData v1`。同时保存旧任务的 `sequence.json`、`pending.json` 和完整档案。若已有待发批次，先按原序号送达或明确协调接收端处理，再切换写入者；不能把序号归零。
3. 在 Runtime 中实现或移植三源采集、严格转换、档案合并、失败保留、互斥、原批次重试、原子写入及受限 SSH 上传。只发送日汇总；本机日志、原始响应、项目路径与认证材料留在本机。现有 Windows 注册脚本可作调度行为参考，不能直接把 Moriium 仓库当 Runtime 的运行依赖。
4. 用隔离工作目录和接收端跑对照验收：逐日比较旧、新档案；模拟单源失败、零新增、网络中断后重试、旧序号、丢失历史日、时间倒退、Codex 方法缺失；核对发布 JSON 的哈希和来源时间。确认公开关于页在无 JavaScript、作者 Node 停止时仍能读到构建快照，启用 JavaScript 后只读取静态状态文件。
5. 隔离验收通过后，先停用旧的 Windows 自动任务，保留其状态，再由 Runtime 接管。完成首次真实采集、上传、发布和三语关于页检查后，启用 Runtime 的定时任务并观察至少一次定时运行。确认新任务持续成功后，才考虑移除 Moriium 的旧自动采集入口。代码提交、发布与生产切换仍需分别按两个项目的流程处理。

## 验收判据与未定边界

交接完成至少需要：三源报告均符合白名单；历史日期不减少；Codex 与 Claude 的单位和日界不变；失败来源不伪装成新鲜数据；序号单调、待发批次可重试；私有状态与凭据不进入公开文件；公开页面仍是静态读取路径；旧任务与新任务没有并发写入。Moriium 的相关回归测试在 [`tests/activity.test.mjs`](../tests/activity.test.mjs) 与 [`tests/status.test.mjs`](../tests/status.test.mjs)。

需要在 Runtime 项目立项时定下的边界：Runtime 只接手本机生产者，还是连 VPS 的接收与发布也接手。本文按前者描述可直接实施的最小迁移；若选后者，先设计版本化协议、公开路径与回滚方案，再修改 Moriium 的消费者。当前工作没有创建 Runtime 仓库或进程，也没有注册任务、上传批次或部署页面。
