# 已登记 Owner 只读入口验收准备（2026-11-17）

供 Morii 在新候选交付后验收同一个已登记库。目前是准备稿：**没有新安装候选，也没有
个人库验收结果。** 只读壳层实现基线为 Runtime `d7791aa`（PR184）；当前兼容采用的 Memory
pin 为 `506d23dc174a3e927d323f8f8d0b8ecfc9d1726d`，aggregate `df3248e7…`，Workspace 61 命令，
见[新 pin 证据](validation/Memory-pin-506d23d-2026-11-17.md)。此前合成原生检查 20/20 的范围与
首轮失败见[壳层状态报告](validation/Registered-owner-shell-status-2026-11-17.md)，不改写为本次执行。
11月18日构建另通过合成 WebView2 **23/23**，包含侧栏、目录搜索和引文按钮的新增断言。
[本次窗口验证](validation/Registered-owner-catalog-navigation-2026-11-18.md)

## 先选对流程

| 要验收的对象 | 使用的入口和步骤 |
| --- | --- |
| 旧候选 `5175284` 与兼容的 Workspace v1 库 | [旧人工指南](RUNTIME_ACCEPTANCE_GUIDE_2026-11-08.md)。其中第 6、9 步会写入或导出，只适用于旧库 |
| 已登记的分段 Owner 库 | 本文的只读流程；由受信任本机启动指定原登记 home/operation，页面不提供开库或解锁 |
| 新安装、升级、托盘、热键、登录启动 | 等对应新候选和独立验收安排；旧候选结果不能代替新程序的检查 |

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
| 真实形成、关闭重开、查询与精确来源 | 初次在第二批来源捕获时因跨批来源身份重复遇到 `fresh.step: Denied`。PR119 合并后，正式工具全量预检通过。续跑准备保留 3 个原回执与 Vault 第 7 个提交，随后用同一清单和登记操作启动剩余记录的形成。形成结果、重开、查询及来源与引文对账仍待报告 |
| 独立备份、验证与隔离恢复 | 待 Memory 提供已完成的工程证明；同盘合成往返不替代独立恢复 |
| 同根身份与允许读取范围 | Memory 确认原生登记及兼容布局，Morii 保管实际启动参数。安排验收时按 Memory 交付摘要核对可读范围和有效截止时间，见下文 |
| 新候选 | 待记录 Runtime 完整源码提交、精确 Memory pin/aggregate、程序与相邻 DLL/安装包位置及发行记录；当前没有可填写的新包 |
| 人工验收环境 | 待安排 Windows 账户、安装/免安装方式、语言和需要检查的屏幕/DPI；没有本轮人工通过结论 |

公共源码中 [11月16日交付路线](https://github.com/Morii9961/enouia-memory/blob/d0e7f9f0298e8b5c4c178dc2649a647c28e8596e/docs/handoff/MEMORY_DELIVERY_ROUTE_2026-11-16.md)
仍保留当日基线与待交库步骤，不能从它推断现在已 ready。[标题投影](https://github.com/Morii9961/enouia-memory/blob/d0e7f9f0298e8b5c4c178dc2649a647c28e8596e/docs/validation/Fresh-conversation-title-projection.md)
和[性能验证](https://github.com/Morii9961/enouia-memory/blob/d0e7f9f0298e8b5c4c178dc2649a647c28e8596e/docs/validation/Fresh-preparation-performance.md)
明确只报告合成结果。以上材料未齐时继续独立开发准备，不生成生产候选或启动个人库验收。

随后 PR117 已合并，公共[ADR149 集成说明](https://github.com/Morii9961/enouia-memory/blob/17a369e010f670baacaeec98306854fd4d14afc5/docs/integration/RUNTIME.md)
明确新增 reader 采用门槛；历史容量失败、新版本容量通过及两边分工见[路线接续](integration/RUNTIME_ROADMAP_2026-11-16.md#11月17日跨会话接续准入通过容量未通过)。不能继续沿用“后续仅初始化变更，无需更新 reader”的旧判断。

## 候选交付后的只读操作

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

这些步骤不要求操作系统热键、文件选择、登录注销、真实 Provider、安装或部署。新候选
需要这些验收时单独安排；自动化的 `--autostart` 拒绝开库不等于实际登录启动已验收。

## 回执

新候选源码/pin：待交付；Memory ready 摘要：待交付；人工环境：待安排。

| 项目 | 结果 | 现象 / 错误码 / 时间 |
| --- | --- | --- |
| 显式同根启动与限制说明 | 未执行 | |
| 检索、分页及授权范围 | 未执行 | |
| 详情与精确来源 | 未执行 | |
| 锁定撤回与同根重开 | 未执行 | |

生产候选、真实库及人工验收的结果必须分别记录。当前合成证据不填进这张人工回执，
本准备稿也不更新手动项目状态快照。
