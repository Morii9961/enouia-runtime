# PR #93 最终评审与小修交付

2026-10-23，Asia/Shanghai。供 Morii 人工评审；保持 draft，不合并、不安装、不激活采集。

## 评审对象与结论

- 已先读取本机 CROSS_PROJECT_HANDOFF.md 的 Usage 交付单与 Claude 边界，以及本工作区 AGENTS.md。
- 指定工作区：E:/Workteree/7942/Enouia Runtime。开始时 tracked/untracked 状态干净，HEAD 与远端 PR head 均为 969f504f915989402b552ba7670c7ed7bc2fdfe1。
- GitHub main 当前为 669e68e1fca6c5609fa883916724a2db12b0d522。PR 信息中的 5deb9546eead991b0ea7382aa7574a6b4e6cd712 是此分支的共同基线；最终 108 文件 diff 按该 merge-base 阅读，不能把较旧工作区当作 main 的完整替代。
- 本次找到一个程序包身份绑定缺陷，已在本地作最小修复并通过定向验证。其余重点项未发现需要本片修改的具体行为缺陷。
- **本修订具备交给 Morii 人工评审的条件。原 head 969f504 含下述缺陷，本文件所在修订包含修复。** Morii 在交付及下一步说明后回复“继续”，授权把本片四文件提交、推送至 #93 原分支，保持 draft。实际推送后的 head 以 Git/GitHub 回执为准；不执行 ready-for-review、合并或重定基线。
- 技术评审、Claude 产品 UI 整合、个人历史对账和安装/物理验收是不同出口。本结论不宣告产品或生产验收完成。

## 具体问题与修复

**P2：已选择的程序包令牌未绑定选择时的二进制身份。**

原 usage_pick 只验证当前目录里的 manifest/exe 配对，然后把目录放入 Choice；run_request 再次信任目录里当时的 manifest。选择之后若 exe 与其正确配套的新 manifest 一起更换，新配对仍可通过，旧令牌便能启动另一份未经重新选择的程序，并向它提供私有操作路径。单独改 manifest 的原测试不能覆盖这个触发条件。

本地修复仅涉及 apps/desktop/src-tauri/src/usage.rs：

1. Choice 保存选择时已验证的二进制 SHA-256。
2. 每次操作仍验证当前 manifest/exe、固定格式与本地文件安全，并额外比对令牌绑定的摘要；不一致返回既有 usage_binary_changed，要求重新选择。
3. 保持目录/二进制句柄到操作结束，复用原错误文案与页面契约。
4. 新回归用例用两组故意不可执行的字节和各自正确的 manifest：初始令牌可验证；成对替换后旧令牌被拒绝；显式重新选择后新令牌可验证。用例不启动程序。

这绑定的是本次选择的一致性，仍不提供发布者签名或任意程序沙箱。未增加依赖、协议字段、UI 行为或后台采集功能。

## 重点核对

| 项目 | 代码与证据核对结论 |
| --- | --- |
| 去重、冲突与人工修订 | store.rs 的不可变 variants 与 choices/project 保留旧投影；相同证据不累加，冲突不取最大值。人工选择可下调或排除整个身份。review.rs 的签章绑定 source/revision/evidence-count/候选，新增证据即使未改变导出修订也使旧分页/确认失效。既有 ledger 测试覆盖 103→13 的替代、后续冲突、140 个候选分页及失效。 |
| Codex 计数 | adapter.rs 只使用累计向量差；last_token_usage 仅诊断。input 包含 cached，total=input+output；reasoning 是 output 子集，不能再次相加。首个非零 checkpoint 保留为未归日基线；复制前缀合成一条链，分叉/重置不猜桥接。 |
| Claude 计数 | ordinary/read/write/output 分别处理；可确认时 input_total=ordinary+read+write。缓存时长缺失不猜 5m，reasoning 缺失保持 unknown。公开比较样本缺少 assistant 类型会跳过，不能据此声称支持所有历史格式。 |
| unknown / 请求开始日 / unallocated | Counts::add 传播 null。观测日不冒充请求开始日；现支持格式全部保留于数据集级 unallocated，含导出范围外观测，days=not_collected、rows=[]。质量原因与 Token 分开，不能将原因次数当用量或并入日/周/价格。 |
| 封闭导出与隐私 | export.rs 从当前事实投影构造白名单，contract.rs 再作结构和语义验证；随机每来源 dataset alias，整数十进制，不直接序列化数据库记录。无正文、原始路径/ID/密钥；模型名须明确批准。新文件独占写，不覆盖；预算超限拒绝。既有哨兵、精度、修订与范围测试仍适用。 |
| runner 与退出 | 新修复补齐选择身份绑定。原 pin_package/safe_file 拒绝不安全链接并固定句柄；main-only 命令、64 KiB 请求、256 KiB 回复、有限错误与独立 gate 保留。cancel/shutdown 只操作 host.child 内自己的 Child，无进程枚举/按名称杀进程；close-to-tray 与显式退出有别。任意外部程序的后代/继承管道不在终止承诺内，既有报告已披露。 |
| Dashboard 协议 | usage-pin.json 固定 UsageSnapshot 1.1 / b66a472d04da3f7767dc5ba747ba1d5b9c494a9d，接受冻结 1.0/1.1。已保存 conformance 输出为 43 文件、39 fixture、4 Runtime 导出通过；旧“等待冻结/质量原因”阻塞解除。本次未改采用或导出，不重跑 conformance。 |
| Memory 与 Activity | PR 相对共同基线未改 Memory pin、原生 Cargo 依赖/锁文件或现有 Activity 生产者；本片也未改。#93 工作区 Memory 是 a6e4da9958730ac8d7a151ce49c1108ff80f4228 / 52 commands，main #92 已前进到自己的集成版本；不要把本工作区旧快照覆盖到 main，更不在本片采用 55 命令或 Host。 |

