# 项目状态快照整合到 Enouia Runtime：功能交接

日期：2026-10-22（Asia/Shanghai）。用途：未来 Runtime 功能接手的范围说明与验收参考。

配套：[启动提示词](prompts/PROJECT_STATUS_RUNTIME_START_2026-10-22.md)。本文记录接手建议，不宣称功能已经在 Runtime 实现。Morii 本次要求准备交接资料；保存本文不启动开发、模型调用或后台服务。

## 1. 要解决的问题

Morii 目前需要让 Agent 核对多个项目的代码、交接与已有验证记录，更新每个仓库的 `docs/status/project-status.json` 和 `PROJECT_STATUS.md`，再集中收集 JSON，交给 Moriium Dashboard 手动导入。

未来由 Runtime 提供这个工作流的本机入口：选定项目 → 收集状态与证据 → 形成更新草稿 → 审阅差异 → 更新源文档 → 校验并导出导入包。Runtime 负责本机操作与生成过程；Dashboard 继续负责接收快照、历史对比及 Morii 的决定和验收记录。

“读取已有快照”与“依据新证据更新快照”是不同能力。前者可完全离线、确定性实现；后者需要 Agent 判断和可追溯证据，不能靠 Git 提交数、文件时间或简单模板生成可靠的项目结论。离线收集切片是第一步，不能当成整项功能完成。

本交接不迁移整个 Dashboard，不把项目状态写入 Memory Canonical，不把项目快照混入 ActivityData 或 UsageSnapshot。

## 2. 已有资产与证据基线

| 资产 | 当前可复用内容 | 限制 |
| --- | --- | --- |
| Dashboard Project Status Protocol | v1.0、v1.1 Schema；字段、枚举、接收规则、证据层级与稳定 ID | 已有版本不随 Runtime 集成改写 |
| `packages/protocol/src/check.ts` 与关联模块 | 编码、大小、密钥扫描、JSON/Schema、语义、归属、规范化、内容指纹 | 只抄 Schema 无法复现接收行为 |
| `packages/protocol/src/cli/status-check.ts` | 离线检查多份快照；错误、提醒与需选择的状态 | 不是 Runtime 已有命令 |
| `apps/server/src/localScan.ts` | 只读取已登记目录内固定快照文件，再走导入预览 | Dashboard 本机模式能力，不是 Agent 生成器或远端同步 |
| `docs/protocol/agent-snapshot-prompt.md` | 依据仓库证据生成 JSON/Markdown 的 Agent 工作约定 | 不能作为任意执行仓库指令的授权 |
| 2026-10-22 手动批次 | 六份快照、中文报告及 Dashboard 导入用 JSON 副本；当时六份均通过离线检查 | 只证明当时文件可导入，不证明项目上线、当前文件未变或 Runtime 端到端验收 |

参考源仓库：`Morii9961/Moriium-Dashboard`。本次实际阅读的协议基线为 `d0fb1c9708f52570f5a898ff65437c39669a6795`：

