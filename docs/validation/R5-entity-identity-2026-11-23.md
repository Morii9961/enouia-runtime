# R5：人物与地点的身份确认（2026-11-23）

Morii 选定的实体方案（同名自动关联 + 人工确认，确认界面放 Runtime）。pin 升至 Memory main `6c98e2ac78204b52663e07cbb81b72d48424d47b`：含 [#149](https://github.com/Morii9961/enouia-memory/pull/149)（ADR-MEM-171，连接器陈述带人名地名卡片，合并 `fcb9b04`）与 [#150](https://github.com/Morii9961/enouia-memory/pull/150)（ADR-MEM-172 跨窗口身份，审阅 head `27a72ef`）；aggregate `15b63686…`，61 命令。

## 改动

- 适配器：只读的 `entity_identities`（`NativeMemoryOwner::entity_identities`）。决定沿用已有的 `plan_action` / `confirm_action`，动作为 `entity_identity { entities, same, reason }`。
- 记忆目录左栏新增“人物与地点”：每组显示名字、类型和依据——已确认为同一个 / 按同名自动关联·未确认 / 单张卡片；每张卡片显示提到它的记忆数、是否已分开和卡片编号。
- 三个动作，都先看计划（卡片数、受影响记录数、原始来源保留）再确认写入：“确认是同一个…”（同名组全部卡片，same = true）；“不是同一个…”（被分开的卡片放第一位，后面一张同组卡片，same = false）；“并入…”（单张卡片加目标组的一张，same = true，只列同类型的组）。
- 关系图的 `same_name` 建议边有自己的名称和星座线型。
- 测试辅助 `connector_capture` 让每条合成陈述带一张人物卡片；`CaptureStatement` / `ConnectorStatement` 补 `entities` 字段。

## 验证

| 检查 | 结果 |
| --- | --- |
| `cargo test --locked`，新增 `entity_identity_groups_and_a_confirmed_decision`（两次连接器捕获得到 4 张同名卡片 → 同名组 → 确认后为“已确认” → 分开一张后该卡片标为已分开） | 72 + 9 通过，2 + 1 忽略 |
| clippy、fmt、tsc、i18n 与 CJK 字形子集（“卡 / 品 / 宠 / 及”不在子集，改用“条目 / 物件 / 动物”和改写）、`check-memory-integration --memory-checkout <6c98e2a>` | 通过 |
| DOM 夹具全量，新增 `registered-people` 5 项：同名组标未确认、单张可并入；确认计划包含全部卡片且计划时不写入；确认后重读；“不是同一个”把被分开的卡片放第一位；“并入”带上目标组的一张 | 全部通过 |
| 发布版程序真实库只读走查 | **21/21**：读到 4 组（同名 1 组 5 张、单张 3 组），左栏 7 项含“人物与地点”，页面截图核对；没有计划或写入任何决定；CURRENT 前后均为 440 |

## 边界

- 真实库上的第一次身份决定是写入，由 Morii 在验收时做（验收指南第 19 步），之前先让 Memory 确认导出。带这种决定的库需要本 pin 或更新的程序才能打开。
