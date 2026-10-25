# Core-8 独立 Runtime 合成原生采用

日期：2026-10-25，Asia/Shanghai。状态：WIP 检查点；额度达到 95% 按 Morii 要求停工保存。最终原生 gate 未通过，不宣布 Core-8 完成。
Runtime 基线 `b8254d8a8a88d67cd92e7f0d8ce72964a62f344e`，分支
`codex/core8-native-adoption`。Morii 在 Core-7 接续中明确批准独立 Runtime 采用，
保留 Claude 探索树并继续仅用合成资料。

采用 Memory `674b069ae5036d3b0d4c6fce5c572727c3fae9cc`；
Core-7 的 629 项合成验证记录在其独立提交中。Runtime 原 pin 为 `56bc5eb...` / 47 commands；
本片改为完整 SHA / 55 commands，并加入同 SHA 的 Host/Vault 直接依赖。
九个 Memory lock 包来源一致；新增唯一包为 Memory Host，原有 registry 包及四条被
Cargo 自动移动的依赖边已恢复。无 branch/path/patch 或 Memory checkout/target 构建依赖。

## 范围与 owned files

- Desktop Cargo.toml / Cargo.lock、memory-pin.json；
- Native `memory_automation.rs`、其 `fixture.rs` 与六个公共合成 JSON；
- MemoryHost/native main 的注册与生命周期钩子，build.rs、main-window capability
  和生成的 `memory_automation` permission；
- Memory 区域 `AutomaticMemory.tsx`、`automation.ts`、MemorySurface 挂载、旧 client 写键；
- 对应 Node/DOM/native 测试、三份公共读模型 JSON、现有 smoke 的 automatic-only 分支；
- ADR-037/寄存器、集成说明、本报告。

没有修改共享前端 App/main/router/token、Activity/Usage 实现、冻结的 Runtime Core 历史、
Claude 探索树、原 checkout、其他并行分支、AGENTS 或手动项目状态。ADR-035/036 已由
并行 Activity 工作占用，本片使用 037；其工作树只读核实，未修改或合并。

## 已实现

`--memory-synthetic` 在新临时目录创建真实 Memory-owned V2 合成事务与 System 回执；
仅三条固定文本和 fake generator，未连接真实语义模型、Provider 或 embedding。
正常 v1 入口、owner review 历史和旧 CURRENT 不变。新 native 请求不能携带 root、actor、
profile 或 sensitivity；主窗口双重准入，overlay 拒绝；版本不支持先于操作/根解码拒绝。

Memory 区域显示授权列表、详情/历史、显式来源、支持与分析依赖、独立时间/知识/采用/
有效性/attention、存量见证回执与局部精确边。普通自述仍是“本人说过 X”，不是客观核验。
staged 状态不转成真人必审队列。原生只读召回与保存 Context preview 分开；无实验保存。
`native_read` 与 `native_control` 分开，不用控制响应伪称只读或记忆成功回执。

原生初始化、查询和 teardown 在 blocking worker；生成/维护仍由 Memory 私有线程持有。
锁定/退出阻止构造完成后的迟到绑定，退出 join；失败退出不静默重开。三条合成来源有独立
事件身份，保留 Core 同源拒绝规则。临时合成目录保留用于诊断，每次重启新建，不自动采用。

## 实际检查与边界

- Rust 1.98.1 GNU、offline/locked：67 项 adapter/unit + 5 项 pinned-Core 字段集成测试通过；
  fmt、clippy all-targets `-D warnings` 通过。旧 lifecycle 测试对新增四条 history 写命令的
  预期已对齐，实际权限与写入分类仍取自 pinned Memory。
- 新增确定性竞态：根已构造但尚未绑定时，lock/exit 均丢弃它；启动前即拒绝真实 Provider
  更新。新增 native fixture 验证真实文件、System 回执、来源/历史、模拟不改 CURRENT、锁定、
  退出及旧 Workspace 拒读新根。
- Native schema/effect/client/DOM：版本/模式/副作用错配先拒绝；只有纯读取可对明确 Busy 做
  有界重读，保留原 query；控制/未知结果/stale 不自动重放。
- 实际窗口曾间歇丢失详情/来源。组件用例复现了状态探测 Busy 取消并行详情；修正后未知状态
  先隐藏正文，同 snapshot 新授权观察后恢复；锁定/撤回、其他错误和新 snapshot 则清空。
  临时阶段诊断已移除。不能把旧绿测代替这一修复的最终窗口检查。
- 历史带阶段诊断的原生窗口曾通过 18/18；这不是最终版本通过证据。
- 最终无诊断、明确 native_control 版本：原生 smoke 执行到只读召回时失败，11/12 已执行
  检查通过，随后超时；界面显示 generic Memory call failed，观察状态清空。此前详情/来源也
  曾间歇丢失。需要继续诊断真实 IPC 错误/观察生命周期，不能仅加超时或套用旧绿测。
- 最终 Node 105/105，DOM 59/59 journey、760 项断言全部通过；前端类型检查和
  `npm run desktop:build -- --debug` 通过。Rust 最终 67+5 项、fmt/clippy 通过；
  pin self-test 8 项反例、依赖边界 self-test 7 项反例通过。旧 operation-cancel 用例曾在
  callback 已发生而 DOM 未 commit 时抢先断言，现同时等 callback 与终态 DOM，原断言保留。
  owned Cargo.lock 已规范为 LF，未改变 registry 包/依赖边；避免旧自测的行移除变体不生效。

实际执行了 locked/offline desktop cargo test、clippy all-targets、cargo fmt check、metadata，
Node pin/domain checks、npm check/test、全 DOM 和 debug native build。最终 native 失败材料
保存在本地 private gate；额度停止后没有继续修改实现。下次先复现该失败，再完成 native gate。原生 smoke 的截图/完整报告只保存在本地 ignored/private
验证材料，不发布个人路径或附件。Release/installer、Narrator/物理托盘/真实 sign-out、真实
Provider/模型质量、私人历史覆盖/迁移/恢复及云端均未验收，不由本片推断完成。

[版本/消费者/回滚规则](../MEMORY_INTEGRATION_v1.md#core-8-synthetic-native-capability)
和 [ADR-037](../adr/037-synthetic-native-memory-adoption.md) 是本片正式采用边界。
Context/Sessions/Provider/Quick Search 继续自己的 v1 数据路径；本片没有伪造新版会话/capsule
或把 V2 塞进旧工具。没有 merge/deploy、安装替换、实际迁主、生产旁库/双写、通知或状态快照。

## 后续门槛

这是最小 Memory 原生能力采用切片。真正完整 Core-8 的模型语义质量、生产 System 身份/输入
捕获、真实账号/预算、数据范围/固定快照、独立恢复/旧主栅栏与其他消费者的新版能力，需要
各自明确资源与激活边界。日常逐条主人审核不是这些门槛的替代品；旧 owner 数据保持原义。
