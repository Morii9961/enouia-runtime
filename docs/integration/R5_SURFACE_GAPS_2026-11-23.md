# R5：登记模式下的界面缺口（2026-11-23）

R4 把六个表面接到了 Morii 的真实库，但不少视图只是列表或简化版，而设计规格（[SCREENS.md](../design/ui-v2/SCREENS.md) §1、§3）和五个工作区的合成预览（`apps/desktop/src/screens/automemory/`）画得更完整。合成预览的组件直接读虚构样本，不能原样接真实数据，登记模式要有自己的版本。本页按“谁能解决”分三类，逐项记状态。

## 第一类：Runtime 现有端口就能做

Memory 已经提供数据，只差 Runtime 的界面。每片做完都要过合成验证和真实库只读走查，然后合并。

| # | 表面 / 工作区 | 现在（登记模式） | 要补的 | 用到的端口 |
| --- | --- | --- | --- | --- |
| A1 | 形成 · 修订对照 | 详情里只列修订历史 | 选两个修订并排看正文、字段差异和来源（Comparison 的 revisions 模式） | `revision_diff`（适配器已有，界面未用） |
| A2 | 形成 · 冲突对照 | 只列冲突组成员 | 冲突双方并排看原文、状态、来源，不给“解决”动作 | `conflicts`、`detail`、`source` |
| A3 | 形成 · 暂存假说 | 无 | 列出 hypothesis / staged 记录，附形成理由和模型说明 | `page`（knowledge / adoption 筛选） |
| A4 | 时间 · 月 → 日 | 月格子 → 该月列表 | 月 → 日 → 当天记忆；未知时间单独一组；月份精度和范围分开 | `time_buckets`（day 粒度）、`page`（time_window） |
| A5 | 时间 · 覆盖日历 | 无 | 材料（来源捕获）与暂存 / 采用两层的日历，缺材料不显示 0 | `time_buckets`（source_captured / learned 轴，adoption 筛选） |
| A6 | 关联 · 星座 | 关系列表 | 选中记录的有界邻域图，按关系类型区分线型，附图例和关系列表 | `neighbors`、`graph` |
| A7 | 关联 · 替代链 / 证据链 | 无 | 按 derived_from / reversion 边和引文显示链条；真实库目前没有这类边时如实说明 | `graph`、`detail` |
| A8 | 关联 · 星图（全库） | 无 | 用全量图投影（真实库 351 节点）画星图；5,000 条的帧率仍按 OPEN_ISSUES #24 | `graph` 全量 |
| A9 | Home · 迹线 | 只标最新事件 | 按形成事件时间在记录纸和日历上画迹线（只画已记录的事件，不插值） | `activity` |
| A10 | 值得回看 · 稍后 / 关闭 | 只读列表 | 本机“稍后提醒 / 不再提醒”标记（像 Agent 请求的“跳过”，不写库） | 本地文件 |
| A11 | 记忆目录 · 按天分组与项目 / 来源导航 | 平铺列表加筛选 | 按学到日期分组的日分隔条；左栏按项目、实体分面导航 | `page`、`stats` / 分面 |

## 第二类：需要 Memory 新能力（已发给 Memory 会话排期）

| # | 需要 | 原因 |
| --- | --- | --- |
| B1 | 登记库上保存召回预览为 Capsule，并列出已保存的 Capsule | Context 表面的完整 Capsule 索引和召回实验的“保存”都需要 Morii 原生写入路径；目前只有不写入的预览 |
| B2 | 主题形成（theme 记录） | 已定：ChatGPT 经连接器提交主题（ADR-MEM-174），连接器部署后才有数据 |
| B3 | 关系图里的语义近邻（模型或向量） | 现在只有共同词语建议；语义近邻需要另行授权的模型步骤 |

## 第三类：需要 Morii 决定（周末一并交给 Morii）

见 [周末待定事项](R5_MORII_DECISIONS_2026-11-23.md)。

## 进度

逐片更新：完成后在这里写 PR 与验证记录。

- A1–A3（修订对照、冲突对照、暂存假说）：[验证](../validation/R5-formation-compare-2026-11-23.md)。
- A4–A5（月 → 日、覆盖日历）：[验证](../validation/R5-time-days-2026-11-23.md)。
- A6（星座）：[验证](../validation/R5-constellation-2026-11-23.md)。
- 人物与地点（Memory ADR-MEM-171/172 的确认界面）：[验证](../validation/R5-entity-identity-2026-11-23.md)。
- B1 Capsule（默认关闭）：[验证](../validation/R5-capsules-2026-11-23.md)。B2 主题形成：Memory 说需先由 Morii 定设计，已列入周末待定；B3 仍在队列。
- B2 主题：Morii 选 ChatGPT 提交（Memory ADR-MEM-174），Runtime 只做“ChatGPT 推断”标注：[验证](../validation/R5-chatgpt-themes-2026-11-23.md)。
