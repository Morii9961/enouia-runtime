# R4.3 门槛 A：登记入口确认后写入（2026-11-21）

Morii 授权门槛 A。按 [ADR-039](../adr/039-registered-entry-confirmed-corrections.md) 在登记入口托管 Memory 的原生纠正流程；pin 升至 Memory `f7c2a81c315f34c46186cf1f901fe71812474c7f`（[#130](https://github.com/Morii9961/enouia-memory/pull/130)，ADR-MEM-155，审阅 head `3bc5de646c3356c543e75eb1df23e8da0bd2009a`，aggregate `ae79349e…`，61 命令）。`f9ac21d..f7c2a81` 中 Runtime 链接的代码只有 vault 的 `segmented/owner.rs`（动作按完整历史定位目标）。

## 改动

- 适配器：用同一已认证登记构造 `NativeMemoryOwner`（`descriptor.created_by`，仅 Morii 布局）；新增 `plan_action`（不写入）、`confirm_action`（主窗口确认点击 → `confirm_from_owner_gesture(TrustedWindowsApp)` → 立即 `commit`，不自动重试）、`action_outcome`（结果未知时查原操作）。状态附 `corrections`。普通合成入口没有 Morii 主体，拒绝这些操作。
- 界面：记录详情的“修改这条记录”——纠正、撤回、遗忘、保护、置顶；主题记录可改名、置顶、取消；对象合并 / 分开。先“预览修改”展示计划（受影响记录数、敏感度、原始来源保留、无物理删除、到期时间、纠正后的新内容），点“确认并写入”才提交；结果未知只给“查询结果”，并禁用其他修改。
- 原“只读”字样改为“仅确认后写入”，过时的“不提供 Sessions / Context”说明已更新。

## 验证

被测 `--no-bundle` 程序 SHA-256 `787dda9a597063fbb45f2949d8130c81b882f6ffbe0954cb72a112c3be46f934`，源码为 main `ef7fc7d` 加本分支。

| 检查 | 结果 |
| --- | --- |
| `cargo test --locked`：新增三项——计划不写入、确认一次即提交、重复确认与篡改哈希被拒、锁定作废计划、纠正生成第 2 版并换标题；普通入口拒绝；**策略过期后仍可修改**（同一测试在旧 pin `f9ac21d` 上失败于 `catalog_read_refused`，在 `f7c2a81` 上通过） | 66 + 9 通过，2 + 1 忽略 |
| `cargo clippy --all-targets -D warnings`、`cargo fmt --check`、`check-memory-integration --memory-checkout <f7c2a81>`、`tsc` | 通过 |
| `npm` 单元测试（含 i18n 与 CJK 字形子集） | 151/151 |
| DOM 夹具全量（新增 `catalog-corrections` 7 项：计划先于写入、确认只发一次且带原计划哈希、结果未知只查询不重放、无纠正能力时不显示） | 125 个夹具、2,583 项全部通过 |
| 原生 `--owner-readonly-only`（新合成登记；末尾通过界面撤回一条：计划不改 CURRENT，确认后 CURRENT 变化、记录数 3→2） | **36/36** |
| 原生 `--catalog-only` | **42/42** |
| 真实库（迁移后 home、原 operation）：只计划、不确认 | 6/6：顶栏为“仅确认后写入”、目录 351 条、修改控件出现、撤回计划到达真实根（受影响 1 条）、取消、退出码 0；原生探针 CURRENT 前后均为 440 |

## 边界

- 真实库的第一次写入留给 Morii 验收时在界面确认；Memory 已用新工具校验 seq 440 的导出，写入前若 CURRENT 不是 440 需重新导出。
- 写入第一条新式修改后，`884c015` 及更早的程序打不开这个库；新候选在 B / C / D 完成后统一重建。
- 标签（Tag）动作未放进界面。
