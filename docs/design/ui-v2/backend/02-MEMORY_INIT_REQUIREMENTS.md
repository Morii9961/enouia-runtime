# 02 · 记忆库重新初始化的数据要求

日期：2026-10-26。写给负责重新初始化的 Memory 会话与 Morii。这是 Runtime 前端对新库**数据**的要求：初始化完成后，UI v2 的每个视图都能用真实数据画出来，不需要再迁移一次。怎样实现、用哪个模型、批次多大，由 Memory 按自己的阶段与 ADR 决定；真实样本、模型调用与外发都需要 Morii 另外授权。

上游：[01 缺口报告](01-BACKEND_GAPS.md)列出缺什么；本文件定**存什么**。[03 MCP 要求](03-MCP_REQUIREMENTS.md)要求日常写入产出同样的字段。

## 0. 三条总原则

1. **初始化与日常走同一条形成管线。** 导入历史对话和 Agent 日常对话，都先变成来源，再由同一个 System 管线形成记忆。初始化只是「一次跑很多来源」。这样初始化后的记录和以后每天新增的记录字段一致，界面不需要区分两种数据。
2. **三层分开存。**

   | 层 | 是什么 | 能不能改 | 例子 |
   | --- | --- | --- | --- |
   | 原件层 | 收到的原始字节与解析出的来源 | 不改；新导出产生新修订 | 聊天导出文件、每一条消息、附件 |
   | 记录层 | 有来源支持的陈述，以及 Morii 自己的动作 | 只追加新修订 | 记忆、实体、主人的纠正与保护 |
   | 投影层 | 由记录推算出来的东西 | 可整体删除重算，带算法与版本 | 主题成员、连线、时间桶、检索索引、注意力、统计 |

3. **冗余的规则：便宜且事后补不回来的，现在就存。** 能从原件重新推出的（主题、连线、计数）放投影，不必现在定死；但原件里的会话 ID、原时区、说话人、平台、助手用的模型、附件元数据，以及形成那一刻模型顺手能给出的东西（标题、语言、时间精度、实体、形成说明），一旦丢了就要重新跑一遍全部历史。宁可多存，标清楚是什么、谁产出的、哪个版本。

## 1. 初始化之前必须定下的事

| 决定 | 谁定 | 为什么现在定 |
| --- | --- | --- |
| §4 记录字段（标题、时间精度 / 含义 / 时区、实体、语言、证据位置、形成说明） | Memory ADR，Morii 确认 | `CORE5_FORMATION.md`：旧根不原地升级；写进真实数据后再改就是整库迁移 |
| §5 主人动作的记录形状 | 同上 | 前端的 Correct / Withdraw / Protect 要接它 |
| §3 会话与轮次记录 | 同上 | Sessions 表面与「跳回原句」要它（01 G14） |
| 导入哪些来源、能否交给哪个模型处理、能否外发 | Morii | 真实数据与外发要单独授权 |
| 默认时区（Morii 的生活时区，例如 `Asia/Shanghai`）与时区变化的记录方式 | Morii | 日界线、按天计数都依赖它 |
| 新旧库切换方式（旧库只读保留，新根独立） | Memory + Runtime 采用切片 | 01 G20 |

## 2. 输入：初始化读什么

Morii 选择范围；下面是每类来源必须保留的东西。没有的字段显式记 `null` 或 `unknown`，**不编造**（例如不用导入日期冒充消息时间）。

| 来源 | 必须保留 | 说明 |
| --- | --- | --- |
| 聊天平台导出（ChatGPT、Claude 等） | 原文件字节与哈希、平台名、账号别名（不存凭据）、对话 ID 与标题、每条消息 ID、父消息与分支、说话人、原始时间与时区、助手回答所用的模型名（导出里有就存）、附件元数据 | 一条消息一个来源修订；分支不能串成一条线 |
| Runtime 里发生过的会话（旧 Workspace Sessions） | 会话 ID、分支、事件序号、轮次 ID、事件种类、Provider 绑定、时间 | 已有 `SessionRecord` / `SessionEvent` 字段，照搬 |
| 旧 Enouia Vault（v1 Canonical、候选、审核记录） | 原记录与修订原样只读保留；主人审核过的条目作为「主人确认」类来源导入 | 不改写旧记录，不把旧候选批量当作已批准；旧审核是 Morii 真实做过的动作，可以作为证据 |
| OmbreBrain / folio 的记忆桶（如果 Morii 要导入） | 桶 ID、正文、`event_time`、`created`、标签、`domain`、效价 / 唤醒、`importance`、`pinned` / `protected`、`feel`、来源引用 | 桶是**另一个系统的派生结果**，只能作为 `agent_submission` 类来源，不能当成 Morii 的原话；它的标签与情绪值进入附注（§6），不进事实字段 |
| 文档、笔记 | 文件哈希、路径别名（不存个人绝对路径）、修改时间、作者 | 作者不明时标 `unknown` |
| 附件（图片、文件） | `AttachmentRecord`：原名、声明与检测到的类型、大小、哈希、可用性、敏感度 | 现有 v1 字段；OCR 文本是派生对象，标模型与版本 |

