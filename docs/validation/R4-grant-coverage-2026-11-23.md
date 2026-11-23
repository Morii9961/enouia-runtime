# R4：授权覆盖与多会话 Agent 管道（2026-11-23）

pin 升至 Memory main `bc39dc91f431a0943d21d30f78ee1581d112e98e`：含 [#144](https://github.com/Morii9961/enouia-memory/pull/144)（ADR-MEM-167，Agent 的 `memory_related` 给出共同词语建议边，只影响 Agent 侧，Runtime 不用改）、[#145](https://github.com/Morii9961/enouia-memory/pull/145)（ADR-MEM-168 授权覆盖与补全计划，合并 `6c19915`）、[#146](https://github.com/Morii9961/enouia-memory/pull/146)（ADR-MEM-169 同名管道多实例，审阅 head `eaed583`）；aggregate `1f77435e…`，61 命令。

## 改动

- `agent_status` 对每个已登记的 Agent 附上 `owner_read_grant_coverage` 的结果：还缺的策略（新窗口）数、来源数、是否可补全。
- “更新来源范围”改为“纳入新来源…”：直接用 Memory 给出的 `refreshed` 修订去计划，展示后由 Morii 确认；没有可补的内容时 Memory 不给计划，Runtime 返回 `grant_up_to_date`，按钮也不出现。Runtime 不再自己拼补全后的授权（ADR-041 修订）。登记新授权仍按当时的策略与来源。
- Settings 每个已登记 Agent 显示一行：“已覆盖当前全部窗口和来源”或“这份授权写下后新捕获的 N 个窗口、M 条来源还没有纳入”。
- Agent 管道改用 `Pipe::listen_shared`，每个 Agent 4 个监听实例，同一 Agent 最多 4 个会话同时连接；Settings 的说明随之改写。
- 测试辅助 `connector_capture`：经 ChatGPT 连接器捕获两轮合成对话，供 Agent 请求和授权覆盖两个测试共用。

## 验证

| 检查 | 结果 |
| --- | --- |
| `cargo test --locked`：授权测试先确认刚登记时补全被拒（`grant_up_to_date`），再经连接器捕获新窗口，覆盖显示缺 ≥1 个窗口、≥2 条来源且可补全，补全后覆盖为 0；管道测试新增第二个客户端同时连接，锁定后两条连接都中断 | 71 + 9 通过，2 + 1 忽略 |
| clippy、fmt、tsc、i18n 与 CJK 字形子集（“窓口 / 四 / 五”不在子集，改用“ウィンドウ”和数字）、`check-memory-integration --memory-checkout <bc39dc9>` | 通过 |
| DOM 夹具全量（`registered-agents` 覆盖行与“纳入新来源…”）；`npm` 单元测试 | 全部通过；151/151 |

原生 smoke 与真实库只读走查记录在新候选里（见 [候选记录](R4-candidate-1ab7a89-2026-11-23.md)）。

## 边界

- 授权自动跟随以后的新窗口会改变授权含义，仍由 Morii 另行决定；目前每次扩大都要 Morii 确认。
- ChatGPT 连接器的授权覆盖要等连接器真正部署（待域名），Runtime 目前不知道它的授权编号。
