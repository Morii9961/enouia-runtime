# Core-8 独立 Runtime 合成原生采用

日期：2026-10-25，Asia/Shanghai。状态：Core-8 独立合成原生采用切片完成。实际模型质量、私人数据迁移与生产激活仍未验收。
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

- Rust 1.98.1 GNU、offline/locked：69 项 adapter/unit + 5 项 pinned-Core 字段集成测试通过；
  fmt、clippy all-targets `-D warnings` 通过。旧 lifecycle 测试对新增四条 history 写命令的
  预期已对齐，实际权限与写入分类仍取自 pinned Memory。
- 新增确定性竞态：根已构造但尚未绑定时，lock/exit 均丢弃它；启动前即拒绝真实 Provider
  更新。新增 native fixture 验证真实文件、System 回执、来源/历史、模拟不改 CURRENT、锁定、
  退出及旧 Workspace 拒读新根。
- Native schema/effect/client/DOM：版本/模式/副作用错配先拒绝；只有纯读取可在原生 worker 对明确 Busy 做
  有界等待，每次重验完整授权；前端单次发送，控制/未知结果/stale 不自动重放。
- 实际窗口曾间歇丢失详情/来源。组件用例复现了状态探测 Busy 取消并行详情；修正后未知状态
  先隐藏正文，同 snapshot 新授权观察后恢复；锁定/撤回、其他错误和新 snapshot 则清空。
  临时阶段诊断已移除。不能把旧绿测代替这一修复的最终窗口检查。
- 历史带阶段诊断的原生窗口曾通过 18/18；这不是最终版本通过证据。
- 早先 WIP 的无诊断版本在只读召回前超时，11/12 已执行检查通过。合成故障日志捕获
  Core `Vault(Busy)`，操作耗时记录显示授权读取约 0.5～0.7 秒；原前端两次 25ms 重试窗口
  覆盖不了它，锁定也可能撞上状态读取。这是实际并发可用性问题，不是语义模型证据。
- 修复把 Busy 等待收敛到原生 blocking worker，最多两秒重试预算，等待期间不持 binding/
  writer 锁，每次调用完整原生 gate；其他错误与控制一次返回。Lock 在等待 binding 前发出
  停止信号。移除前端和验收脚本的额外重试；原生回归覆盖等待上限、close 重验和锁定屏障。
- 并发修复后无产品 tracing、无测试 IPC 重试版本：真实窗口两次 18/18 通过，含来源、只读召回、
  CURRENT 不变、锁定拒读、托盘隐藏后台存活、退出 join、重启新库与第二次退出。
- 两次中间复验未连接到主窗口页面（0/1，未进入 Memory 检查），出现在 Cargo 检查后直接
  使用同路径 executable 的顺序中；重新执行 `desktop:build -- --debug` 后完整通过。
  未将这两个失败计入通过次数，也未仅凭顺序关联断言其底层原因。原生 gate 使用最后一次
  Tauri 嵌入资源构建的产物，放在 Cargo 检查之后。合成进程输出保存在验收目录用于诊断。
- 实际截图检查发现新区域输入缺少现有主题类、长召回文本不换行；只在新组件复用现有
  Memory 的 input/source/list/spacing 类修正，未修改共享 CSS 或设计系统。样式后组件 10 项
  断言、类型检查/嵌入构建及最终原生 18/18 再次通过，截图确认输入与长文本可读。
- 最终 Node 104/104，DOM 59/59 journey、760 项断言全部通过；前端类型检查和
  `npm run desktop:build -- --debug` 通过。Rust 最终 69+5 项、fmt/clippy 通过；
  pin self-test 8 项反例、依赖边界 self-test 7 项反例通过。旧 operation-cancel 用例曾在
  callback 已发生而 DOM 未 commit 时抢先断言，现同时等 callback 与终态 DOM，原断言保留。
  owned Cargo.lock 已规范为 LF，未改变 registry 包/依赖边；避免旧自测的行移除变体不生效。

实际执行了 locked/offline desktop cargo test、clippy all-targets、cargo fmt check、metadata，
Node pin/domain checks、npm check/test、全 DOM 和 debug native build。WIP 失败记录与最终通过
记录分开保留，不将旧阶段诊断绿测当最终证据。原生 smoke 的截图/完整报告只保存在本地 ignored/private
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