## 3. 来源层：每条消息存什么

现有 `contracts/memory/source-v1.schema.json` 已经很完整，新格式继续沿用（`storage-v2` 的 source = source-v1 记录 + 正文 ≤ 16 KB + 归属主体）。下表标出 UI v2 依赖、必须**真正填上**的字段，以及要新增的几项。

| 字段 | 现有 | UI 用在哪 | 要求 |
| --- | --- | --- | --- |
| `original_conversation_id`、`original_message_id` | ✓ | 跳回 Sessions、星图「同一段对话」 | 导出里有就必须填；Runtime 会话用会话 ID + 事件序号 |
| `parent_source_ids`、`branch_id` | ✓ | Sessions 的分支显示 | 不能把分支压平 |
| `locator` | ✓ | 高亮原句 | 能解析到具体消息和字符范围 |
| `original_time`、`original_timezone`、`occurred_at`、`time_precision` | ✓ | 时间线的「来源捕获」轴、日界线 | 原时区缺失时记 `null`，用 §1 的默认时区解释时要在 `basis` 里写明 |
| `captured_at` | ✓ | 覆盖日历「收到的材料」层 | 落盘时间，不当事件时间 |
| `speaker_role`、`author_label` | ✓ | 「主体说过」与「助手说过」的区分 | 必须区分 user / assistant / tool；角色是数据，不是权限 |
| `evidence_class` | ✓ | 知识状态的来由 | 助手的话是 `model_claim`，不能变成 `user_statement` |
| `import_id`、`raw_object_hash`、`parser_version`、`parse_warnings` | ✓ | 初始化报告、覆盖说明 | 解析警告进记录，不藏在日志里 |
| `sensitivity`、`access_policy_id` | ✓ | 遮挡、外发提示 | 导入默认 private |
| **对话记录**（新增，01 G14） | ✗ | Sessions 列表、对话标题 | 对话 ID、平台、标题、参与者、起止时间、轮次数、分支、来源导入批次 |
| **`assistant_model`**（新增，冗余） | ✗ | 「这句是哪个模型说的」 | 导出里有就存；以后判断旧回答的可信度用 |
| **`content_lang`**（新增，冗余） | ✗ | 排版与检索 | 每条来源的语言，便宜，存下 |

## 4. 记录层：一条记忆存什么

在 `formation-v2`（种类、发生、状态、变化、条件、事件时间、有效时间、反证、推导、回退）与 `automation-v2` 的准入输入（主体、项目、内容、解释、证据、上下文依赖、敏感度、策略与版本）之上，新增或改动的字段如下。「必需」= 形成时必须有值（可以是 `unknown`）。

### 4.1 身份、内容与标题

| 字段 | 类型 | 必需 | UI 用在哪 | 规则 |
| --- | --- | --- | --- | --- |
| `memory_id` | 稳定 ID | ✓ | URL、复制 ID、星图节点 | 对外显示后永不因重算投影而变 |
| `title` | 字符串，≤ 60 字符 | ✓ | 所有列表、时间线、星图标签、Inspector、Quick Search | 与 `content` 同来源、同语言、同修订；不出现内容里没有的信息 |
| `content` | 字符串，≤ 16 KB | ✓ | 详情正文 | **一条记录一个陈述**；多事件的段落在形成时拆开（01 G21） |
| `content_lang` | BCP 47 | ✓ | 中文排版、检索分词 | 混合语言时记主要语言 |
| `kind` | 现有九种 | ✓ | 种类筛选、星点形状 | 沿用 formation-v2：fact、preference、episode、project_state、plan、open_loop、relationship_experience、subjective_understanding、theme |

### 4.2 时间

`event_time` 与 `valid_time` 都改成同一个结构（现在只有 `{from, until}`）：

| 子字段 | 取值 | 含义 |
| --- | --- | --- |
| `from`、`until` | UTC 时间戳；`until` 可空 | 区间的两端 |
| `precision` | `instant` / `minute` / `hour` / `day` / `month` / `year` / `unknown` | 原话能确定到哪一级 |
| `bound` | `within` / `span` | `within`：发生在区间里的某处（「三月里的某天」）；`span`：持续整个区间（「整个三月都在搬家」） |
| `tz` | IANA 时区或 `null` | 解释日期用的时区，例如 `Asia/Shanghai` |
| `basis` | `stated` / `inferred` / `source_time` / `unknown` | 时间来自原话、模型推断，还是借用了消息时间 |

