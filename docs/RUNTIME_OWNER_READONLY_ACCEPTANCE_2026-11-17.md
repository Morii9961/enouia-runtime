# 已登记 Owner 只读入口验收（2026-11-18）

2026-11-19 起人工验收改用新候选 `1e96a6d`（收入键盘锁定焦点修复）：候选目录中相邻的
`enouia-desktop.exe` 和 `WebView2Loader.dll` 可免安装验收同一个已登记库，合成登记只读冒烟 **25/25**。
[候选位置、哈希及验证范围](validation/R3-owner-readonly-candidate-1e96a6d-2026-11-19.md)。

上一候选 `1267268` 通过合成 WebView2 **24/24**，交付会话已用它完成真实库的本机代理实测，
[候选记录](validation/R3-owner-readonly-candidate-1267268-2026-11-18.md)保留。代理实测不转记到新候选；Morii 的人工验收回执待填写。

## 先选对流程

| 要验收的对象 | 使用的入口和步骤 |
| --- | --- |
| 旧候选 `5175284` 与兼容的 Workspace v1 库 | [旧人工指南](RUNTIME_ACCEPTANCE_GUIDE_2026-11-08.md)。其中第 6、9 步会写入或导出，只适用于旧库 |
| 已登记的分段 Owner 库 | 本文的只读流程；由受信任本机启动指定原登记 home/operation，页面不提供开库或解锁 |
| 新安装、升级、托盘、热键、登录启动 | 使用新候选，按各项独立验收安排执行。合成冒烟覆盖了自启动拒绝开库 |

本入口不接通记住/批准/纠正/遗忘、导入、公开人设导出、Context、Sessions、Provider 或
Quick Search 的分段库检索。不要照旧指南第 6、9 步尝试写入新根，也不把新根选给旧的
“打开已有记忆库”。只读记录与来源读取不等于这些功能已经完成。

## 开始前需要的交付材料

由 Memory 会话提供不含正文、私人路径或凭据的工程摘要。Runtime 只核对摘要及公共源码，
不为准备验收打开私人 Vault、原文或备份。

| 材料 | 本轮确认结果 / 后续需填内容 |
| --- | --- |
| Memory 形成版本及读兼容性 | 正式续跑工具来自 Memory `afefa61`（PR119 / ADR151）。Runtime `506d23d` 已满足 ADR149 的分组决策读取要求。ADR151 只改 initializer，读取与备份契约、61 个 Workspace 命令和 aggregate `df3248e725f92952d0be265092babd5dbdbe6fec642720a0c400c71cbd9e7e53` 保持原值 |
| 全量计划及 journal 生命周期容量 | Memory交付会话已从正式506d23d重建CLI并报告原始完整清单容量通过：43计划、351记录、2,149个选入来源完整保留，queued journal 62,174字节、生命周期上界9,134,248字节、最大Plan对象674,906字节，均低于各自16 MiB。Runtime仅核对工程摘要，未读取私人清单或自行执行；早期17a369e的容量拒绝仍保留为历史结果。容量通过不等于建库/ready |
| 真实形成、关闭重开、查询与精确来源 | Memory 报告同一运行形成 351 条并保留首批 3 个回执。重开、11 页、查询、2,149 个来源、2,347 条直接引文和 86 条上下文引文的核对均通过 |
| 备份、验证与隔离恢复 | Memory 报告主人选定的本机同盘导出已验证 678 个文件，隔离恢复审计一致，同一清单重跑保持 `CURRENT` 与 journal 哈希。独立介质故障恢复待验证 |
| 同根身份与允许读取范围 | Memory 确认原生登记及兼容布局，Morii 保管实际启动参数。安排验收时按 Memory 交付摘要核对可读范围和有效截止时间，见下文 |
| 新候选 | `apps/desktop/target/candidate-1e96a6d/`（上一候选 `candidate-1267268/` 保留）。运行免安装副本时让 `WebView2Loader.dll` 保持在程序旁，按候选记录核对哈希 |
| 人工验收环境 | 按原登记的 Windows 登录账户免安装启动。代理已按此方式实测，Morii 的人工验收待执行 |

