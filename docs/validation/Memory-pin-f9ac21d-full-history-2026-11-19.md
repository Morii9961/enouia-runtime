# Memory f9ac21d 采用：登记入口全历史读取与数据区迁移（2026-11-19）

Morii 授权 Memory 迁移数据区、并让本机读取不再受形成策略期限限制。Memory 以 [PR #127](https://github.com/Morii9961/enouia-memory/pull/127)（ADR-MEM-153 / 154）交付，合并提交 `f9ac21dc448527da42e2af06a1fd7b56edcec186`（审阅 head `44c45bad137845d96984989078f6facff523ce67`）。

## 精确采用

- pin `009b7bc → f9ac21d`，aggregate `b38765569c5d5a77e79ec951b8bc65a86c226cebbc4f3df40b32a5e0cd5151a6`，Workspace 仍 61 命令；六个 rev、九个锁定包与 `memory-pin.json` 同步，`cargo metadata --offline --locked` 通过，无 path / branch / patch。
- Runtime 链接的变化在 `enouia-memory-host`（catalog、process、owner_bootstrap 的 relocate）与 `enouia-memory-vault`（分段读取按授权范围选择策略）；持久格式、IPC 与登记格式不变。
- 登记入口改用 `SegmentedMemoryReader::from_authenticated_system_full_history`：按全部已提交策略修订授权，形成窗口结束不再隐藏记录；删除、撤回、遗忘屏障与 `HighlySensitive` 上限照常。固定合成入口仍用普通读者。
- ADR-MEM-154 迁移只改登记里的 home 路径：Runtime 不改代码，启动时换新 home、operation 不变。

## 验证

被测 `--no-bundle` 程序 SHA-256 `2ff11ebb07da8bc9e86a0cce0bf4c2f909dce1e6d1ebb10bcff388c672189d0e`。

| 检查 | 结果 |
| --- | --- |
| `check-memory-integration --self-test` / `--memory-checkout <f9ac21d>` | 一致，surface 与 pin 一致 |
| `cargo test --locked`，新增 `full_history_reader_keeps_records_after_their_policy_window_ends`：用 FakeClock 把策略推过期，全历史读者仍读到 3 条、召回仍考虑 3 条；原有 `status_reauthorizes_when_policy_expires…`（普通读者归零）保持通过 | 63 + 9 通过，2 + 1 忽略 |
| `cargo clippy --all-targets -D warnings`、`cargo fmt --check` | 通过 |
| 原生 `--owner-readonly-only`（新合成登记） | **34/34**（首次运行因 WMI 进程归属检查偶发失败 0/1，原样重跑通过） |
| 原生 `--catalog-only` | **42/42** |
| 真实库只读实读：迁移后的新 home、原 operation | 桌面走查 **20/20**（351 条、399 段对话、352 个事件、图 351 节点 / 698 边、召回考虑 351 入选 10）；原生探针 CURRENT 前后均为 440 |

本片没有前端改动，未重跑 DOM 夹具。迁移时尚在 11-24 窗口内，所以真实库计数与迁移前相同；到期后的效果由上面的 FakeClock 合成测试覆盖，真实库到期后的读数待 Morii 验收时观察。
