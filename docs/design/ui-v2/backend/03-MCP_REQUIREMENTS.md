# 03 · Enouia Memory MCP 要满足的前端要求

日期：2026-10-26。写给正在做 Enouia Memory MCP 的会话与 Morii。范围不只是初始化：日常 Agent（Claude、Codex 等）通过 MCP 读写记忆，产出的数据必须和初始化一样完整，UI v2 的视图才能一直接着真实数据。

上游：[01 缺口报告](01-BACKEND_GAPS.md) 的 G12、G22；字段定义见 [02 初始化要求](02-MEMORY_INIT_REQUIREMENTS.md)。本文件不改变进行中的 MCP-Resume-1（原生准入与本地传输）的范围，它是那一片之后几片的需求。

## 0. 现状（只读核对）

| 项 | 现在 | 证据 |
| --- | --- | --- |
| 工具 | 六个：`memory_search`、`memory_read`、`memory_source`、`context_get`、`memory_propose`、`session_checkpoint`；`memory_update` 是未广告的旧别名 | Memory `main` `c9bf1be`：`crates/enouia-memory-host/src/mcp/mod.rs`、`contracts/ipc/memory-v1.schema.json` |
| 协议 | MCP `2025-11-25`，受限 stdio / JSON-RPC；结果带 `structuredContent`，`tools/list` 不声明 `outputSchema` | 同上 |
| 写入 | `memory_propose`：Agent 自己写 `proposedContent`、`proposedType`（六种旧类型）、`evidence`（来源 ID + 范围）、`reason`，产生**待定提议**；`session_checkpoint`：摘要、决定、未完成事项，产生**临时检查点** | `memory-v1.schema.json` 的 `request_memory_propose`、`request_session_checkpoint` |
| 格式 | 只服务 schema-1 / `host-current-v2`；遇到 schema-2 / `automation-host-v2` 在解码前拒绝；「V2 Agent reader/writer」明确延后 | 分支 `codex/mcp-native-agent`（未提交）的 `docs/contracts/MCP_NATIVE_AGENT_V1.md` 格式矩阵、`docs/adr/092-native-agent-local-transport.md` |
| 进行中 | MCP-Resume-1：外部 Agent 原生登记、本地管道、六工具保持原义 | `docs/handoff/MCP_RESUMPTION_2026-10-25.md` |

**后果**：重新初始化之后，新库是自动化格式；Agent 的日常对话既读不到新库，也写不进自动形成。UI v2 会停在初始化那一刻（01 G12）。

## 1. 原则

1. **MCP 是采集与召回的门，不是第二条形成管线。** Agent 交来的是原始材料（对话轮次）和可选的提示；记忆由 System 管线形成，和初始化同一套规则（02 §0）。这样日常记录与初始化记录字段一致，界面不必区分。
2. **Agent 的话永远是 Agent 的话。** 原生登记的 Agent 身份进入来源（`agent_submission` 或 `model_claim`）；Agent 自称「用户同意了」不能变成主人确认（ADR-092 已写明）。Morii 在对话里亲口说的话，以原句作为 `user_statement` 来源，由 System 判断。
3. **主人动作不经过 MCP。** 纠正、撤回、遗忘、保护的**提交**只在 Runtime 里由 Morii 确认；MCP 最多提交「请求」，由 System 暂时隐藏（可逆），等 Morii 在 Runtime 里决定。
4. **读取不强化。** 检索、阅读、召回各自记账，不提高注意力或真假（参考 Ombre-Brain 当前 main 把搜索与强化分开：`tools/breath/search.py` 不 touch，强化只在 `trace/_reinforce.py` 显式发生）。
5. **输出与界面同义。** 工具返回的状态词与 UI 一致：「主体说过 X」不写成「X 是事实」，暂存的假说不写成已采用；返回里带 ID，能在 Runtime 里打开同一条。

## 2. 开源项目怎么做（核对过的版本）