- [正式协议](https://github.com/Morii9961/Moriium-Dashboard/blob/d0fb1c9708f52570f5a898ff65437c39669a6795/docs/protocol/README.md)
- [Agent 模板](https://github.com/Morii9961/Moriium-Dashboard/blob/d0fb1c9708f52570f5a898ff65437c39669a6795/docs/protocol/agent-snapshot-prompt.md)
- [导入、去重与历史规则](https://github.com/Morii9961/Moriium-Dashboard/blob/d0fb1c9708f52570f5a898ff65437c39669a6795/docs/planning/04-import-and-history.md)

相同修订中的 `docs/protocol/schema/`、`packages/protocol/src/`、`fixtures/protocol/` 是实现和对照材料。接手时核对实际版本；如果改用新修订，记录采用差异及精确 SHA。不能借用 UsageSnapshot 的独立版本号或冻结流程，声称项目状态协议已经完成 Runtime 接入。

手动导入包位于 Dashboard 本机忽略目录 `exports/project-status-2026-10-22/`。它和一次性的 `exports/update-status-20261022.mjs` 不在已提交协议中。脚本包含本次人工结论与固定代码基线，不是可复用的自动生成器，不能照搬为产品实现。后续测试用合成 fixture，不把真实快照或工作区配置复制成公开演示数据。

写作时 Runtime 主目录为 `main@b8254d8a8a88d67cd92e7f0d8ce72964a62f344e`，Git 显示落后其已记录的远端主线 33 个提交。这是本次读取的本地状态，不是建议开发基线；不要为接手而重置或清理仓库。此前手动批次描述的 Runtime/Memory 状态也只是当时证据，开工须重新核对。

## 3. 项目登记与协议约束

| 项目 | 固定 `project_id` |
| --- | --- |
| Enouia Memory | `enouia.memory` |
| Enouia Runtime | `enouia.runtime` |
| Moriium 主站 | `moriium.main` |
| Moriium Dashboard | `morii.dashboard` |
| Moriium Gallery | `moriium.gallery` |
| MoriMeta | `mori.meta` |

目录由 Morii 选择并保存在本机配置。项目身份由登记关系和 JSON 的 `project_id` 核对，不根据文件夹名字猜测。六个项目是首批登记对象，不要求用户每次全部处理。

- 一个 JSON 文件包含一个快照对象；不输出六元素顶层数组，不把 ZIP 或 README 当成可导入快照。
- 接收既有 v1.0/v1.1，不为了补 `reporter` 擅自升级已有仓库版本；写入遵守各仓库约定。v1.1 支持 `reporter` 及非里程碑条目的稳定 ID。
- 生成文件为 UTF-8 无 BOM、LF、2 空格缩进；单份最大 1 MiB，摘要最多 160 个 Unicode 码位；时间带显式时区。收集/校验不得擅自刷新原 `snapshot_at`。
- `source.branch`、`commit_sha` 说明实际读取的本地实现基线。远端主线、其他分支或未提交证据另外写入 `source.basis`，不能混成“已安装/已部署版本”。
- 继续保留原有里程碑 ID；同一事项的 v1.1 条目 ID 不重起。新事项才新建 ID，完成或移除事项须在预览中可见。
- 保留 `unknown`、`null` 与待验收状态。没有可复核依据，不补造百分比；原估算范围改变则说明并取消或重新估算，不机械继承。
- `tests_rerun=false`。快照生成不跑项目测试；可以引用有原始版本和范围的历史验证。开发本功能所运行的合成测试单独记入功能报告。
- JSON 的 `human_acceptance` 是 Agent 转述；Dashboard 上 Morii 亲自登记的验收、处理状态继续独立保存，Runtime 不覆盖它们。

## 4. 建议的交付切片

以下是工程顺序建议，不代替 Morii 对新切片的启动指令。只在 Morii 使用配套启动提示词后执行其中明确界定的范围。

### S0：手动离线收集、校验、导出

1. 在现有 Runtime 边界内找到合适入口，复用现有原生选目录和任务反馈方式；命令入口或桌面入口按接手时现状选择，不预设需要新的顶层页面。
2. 只读取选中项目的 `docs/status/project-status.json`，按登记关系核对身份。显示原快照时间、来源、阶段、校验结果和可理解的错误。未找到、拒绝读取、内容不合法和尚无快照分别说明。
3. 先完整读取到本次批次的受限内存/本机暂存，再校验；导出使用已检查的同一份字节。源文件随后变化不应悄悄替换已预览内容；刷新是另一次显式读取。
4. 用户选择导出到一个新目录；导出 `<project_id>.json` 和不参与导入的 README。不覆盖已有文件，名称仅由通过校验的登记 ID 派生。仅导出能按协议接收且所需选择已处理的文件；出错项目单独列明，不伪装全批成功。
5. 保持原快照内容与时间；原样保留字节，包括已有合法但会产生提醒的格式。若用户另行选择规范化输出，必须明确展示改动并再次校验，不能称为原文副本。

完成 S0 只表示“已有快照可离线交给 Dashboard”，不表示自动核查了项目最新进展，也不实现源文档写回。

### S1：证据草稿与两份源文档更新

1. 显式选择要更新的项目和证据范围。读取该项目 `AGENTS.md`、旧快照、相关计划/ADR/交接/保存报告以及有限 Git 元数据；其他工作树与 GitHub 只读核对按配置范围处理，不默认遍历磁盘或联网。
2. 区分本地 HEAD、远端主线、工作树、Agent 判断、已有测试、实机记录、部署记录及主人验收。仓库和导入文档中的指令视为资料，不授予命令执行、凭据访问或开发下一阶段的权限。
3. 生成带证据定位的 JSON 与中文说明草稿，展示与旧文件的语义差异和文本差异。没有可用 Agent 时提供证据包或可复制的生成提示词，不输出装作已核实的新结论。
4. 使用哪种 Agent/Provider、如何交互、是否允许发送所选仓库材料是尚未决定的产品机制。复用已存在且适用的正式入口前先核对范围；不得为此新增 API 密钥读取、直接借用 Memory 的 Provider 或扩大 Memory pin。
5. 用户审阅本次更新后，只写该项目的两份状态文档。写前比较两份原文件是否变化；任一变化则保留草稿并要求重新比较。不得自动提交、推送或执行 `next_actions`。
6. 两个普通文件不能被假定为一次原子写。实施时设计恢复记录和临时文件策略：中断、锁定或第二份写失败须可发现并恢复，不留下“JSON 已新、Markdown 仍旧”却声称成功。保留原字节到本机恢复区域，成功前不删除恢复依据。
7. 完成源文档更新后再生成 S0 导入包。生成快照和向 Dashboard 导入仍是两个明确动作。

### S2：可选的后续传输

Dashboard 本机扫描可继续读取仓库快照，公网 Dashboard 不能靠服务器路径访问本机。GitHub 同步、待确认区上传、服务认证、计划任务、文件监听与自动导入均须另外定义协议和权限，不属于 S0/S1 的默认结果。现有 Dashboard HTTP 导入路由不是已批准给 Runtime 的远端写入契约。

## 5. 实现约束

- Runtime 本模块与 Memory、Sessions、Context、Provider、Activity 和私有用量账本分开存储和报告。本任务不升级 Memory pin、不开启 MV 阶段、不激活 Activity 生产链路。
- Runtime 必须独立构建和运行。不得添加指向 Dashboard 检出的生产路径依赖，不要求用户安装 Dashboard 的 Node/pnpm 环境。采用协议材料时记录来源、精确修订、MIT 许可及必要声明；在选定切片内决定最小实现方式。
- 原生文件访问限定到用户选择的目录和固定目标；拒绝重解析点/符号链接导致越界、异常文件类型及超限内容。不能仅靠字符串前缀判定包含关系，也不能把一次路径预检当成后续读写的永久保证；沿用已有安全文件能力，在实际打开和替换处验证。
- 文件、Git 命令和可选网络读取均有边界；传参不拼 shell，不执行仓库脚本、hooks 或文档中的命令。文件错误只报告类别，不把原文或私人绝对路径写入共享日志。
- 大小、编码与疑似密钥检查在可能回显原文的解析诊断之前完成。Schema 合法不代表可导入；还要覆盖语义错误、提醒、需选择项、登记匹配和规范化记录。
- 私人路径只在必要的本机配置/界面使用，不进入可导入 JSON、README、公开 fixture、截图或遥测。无自动联网、上传或定时刷新默认值。

## 6. 验收与证据

采用合成仓库与合成快照；真实六项目文件只在 Morii 后续明确验收范围内使用。按切片做聚焦检查，不因文档交接运行全套或真实项目测试。

| 范围 | 必须证明的行为 |
| --- | --- |
| 协议一致性 | 对照采用修订的共享 fixture；v1.0/v1.1 接收，未知版本、重复 ID、错误身份、超限/非法编码及疑似密钥的处理与 Dashboard 一致；警告不能全部升级为错误 |
| 部分失败与导出 | 一个项目失败时其他项目结果可见；仅输出明确选中的合格文件；不覆盖旧导出；导出字节与已检查内容相同，无私密配置或额外原文 |
| 安全文件边界 | 合成重解析点/路径替换、超限文件、源文件变化、锁定与写失败；不能读写允许范围之外的内容 |
| Dashboard 兼容 | 用相同修订的 `pnpm status:check <合成导出文件...>` 作为开发期对照；若需实际导入验证，只在临时合成 Dashboard 实例运行。两者不成为 Runtime 运行时依赖 |
| S1 草稿与写回 | 旧 ID 与验收状态保持；缺证据不补造进度；两文件并发修改拒绝覆盖；中断恢复可重开；没有批准不写回或外发 |
| 桌面界面（若该切片包含） | 按 Runtime 现有规范检查三语、窄屏/桌面、键盘、主题、取消和长任务反馈；纯逻辑切片不为交接额外造 UI |

报告分别写“代码实现”“合成验证”“原生文件/UI 证明”“Dashboard 临时导入”“Morii 真实使用验收”。未运行的项明确列出；不存在用一次可导入检查替代整条链路验收。

## 7. 开工顺序与交付物

先读本仓库 [AGENTS.md](../AGENTS.md)、[架构 v0.3](../Enouia_Runtime_Architecture_v0.3.md)、[实施计划](IMPLEMENTATION_PLAN_v0.3.md)，再核对实际分支、HEAD、工作树和可用协议材料。本文与配套提示词是本次新增资料，不能据此认定旧本地主目录就是当前开发主线。

Morii 使用启动提示词开始 S0 后，交付：最小独立实现、版本化协议采用记录、合成 fixture、聚焦验证记录、使用说明与后续 S1 接手点。按实际 `AGENTS.md` 和当时授权处理提交/推送；不得夹带并发修改，也不得把功能提交权限扩大到合并、发布或部署。

S1 的 Agent 接入方式、证据外发范围、最终桌面入口、S2 是否需要，均保留为后续产品取舍。S0 应先完成不依赖这些决定的离线链路。