## PR 自述与实际保存的证据

下表是本次读取的本地证据，不把存在测试代码或 PR 自述等同于已保存成功输出。target 下日志被 Git 忽略，不属于公开 PR 附件；本评审单保留核销结论。

| 范围 | 实际保存与证据强度 |
| --- | --- |
| R3 Usage 测试 | target/usage-R3-tests.txt 记录当时 25 pass、3 ignored，包含崩溃恢复父测试。它不是后来的 U1 backend 27-test 完整日志。 |
| 协议采用 | target/usage-R3-conformance.txt 明确记录 43 published files / 39 fixtures / 4 Runtime exports accepted，1 test pass。 |
| 原生默认检查 | target/usage-desktop-native-tests.txt 明确记录 69 unit pass、1 ignored，另 8 pinned-Core 检查 pass。最终新增 closed-reply 检查在本次定向运行也通过。 |
| 前端 | target/usage-desktop-frontend-tests.txt 记录 123 Node pass 和 69 Happy DOM journeys / 924 assertions；Usage 当时 16 assertions。报告另记最终 focused 17/17，其成功原始输出未在这份日志中保存。 |
| 真实独立 runner 合成流程 | target/usage-desktop-runner-tests.txt 实际保存的是 Windows sharing error 32 的早期失败；U1-desktop 报告记载改用 manifest tamper 后通过及最终重跑，但这份日志不是那次成功证据。本次保留两者，不把失败日志称为 pass，也未为审计补跑 100,000 行取消流程。 |
| 其他历史检查/构建 | R1/R2/R3/U1 报告记载 strict Clippy、边界守卫、公开格式比较、最终 bundle、浏览器与独立复制包检查。未逐项找到成功原始输出者按报告记录复用，不升级为本次重新验证。R2 性能仅为 100,000 unique 与 1,000,000 total / 100,000 unique 的历史测量。 |

既有分阶段报告：[R1](AI-usage-ledger-R1.md)、[R2](AI-usage-ledger-R2.md)、[R3](AI-usage-ledger-R3.md)、[U1 backend](AI-usage-ledger-U1-backend.md)、[U1 desktop](AI-usage-ledger-U1-desktop.md)。历史报告不追改成新运行的结果。

## 本次实际验证

| 检查 | 结果 |
| --- | --- |
| 单文件 rustfmt，edition 2024；git diff --check | 通过。 |
| 桌面原生 cargo test --offline --locked --bin enouia-desktop usage -- --nocapture | 3 pass、1 ignored、68 filtered；涵盖成对替换回归、窗口权限/封闭请求、封闭类型回复。输出保存于 target/usage-PR93-final-native.txt。 |
| 桌面原生 cargo clippy --offline --locked --bin enouia-desktop --tests -- -D warnings | 通过，输出保存于 target/usage-PR93-final-clippy.txt。 |
| node scripts/check-memory-integration.mjs --self-test | memory_pin_consistent，a6e4da9958730ac8d7a151ce49c1108ff80f4228，3 crates / 8 locked packages / 8 negative checks。 |

未跑全量 workspace、全量前端、打包、smoke、性能或新 conformance；未改范围复用上述历史证据。原 target/Usage-Desktop-20261022 及 NSIS 属于旧交付，**不包含本次身份绑定修复**，不能用旧产物声称修复已分发。

## 尚未验证及 Claude 交接

- 个人 Codex/Claude 历史格式兼容、完整性、重复/冲突实际分布及账号/账单对账；没有访问个人日志、Vault 或凭据。
- 物理 picker、实际安装/升级/卸载、Narrator、其他 DPI/显示器与物理电源故障恢复。
- 一百万 distinct persistent identities、签名分发、真实 Provider/生产自动化，均未由本片证明或启用。
- Claude UI 尚未完成。App.tsx/main.tsx 本次没有修改；所有 redesign/* 分支/worktree 保护，未合并、关闭或清理。最小入口适配见 [Claude 文件级交接](../integration/USAGE_PR93_CLAUDE_ENTRY_HANDOFF.md)；未向其他会话发送消息。
- 本次提交/推送仅包含本片拥有的 usage.rs、用户指南这一句澄清、本评审单和 Claude 交接。提交带仓库规定的 Codex trailer；仍保持 #93 draft，不触发下一个项目。