规则：「前阵子」这种说法保持 `unknown`，不用消息时间补（04 文档场景 S08）；借用消息时间时 `basis = source_time`，界面会画成虚线。`learned_at`（提交时间）与 `source_captured_at` 保持现状。**初始化批量形成的记录，学到的时间是初始化那一刻**，事件时间才是过去；时间线的「学到」轴会显示一个初始化尖峰，这是正常的，界面会标出来。

### 4.3 主体、参与者与实体

| 字段 | 类型 | 必需 | 规则 |
| --- | --- | --- | --- |
| `subject_id` | 现有 | ✓ | 「谁说的 / 关于谁」的主体 |
| `entities[]` | `{entity_id, role, evidence}` 列表 | ✓（可为空） | `role`：`subject` / `participant` / `mentioned` / `place` / `project` / `organization`；每项指向支持它的证据 |
| `project_id` | 现有 | — | 保留；与 `entities` 里的 project 一致 |

**实体记录**（新增）：`entity_id`、`type`（person / project / place / organization / thing / pet / work）、`display_name`、`aliases[]`（每个别名带来源）、`first_seen`、`last_seen`、`sensitivity`。合并两个实体是一条决定记录：有证据或 Morii 确认才合并，模型只能提出合并建议（投影）。同名不同人不自动合并（04 文档场景 S05）。虚构角色与真实人物同名时，`type` 或附注要能区分（参考 MemoryConstellations 的 `fiction` 领域）。

### 4.4 证据

现有 `evidenceRef`：`source_id`、`source_revision`、`locator`、`object_hash`、`evidence_class`、`supports`。要求：

- `locator` 必须能解析到**消息 + 字符范围**；
- 新增 `quote`（引文原文，≤ 500 字符）：形成时由服务端在来源里**定位**到原文后存下，定位不到就不能作为证据（参考 MemoryConstellations 的 `memory_quote_not_exact` 与 Latent 的「容忍空白与全半角差异再定位」）；
- 新增 `speaker`（从来源复制，冗余但便宜），让列表不必为每条证据回读来源。

### 4.5 状态与形成来由

| 字段 | 现有 | 规则 |
| --- | --- | --- |
| `knowledge`、`adoption`、`validity`、`attention` | ✓ | 沿用 Core-7 的含义与显示映射；`attention` 仍是投影 |
| `interpretation` | 在准入输入里 | 读取时也要返回（01 G19） |
| `formation` 来由 | 部分 | `system_actor`、`rule_version`、`producer_version`、`model_version`，**新增** `prompt_version`、`import_batch_id`（初始化批次）、`mode`（`backfill` / `live`） |
| `supersedes` / `superseded_by` | 由修订与回退推出 | 「被另一条替代」要成为能读出的边（01 G04） |

## 5. 主人动作：作为记录

前端只通过这些记录显示「你做过的事」；Agent 与 System 都不能产生它们。

| 动作 | 记录形状 | 效果 |
| --- | --- | --- |
| 纠正 | 一条 `manual_assertion` 来源（Morii 写下的正确说法）+ 目标记忆 ID 与修订 | System 管线形成新修订，`change = correction`；界面显示「Corrected by you」 |
| 撤回（这条不该记） | 撤回决定：目标、理由（可空）、时间 | 记录对召回与界面不可见；正文按策略保留或进入删除流程 |
| 遗忘（删除） | 删除请求：目标、影响预览的哈希、确认 | 走现有删除水位线；依赖它的投影一起失效（01 G18） |
| 保护 / 钉住 | 主人注意力标注：目标、`protect` / `pin`、期限（可空） | 只影响注意力投影，不改变真假 |
| 主题改名 / 钉住 / 解散 | 主人对主题投影的标注 | 重算主题成员时按成员重叠继承（参考 folio families，Jaccard ≥ 0.5） |
| 实体合并 / 拆开 | 决定记录：两个实体 ID、方向、理由 | 别名与参与者读取随之变化 |
| 自己的标签（如果 Morii 想要） | 主人标签：名字、目标列表 | 与自动标签分开显示 |

每个动作：计划 → 确认 → 提交；结果未知时可以用操作 ID 查询，不自动重发。

## 6. 冗余附注：形成时模型顺手给的东西

形成那一刻模型已经读过原文，多产出几项几乎不花钱。这些**不是事实**，存成附注：绑定记忆修订、模型版本、提示词版本；界面只在「算法建议」处显示，或者先不显示；随时可以整体丢弃重算。