公共源码中 [11月16日交付路线](https://github.com/Morii9961/enouia-memory/blob/d0e7f9f0298e8b5c4c178dc2649a647c28e8596e/docs/handoff/MEMORY_DELIVERY_ROUTE_2026-11-16.md)
仍保留当日基线与待交库步骤，不能从它推断现在已 ready。[标题投影](https://github.com/Morii9961/enouia-memory/blob/d0e7f9f0298e8b5c4c178dc2649a647c28e8596e/docs/validation/Fresh-conversation-title-projection.md)
和[性能验证](https://github.com/Morii9961/enouia-memory/blob/d0e7f9f0298e8b5c4c178dc2649a647c28e8596e/docs/validation/Fresh-preparation-performance.md)
记录的是此前的合成结果。11月18日的真实交付工程摘要和候选证据见上表。

随后 PR117 已合并，公共[ADR149 集成说明](https://github.com/Morii9961/enouia-memory/blob/17a369e010f670baacaeec98306854fd4d14afc5/docs/integration/RUNTIME.md)
明确新增 reader 采用门槛；历史容量失败、新版本容量通过及两边分工见[路线接续](integration/RUNTIME_ROADMAP_2026-11-16.md#11月17日跨会话接续准入通过容量未通过)。不能继续沿用“后续仅初始化变更，无需更新 reader”的旧判断。

## 用候选验收只读入口

以下由 Morii 在批准的同一登记库和读取范围内操作。每项记通过/不通过/阻塞；反馈只需
界面现象与错误码，避免粘贴来源正文、完整路径或登记参数。

`506d23d` 的 fresh 清单要求 `formation_until` 与 `formed_at` 相隔七天，并以 `formation_until`
作为新批次策略的截止时间。当前 Runtime 的 System reader 从有效策略确定目录和来源的可读范围。
如果相关策略均已到期，顶栏仍可显示库已打开，目录计数和来源可以为空。验收时记录观察时间，
请 Memory 核对截止时间和预期范围。长期日用的读取授权另由 Memory 与 Morii 确认。
[清单校验](https://github.com/Morii9961/enouia-memory/blob/506d23dc174a3e927d323f8f8d0b8ecfc9d1726d/crates/enouia-memory-init/src/driver.rs#L137)
与[读取筛选](https://github.com/Morii9961/enouia-memory/blob/506d23dc174a3e927d323f8f8d0b8ecfc9d1726d/crates/enouia-memory-vault/src/automation/segmented/catalog.rs#L207)
见固定版本源码。到期撤回已有[合成原生测试记录](validation/Memory-pin-506d23d-2026-11-17.md)。

1. **显式启动。** 按[本机只读入口说明](integration/REGISTERED_OWNER_READONLY.md)使用
   对应新程序和原登记参数。顶栏应写“已登记 Owner · 只读”，并显示实际打开/未知/失败
   状态；失败不能转开其他库。参数缺失或不匹配时停止并记录，不自行改 descriptor 或换根。
2. **检查 Home 与 Settings。** 打开时应显示已登记库状态；Home 不编造提交点、时间迹线
   或已接通的 Context/Sessions。Settings 提供进入原生记忆目录的入口，不显示旧库新建/
   打开或模型配置控件。Context/Sessions 应说明此入口的限制。
3. **检索与分页。** 打开记忆页应默认选中“原生记忆目录”。用已知允许读取的一条测试
   记录的短词搜索，再清空搜索并翻页。数量只代表当前 selection 的授权范围，不据此
   推算真实整库总数、形成完整率或全部来源完整性。没有预期记录时先记录范围/策略问题，
   不为验收自动续期或新建 grant。
4. **详情与来源。** 点记录，再明确点“读取引文来源”。检查所选记录、来源修订与引文
   一致。若同一文字引自两个不同来源，分别点两处，核对来源 ID，并确认两次都读回同一引文。
   使用辅助技术时，可按按钮名称中的编号区分两处。切换记录后旧详情与来源应撤下。
   摘录只说明当前允许的文字范围，不证明附件内容
   或完整 Raw。不要为了截图展开无关会话。
5. **锁定与重开。** 点“锁定已登记的库”。列表、计数、详情和来源应撤下，顶栏显示已
   关闭；页面不应有解锁按钮。退出 Runtime，再用同一原生登记参数重新显式启动，核对
   是同一库、仍可读到预期记录，没有重复形成。右上角关闭只是收进托盘，不等于释放库。
6. **记录问题。** 若出现状态未知、读取拒绝、版本不支持或恢复要求，保留原错误及时间。
   不编辑库文件、不升级或降级打开、不换操作编号、不重发形成任务。新问题先由 agent
   在合成库复现；恢复与授权变化由 Memory 自己的明确流程负责。

若提示“无法为当前账户认证这个已登记的库”（`catalog_owner_authentication_failed`），说明
启动参数已通过解析，但 Memory 没有返回已认证的登记根。这个码也涵盖 home 校验、登记锁占用、
登记内容或描述符不符等原因，单凭提示不能断定 Windows 账户选错。保留原启动参数和错误，
由 Memory 在同一受信任账户下核对登记；无需反复启动 Runtime。

11 月 18 日的交付会话已确认：最初启动进程的 Windows 账户与原登记不同；换到原登记的
Windows 登录账户后，Memory 原生检查确认了同一个登记操作。交付会话随后完成只读桌面
实测，见[代理回执](validation/R3-owner-readonly-candidate-1267268-2026-11-18.md#真实登记库的本机代理实测)。
该会话报告本次策略窗口到北京时间 11 月 24 日 07:27:13；在此之后验收应先由 Memory 核对
预期可读范围。现有登记、权限与库内容无需为了验收而改动。

这些步骤不要求操作系统热键、文件选择、登录注销、真实 Provider、安装或部署。新候选
需要这些验收时单独安排；自动化的 `--autostart` 拒绝开库不等于实际登录启动已验收。

## Morii 人工验收回执

候选源码 `1e96a6d`，Memory pin `506d23d`。Memory CLI 与隔离恢复验收已通过，人工环境待填写。
若改用上一候选 `1267268` 验收，请在此注明；该候选用键盘 Enter 锁定后焦点会落到页面顶层，
`1e96a6d` 已修复（[验证](validation/R3-owner-lock-keyboard-focus-2026-11-19.md)）。

| 项目 | 结果 | 现象 / 错误码 / 时间 |
| --- | --- | --- |
| 显式同根启动与限制说明 | 未执行 | |
| 检索、分页及授权范围 | 未执行 | |
| 详情与精确来源 | 未执行 | |
| 锁定撤回与同根重开 | 未执行 | |

生产候选、真实库及人工验收的结果必须分别记录。合成验证与本机代理实测均不填进这张人工回执。