| 项目（固定提交） | 写入时 Agent 给什么 | 服务端自己做什么 | 值得学 | 不学 |
| --- | --- | --- | --- | --- |
| OmbreBrain-folio `bf6887575fa8` | `hold(content, tags, importance, pinned, feel, source_bucket, valence, arousal, event_time)`；`grow(content, event_time)` 长文拆分 | 模型打标：`domain`、`valence`、`arousal`、`tags`、`suggested_name`（标题）；近似桶自动合并；`families.py` 派生「家族」层，整体可重算，主人改名 / 钉住 / 解散按 Jaccard ≥ 0.5 继承 | 标题在形成时产出；派生层可重算且继承主人编辑 | `event_time` 只是一个 ISO 字符串，日期会变成当天零点，丢了精度；查询命中就 touch，自我强化 |
| Ombre-Brain `115d831d979b` | 16 个工具；`hold` 多了 `title`、`why_remembered`（≤ 500）、`meaning`、`media`；`grow` 可直接传已拆好的 `items`，且只在用户明确要求时调用；独立的 `plan`（承诺，带状态与重量）、`letter_*`（原文永久保存）、`anchor`（上限 24）、`I`（自我认知候选，可 supersede） | 写入后自动建关系：向量相似 ≥ 0.72 才建，只建 `related_to` / `same_event` / `continuation_of`，**因果从不自动建**；每桶上限 8；建不出来不影响写入 | 计划、信件、自我认知分层；自动关系只作提示且有上限 | 自动关系直接写进桶的元数据，与事实混在一起；按年龄自动 resolved |
| MemoryConstellations `9ad9825910bb` | 模型只能**提议**类型化动作，宿主模块才写权威状态 | `memory_claims`：`domain`（含 `user_statement`、`inference`、`fiction`、`third_party`）、`temporal_state`（planned / in_progress / completed / cancelled / historical）、`event_from` / `event_until` / `time_precision`、`subject_entity_id`；来源表存逐字引文与说话人，引文不在原消息里就报 `memory_quote_not_exact`；live 作业优先级 100，backfill -1 | 逐字引文校验、时间精度、虚构领域、日常优先于回填 | 旧路径的自然遗忘会清空正文 |
| Latent-memory `835250d080c0`（许可只允许内部使用，只学概念） | `latent_append(text, current_state 必填, facts[{fact, tag, kind: event/state, event_date 拿不准就省略}], indexEvidence[{type, quote}])`；`mode: preflight` 只校验不写盘；`latent_supersede` 与 `latent_correct` 分开；`latent_session_start`、`latent_unresolved`、`latent_thread_close` | 服务端在原文里定位引文，容忍空白、全半角与引号差异 | 预检模式；替代与纠正分开；会话开场与未竟事项 | — |
| Graphiti MCP `5c27edfa8d3e` | `add_memory(name, episode_body, source, source_description, reference_time, …)`；立即返回，后台处理，同一 `group_id` 顺序处理 | 双时间：边有 `valid_at` / `invalid_at`（事实时间）与 `expired_at`（系统时间）；边记住来自哪些 episode；失效而不是删除 | 异步摄入 + 顺序；每条事实能追回原始 episode；失效不删除 | 由服务端模型直接抽实体与关系并发布，没有准入层 |
| 官方 memory server `ef9808f71090` | `create_entities`、`create_relations`、`add_observations`、三个 `delete_*`、`read_graph`、`search_nodes`、`open_nodes` | 无模型；每个工具声明 `outputSchema` 与 `readOnlyHint` / `destructiveHint` | 工具注解与结构化输出 | `read_graph` 一次返回全图，没有授权与规模控制 |

共同的教训：

- **只有 MCP 不等于会被记住。** folio 依赖 Agent 主动调 `hold`，SessionStart hook 只做召回不做巩固（Memory `06-automation-and-ombre-migration.md` §2）。日常要可靠，必须有宿主级的采集（Runtime 或 Agent 宿主的 hook 把对话轮次交给 Memory），不能全靠模型自觉。
- **形成时就把标题、时间精度、实体、引文定位做掉。** 事后补要重跑历史。
- **自动关系只当提示**，有上限、有算法版本，因果关系不自动建。

## 3. 需要的工具面（新格式）

名字是建议，具体 wire 形状按 Memory 的 ADR。每个写工具都有 `mode: "write" | "preflight"`，`preflight` 只校验并返回会发生什么，不写（学 Latent）。全部工具声明 `outputSchema`，并带 MCP 工具注解（`readOnlyHint`、`destructiveHint`、`idempotentHint`）。