| 附注 | 用途 | 参考 |
| --- | --- | --- |
| `formation_note`：一句话说明为什么值得记 | Inspector「Why it formed」 | Ombre-Brain `hold` 的 `why_remembered`（≤ 500 字符） |
| `suggested_tags[]` | 筛选条的「建议标签」 | folio `dehydrator.analyze` 产出的 `tags` 与 `domain` |
| `tone`：效价、唤醒度 | 以后的「情绪」视图（现在不显示） | folio / Ombre 的 `valence`、`arousal`；**不能**作为 Morii 的感受 |
| `importance_guess` | 注意力投影的输入之一 | folio / Ombre 的 `importance`；不当事实 |
| `current_state_note`：这件事现在的状态 | open_loop / plan 的显示 | Latent `latent_append` 的必填 `current_state` |
| `suggested_relations[]`：可能相关的记忆 ID 与类型 | 图投影的候选 | Ombre-Brain 自动关系只建 `related_to` / `same_event` / `continuation_of`，从不自动建因果 |

## 7. 投影层：初始化结束时要建好的

每个投影都带 `algorithm`、`version`、`snapshot`、覆盖说明，服从删除水位线，可整体重算（01 G18）。

| 投影 | 内容 | 喂给哪个视图 |
| --- | --- | --- |
| 检索索引 | 字面 + 别名（+ 以后的语义） | 检索、Quick Search |
| 主题 / 家族 | 主题 ID、名字、摘要、成员与分数；主人标注继承 | 主题泳道、星图聚类、筛选 |
| 带类型的边 | 事实边：推导、回退、替代、纠正、同一段对话、同一实体；建议边：主题共现、语义近邻（每种带上限与候选总数） | 记忆星图、Constellation、相关记忆 |
| 时间桶 | 每条时间轴 × 时区 × 日 / 月 × 层（材料 / 暂存 / 采用）的计数，加未知桶 | 时间线、覆盖日历、时间小地图 |
| 注意力 | 现有 Core-6 投影 | 淡出、归档、保护 |
| 统计与 facet 计数 | 状态、种类、主题、实体、项目 | 首页读数、筛选计数、星图侧栏 |
| 活动流 | 由提交、收据、作业日志推出的事件 | Formation |

## 8. 初始化过程本身的要求

1. **先试跑，后写入。** 每一批先出一份预检报告（会形成多少条、各字段的覆盖率、会被暂存多少、哪些来源解析失败），不写库（参考 Latent 的 `preflight` 模式）。
2. **按来源时间顺序形成。** 早的先形成，替代链与纠正链才能自然成立。
3. **分层账本**（沿用 Memory `04-evaluation-and-backfill.md` §1）：收到的材料、解析、抽取任务、候选、使用；每层的未知保持未知。
4. **批次可恢复、可回放。** 每批有 `import_batch_id`、输入水位、游标；中断后续跑只形成一次；结果未知不盲目重发（Core-2）。
5. **初始化与日常分开排队。** 初始化是低优先级的 `backfill`，Morii 日常对话的 `live` 形成优先（参考 MemoryConstellations：live 优先级 100，backfill -1）。
6. **不伪造主人动作。** 旧库里没有审核过的候选不变成已采用；含糊、推断与冲突按 Core-3 自动暂存与重评，不生成要 Morii 清空的队列。
7. **先在合成根上跑完整流程。** 用一组合成对话（含 04 文档 S01–S32 中与形成有关的场景）跑通，把结果接到 Runtime 的合成预览里看一遍，再动真实数据。

## 9. 验收：怎样算「完整符合前端显示要求」

初始化报告里给出下表每一项的实际数字；前端按这些数字决定哪些视图从合成换成真实。

| 检查 | 要求 |
| --- | --- |
| 标题覆盖 | 100% 的记忆有 `title` |
| 时间 | 每条记忆的 `event_time` 有 `precision` 与 `basis`；报告给出各精度的分布与 `unknown` 比例 |
| 实体 | 报告给出带实体的记忆比例、实体数、同名未合并的数量 |
| 证据 | 每条证据能解析到消息与字符范围，`quote` 能在来源里找到 |
| 会话 | 每条来自对话的记忆能跳回对话与轮次 |
| 语言 | 100% 有 `content_lang` |
| 一条一陈述 | 抽查报告：多事件段落被拆开的比例与例外 |
| 投影 | 七种投影都建好，各自带版本与覆盖；删除一条合成记录后全部投影同步 |
| 界面 | Runtime 的六个合成视图（Formation、记忆格、时间线、Constellation、星图、Recall lab）改读这份根后能画出来；对照截图附在报告里 |

## 10. 不做的事

- 不把模型推断的情绪、重要度、置信度当成事实字段（它们是 §6 的附注）。
- 不把旧候选批量当作已批准，不把 Agent 写的话当作 Morii 的原话。
- 不在初始化里调用未经授权的模型或外发；不打开未经授权的私人目录。
- 不把个人绝对路径写进任何记录或公开文档（路径用别名）。
- 不让旧 Runtime pin 在新根上写入；新旧根不同时作为主库写。
