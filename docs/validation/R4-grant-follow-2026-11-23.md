# R4：Agent 授权自动跟随新来源（2026-11-23）

Morii 选择让本机 Agent 的授权自动跟随新窗口与新来源（上限与到期不变、可撤销）。pin 升至 Memory main `512ad0cb7e124f8598ee406bc9829ae792600084`（[#147](https://github.com/Morii9961/enouia-memory/pull/147)，ADR-MEM-170，审阅 head `3f3d9e9`；aggregate `731df3a2…`，61 命令）。

## 改动

- 登记新授权时设 `follow_new_sources: true`；上限 Private、`source_read`、`allow_requests`、90 天到期都不变（ADR-041 第二次修订）。
- 新动作 `follow`：给此前不跟随的授权做一次修订（revision + 1，只加这个字段），同样先看计划再确认。
- 授权视图和计划摘要带上 `follow_new_sources`。Settings：跟随的授权显示“新窗口和新来源会自动纳入；上限和到期时间不变”，不再出现“纳入新来源…”；不跟随的授权才显示缺口、“纳入新来源…”和“自动纳入新来源…”。计划卡片写明是否自动纳入。
- 本机目前没有任何真实授权，所以真实库上不需要迁移旧授权。

## 验证

| 检查 | 结果 |
| --- | --- |
| `cargo test --locked`：授权测试登记后经连接器捕获新窗口，授权仍为跟随、覆盖无缺口、补全被拒（`grant_up_to_date`），续期和撤销都保持跟随；Agent 请求测试里遗忘请求引用的是登记之后才捕获的窗口里的记忆，Memory 照常接受 | 71 + 9 通过，2 + 1 忽略 |
| clippy、fmt、tsc、i18n 与 CJK 字形子集、`check-memory-integration --memory-checkout <512ad0c>` | 通过 |
| DOM 夹具全量（`registered-agents`：计划写明自动纳入、跟随的授权不显示“纳入新来源…”与“自动纳入新来源…”）；`npm` 单元测试 | 全部通过；151/151 |

原生 smoke 与真实库只读走查记录在新候选里（见 [候选记录](R4-candidate-follow-2026-11-23.md)）。