### 3.1 采集（日常最重要的一条）

| 工具 | Agent 给什么 | 服务端做什么 | 产出 |
| --- | --- | --- | --- |
| `conversation_capture` | 对话 ID（Agent 宿主的）、平台与客户端名（以原生登记为准，不信 `clientInfo`）、若干轮：消息 ID、父消息、说话人、原文、发生时间与时区、助手所用模型、附件元数据；幂等键 | 存为来源（02 §3 全部字段），排入 `live` 形成队列，异步返回作业回执 | 来源 ID、作业 ID；以后可查形成结果 |
| `memory_note`（取代 `memory_propose` 的新格式用法） | 想让系统记住的一句话 + 提示：`title`、`event_time {from, until, precision, bound, tz}`、`entities[]`、`why`、引文 `quote`（指向已采集的轮次） | 校验引文能在来源里定位；作为 `agent_submission` 来源 + 提示进入同一形成管线；System 决定是否形成、怎样定类型与时间 | 作业回执；最终的记忆 ID 或暂存原因 |
| `session_checkpoint`（保持） | 现有字段 | 仍是临时检查点；新格式下作为 `summary` 类来源，不当作独立证据 | 检查点 ID |

要点：

- Agent 给的提示（标题、时间、实体）**是提示，不是结论**。System 用同一个模型和规则形成，提示与最终值不同时两个都留（提示存在 Agent 来源里）。
- 引文必须能在已采集的轮次里定位，否则拒绝（学 MemoryConstellations）；容忍空白与全半角差异（学 Latent）。
- 采集是异步的：立即返回作业 ID，同一对话顺序处理（学 Graphiti）；结果未知时保留原包与幂等键，不自动重发（现有 MCP 语义）。
- 时间：Agent 只传它从对话里知道的；拿不准就不传（学 Latent 的 `event_date`）。时区缺失时用 Morii 的默认时区，并在 `basis` 里写明。

### 3.2 纠正与请求

| 工具 | 用途 | 规则 |
| --- | --- | --- |
| `memory_correction_report` | Morii 在对话里说「你记错了」 | 必须带 Morii 原句的引文；System 以 `user_statement` 来源形成纠正修订。只有 Agent 自己的判断时，只能作为 `agent_submission` 暂存 |
| `memory_forget_request` | Morii 在对话里说「把这个忘掉」 | 记录为请求；System 可立即把目标从召回中隐藏（可逆）；真正删除只在 Runtime 由 Morii 确认（01 G08） |
| `memory_supersede_report` | 旧事实当时为真、后来变了 | 与纠正分开（学 Latent）；形成 `change = update` 的新修订，旧修订历史可查 |

### 3.3 召回与读取（读新格式）

| 工具 | 要返回什么 | 对应界面 |
| --- | --- | --- |
| `memory_recall`（新格式下 `context_get` 的后继） | 情境召回结果：每条的 ID、标题、内容、知识 / 采用措辞、事件时间（含精度）、实体、证据引文；完整 trace 与覆盖说明 | Context 表面与 Recall lab 显示**同一份** trace（01 G22） |
| `memory_search` | 文字 + 与界面相同的筛选（种类、状态、主题、实体、项目、时间窗与轴）+ 计数 | 记忆格筛选、Quick Search |
| `memory_read` | 详情：当前修订、历史、来源、带类型的邻居 | Inspector |
| `memory_source` | 来源原文片段（有上限） | 来源抽屉 |
| `memory_related` | 带类型的边（事实边与建议边分开，建议边带算法） | Constellation、星图 |
| `session_start` | 会话开场：未完成事项、当前状态、最近的纠正（学 Latent 的 `latent_session_start`） | — |

读取规则沿用 Core-7：先授权再计数，隐藏条目不泄露；**不改变注意力**（读取与强化分开记账）。

### 3.4 资源与通知（可选，后做）

- 用 MCP 资源链接给出能在 Runtime 打开的记忆 ID（例如 `enouia-memory://memory/<id>`），让 Agent 的回答里引用的记忆能被 Morii 点开。
- 形成完成后可发 `notifications/resources/updated`；不是必需，Runtime 用 01 G13 的变更游标即可。

## 4. 字段：谁给，谁定

