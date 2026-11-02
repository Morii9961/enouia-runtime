# Activity / Usage 职责迁出与 UI 删除交接

日期：2026-10-25。状态：所有者已确定删除 Runtime 相关界面；Moriium 替代链路尚未实现或部署，旧后端尚未退役。

后续进展：Morii 已授权后端实施。Moriium 新拉取/静态发布后端已提交为草稿 PR [#30](https://github.com/Morii9961/Moriium/pull/30)；Runtime 桌面原生命令、宿主和权限退役已提交为草稿 PR [#100](https://github.com/Morii9961/enouia-runtime/pull/100)。前端、生产部署、自动提交和旧独立程序清理仍未完成。下文“本轮”的只读范围是前一轮调研记录，不是后续实现状态。

统计公式核对补充：tokens.ci 的 Codex 解析器已把 cache 从 input、reasoning 从 output 拆出，API 的五个 token 分类互斥，需要各加一次；不能直接套用原始 Codex 日志中的子集关系。本次真实接口与全历史总量守恒核对已通过。

## 本轮决定

Morii 明确选择：**一起移除 Runtime 的 Activity／私有用量界面，后端待迁移完成后清理。**

这更新了旧文档中“Activity & Usage 属于 Runtime 产品范围”的决定。本轮只准备迁移依据和 UI 删除提示词，不修改 Claude 正在进行的 UI 分支，不修改 Memory、Moriium 或 Dashboard 代码，不运行个人采集、提交或生产任务。

- Runtime UI 移除公开 Activity 和私有 Usage Ledger 的入口、页面及仅供它们使用的前端状态。
- GitHub 活动、公开 Codex / Claude 用量的展示与更新，目标上由 Moriium 自己负责。
- Runtime 原有采集器、独立程序包、归档、账本、上传与调度代码暂留；移除界面不代表停掉安装任务或删除数据。
- 本地账本的冲突审核、手动修正及 Dashboard 离线导出能力退出 Runtime 界面。tokens.ci 的公开统计不是这套私有审核能力的等价替代；本轮不改 Dashboard，也不承诺继续生成其 UsageSnapshot。
- Memory 的 Provider 配置、会话内 token / 请求限制、Memory 操作任务和 Windows 生命周期不在删除范围。

给 Claude 的独立提示词：[CLAUDE_REMOVE_ACTIVITY_USAGE_UI_2026-10-25.md](prompts/CLAUDE_REMOVE_ACTIVITY_USAGE_UI_2026-10-25.md)。

## 已核对的依据

### tokens.ci

已实际通过无登录的 HTTP 请求读取：

`https://tokens.ci/api/users/Morii9961`

2026-10-25 本次读取的响应包含：

- `clients`: `codex`、`claude`。
- `dateRange`: 2026-06-03 至 2026-10-25；`contributions` 有 86 个日期。
- `updatedAt`: `2026-10-25T06:40:15.325Z`，即上海时间 14:40:15。它是这次响应中的数据时间，不是持续更新已经验收的证据。
- 每日记录有 `date`、总量和客户端拆分；客户端下还有模型计量。可以为 Moriium 的两个日历取数，不需要抓取页面 HTML。

公开源码核对固定到 `missuo/tokens@496e1174d125ade19e2801393cebb1275621fa75`：

- [Profile API 路由](https://github.com/missuo/tokens/blob/496e1174d125ade19e2801393cebb1275621fa75/web/src/app/api/users/%5Busername%5D/route.ts) 与 [返回数据实现](https://github.com/missuo/tokens/blob/496e1174d125ade19e2801393cebb1275621fa75/web/src/lib/publicProfileData.ts)。默认 `period=all`；响应的图表区间不应被误当成所有历史的删除边界。接口当前可用，不代表有永久稳定的版本承诺。
- [设备日期分桶实现](https://github.com/missuo/tokens/blob/496e1174d125ade19e2801393cebb1275621fa75/cli/tokens-cli/src/timezone.rs)：设备按固定配置时区分桶。Profile 响应没有足够信息证明各设备都采用上海日界，不能直接沿用旧 `Codex` 或 `Asia/Shanghai` 标签。
- [官方说明](https://tokens.ci/docs) 与 [README](https://github.com/missuo/tokens/blob/496e1174d125ade19e2801393cebb1275621fa75/README.md)：CLI 读取客户端本地记录，汇总后提交。Windows 自动提交需要单独安排运行；仅注册账号、成功读取 API，均不能证明自动提交已配置。多设备要在相应数据所在设备或服务端运行提交器；本轮没有检查或配置这些提交任务。

该 API 当前账户公开，无需把 tokens.ci 登录令牌交给 Moriium。未来设为私有时，应明确处理不可用或另行配置服务端只读凭据，不能把令牌送入浏览器。

### Moriium 现有链路

只读检查了 `E:/Moriium` 的以下实现；仓库 HEAD 为 `15064c6`，`AGENTS.md` 和两个手动项目状态文件已有他人修改，本轮未更改：

- `scripts/collect-activity.mjs` 已从 GitHub 官方 GraphQL 日历读取贡献；Codex 走账户 app-server，Claude 走本地 ccusage / Cowork。
- `src/components/AboutActivity.astro` 从 `src/data/activity.json` 构建静态回退。
- `src/scripts/about-live.ts` 大约每分钟读取 `/status-data/current.json`，校验带哈希的 Activity 文件后更新日历。因此自动更新不必依赖每次重新部署页面。
- `scripts/status-publish.mjs`、`scripts/lib/status-batch.mjs` 及 `deploy/systemd/moriium-status.*` 已有独立发布链路，但旧 batch 校验固定 `producer=morii-workstation`，不能把新的服务端来源冒充成旧生产者。
- `src/lib/activity.ts` 的 ActivityData v1 固定三个来源和时区语义。切换用量来源需要修改这一契约及对应发布、渲染和文案，不能只把新数字塞进旧字段。

旧仓库公开快照：Codex 从 2026-05-12 开始，Claude 从 2026-07-02 开始；最后采集分别为 2026-10-18。新旧覆盖范围、统计方式与日期分桶都可能不同。

## Moriium 替代实现范围

目标链路：

```text
GitHub 官方贡献 API ────────────────────┐
                                       ├─ Moriium 服务端定时拉取、校验、保存
各设备 tokens 提交器 → tokens.ci API ───┘       → 静态 JSON 发布 → 关于页
```

建议沿用已有小时采集节奏，在 Moriium 部署侧增加独立定时拉取步骤，复用既有静态发布与关于页刷新机制。GitHub 凭据只放服务端；访客浏览器只读取 Moriium 同源静态数据。Runtime 不成为新的代理、配置中心或跳转页面。

实现时需要完成这些具体工作：

1. 在 Moriium 定义并冻结带来源和日界说明的新 Activity 契约，再同步类型、校验器、发布器、关于页和中日英文案。本文不预先发明 JSON 字段或改动 Dashboard UsageSnapshot。
2. GitHub 继续采用官方贡献日历查询，按年份分段读取并保留旧历史；不以公开 Events 列表代替完整贡献日历。
3. tokens.ci 按 `client=codex/claude` 拆分，校验日期、唯一性、完整性与安全整数。按固定源码实现校验客户端总量；不能把全客户端总量分别写入两个日历，也不能将 reasoning 再加进总量。金额若展示只能标明服务的估算，不能称为订阅账单或真实支出。
4. 旧 ActivityData 保留为独立、明确标注来源的历史快照；新来源采用独立版本。界面允许查看旧记录，但不把重叠日期相加、不取最大值，也不把不同来源拼接成一条未经说明的同口径曲线。旧 Codex 5 月数据不能因新来源缺失而被删掉。
5. 分别记录拉取尝试时间、上游更新时间和公开发布时间。拉取成功但上游未更新时，不把旧统计冒充为新采集；失败保留最近成功数据，标明过期或不可用，不写零覆盖。
6. 同一发布产物保持单一写入者；替代链路与旧 Windows 上传器不能同时更新同一公开状态。切换时核对现有已安装任务与 pending，不假定 B5 已启用或未启用，不自动删任务、receipt、账本或历史文件。
7. 保留静态/无 JS 回退与现有的哈希校验；公网链路仍由 Nginx 提供静态内容，不新增面向访客的鉴权 API 或 Node 页面依赖。

这份说明不是部署完成记录。Moriium 的代码、服务端计划任务、GitHub 服务端凭据和各设备 tokens 自动提交均尚未在本轮配置。

## 旧后端退役的完成条件

- 新适配器的字段映射、日期边界、修订/缩短历史、单源失败、上游过期与失败保留行为有受影响的检查。
- 完成真实公开 API → 服务端拉取 → 静态 JSON → 关于页的端到端核对，并实际观察一次无人手动触发的定时更新。
- 确认 tokens.ci 的各目标设备会自动提交，且覆盖需求已明确；不宣称覆盖未验证的 Cowork、远程或云端记录。
- 完成旧归档保留与来源切换说明，并核对旧写入者退出后没有双写。
- 此后再单独清理 Runtime Activity / Usage 后端代码、IPC、打包与运维入口；已安装任务及个人数据的停用/删除单独处理，不能由 UI 删除顺带执行。

## 本轮交付与验证

新增本说明及 Claude UI 删除提示词；完成公开 API 读取、固定官方源码核对、两仓库相关文件只读检查和文档引用检查。没有改应用源码、没有运行构建或测试套件，没有删除 UI 或后端，没有配置自动提交、调度或生产发布。