| 字段（02 文档） | Agent 能给 | System 决定 | 说明 |
| --- | --- | --- | --- |
| 对话 ID、消息 ID、父消息、说话人、原文、发生时间、时区、助手模型 | ✓（来自宿主） | 校验 | 采集层事实，Agent 宿主最清楚 |
| 客户端 / Agent 身份 | ✗ | ✓（原生登记） | 不从 `clientInfo` 或参数取 |
| `title` | 提示 | ✓ | 与内容同修订 |
| `kind`、`occurrence`、`state`、`change`、`conditions` | 提示 | ✓ | 计划不当经历，取消不当完成 |
| `event_time` / `valid_time`（含 `precision`、`bound`、`tz`、`basis`） | 提示 | ✓ | 拿不准就不给 |
| `entities[]` | 提示 | ✓ | 合并只由证据或 Morii 决定 |
| `content_lang` | — | ✓ | — |
| 证据引文 | ✓（必须可定位） | 校验 | — |
| `knowledge`、`adoption` | ✗ | ✓ | Agent 不能把自己的话升成「主体说过」 |
| 附注（`formation_note`、`suggested_tags`、`tone`、`importance_guess`） | 提示 | ✓（形成时产出） | 附注不是事实 |
| 主人动作 | ✗ | ✗（只有 Morii 在 Runtime） | — |

## 5. 日常运行的要求

1. **采集可靠。** 每轮对话由 Agent 宿主或 Runtime 交给 `conversation_capture`（hook 或宿主集成），不是由模型决定要不要记。Agent 主动调 `memory_note` 只是额外提示。
2. **形成延迟。** `live` 队列优先于 `backfill`；目标是 Morii 在 Runtime 里几分钟内能在 Formation 看到这轮对话形成或暂存了什么（具体数字由 Memory 测后定）。
3. **预算与外发。** 形成调用的模型走 Core-4 的持续策略；没有可用策略时作业暂停并保留状态，不伪造点击。
4. **身份与时区。** 客户端身份来自原生登记；Morii 的默认时区在 Memory 设置里，Agent 只能提示。
5. **幂等与未知结果。** 沿用现有语义：同一请求同一键；响应丢失时 `outcome_unknown`，不自动重连或换键。
6. **删除与撤回传播。** 被删或撤回的记忆不再出现在任何召回、检索、关系与计数里，包括已经发给 Agent 的旧结果之后的新调用。
7. **不读 Activity / Usage。** 形成与召回不以 Runtime 的活动或用量数据为输入。

## 6. 验收

用一组合成对话（含 Memory `04-evaluation-and-backfill.md` 的 S01–S32 中与日常有关的场景），走真实本地 MCP 传输：

| 检查 | 要求 |
| --- | --- |
| 字段一致 | 经 MCP 形成的记录与初始化形成的记录，02 §9 的每项覆盖率相同 |
| 不伪造 | Agent 声称「用户同意」（S26）仍是 `agent_submission`；Agent 不能产生主人动作 |
| 引文 | 引文定位不到时拒绝；全半角 / 空白差异能定位 |
| 时间 | 「前阵子」保持未知（S08）；「三月」与「整个三月」不同 |
| 读取不强化 | 同一条被检索 100 次，注意力不变（S15） |
| 预检 | `preflight` 前后库内容逐字节相同 |
| 界面 | Runtime 读同一根，Formation 能看到经 MCP 形成的事件；Inspector 能跳回对话轮次 |
| 格式拒绝 | 旧客户端遇到新根仍在解码前拒绝 |

## 7. 建议的分片（MCP-Resume-1 之后）

1. **MCP-2 新格式只读**：`memory_search` / `memory_read` / `memory_source` / `memory_related` / `memory_recall` 读自动化根，策略与 Core-7 一致。
2. **MCP-3 采集进形成管线**：`conversation_capture` 与 `memory_note`，接 02 的字段与 `live` 队列。
3. **MCP-4 纠正与请求**：`memory_correction_report`、`memory_supersede_report`、`memory_forget_request`。
4. **MCP-5 开场与资源**：`session_start`、资源链接、可选通知。

每片在新建的合成根上验证，不安装或修改真实 MCP 客户端配置，不打开私人 Vault；真实客户端接入由 Morii 另行开始。
