# 历史规划宿主入口：Memory 接入需求

日期：2026-10-18。Runtime 基线 `bd592b7`，固定 Memory `56bc5eb`。本文是可审核的跨仓库需求，**不是已实现接口、Memory 新阶段激活或个人历史使用授权**。

后续实施：Morii 已明确授权此只读跨仓库切片。当前采用契约与开发证据见[历史规划接入](../validation/History-planning-v1.md)；下文保留提出需求时的基线，不将后续 H2 或真实历史使用视为同时获批。

## 已核实的缺口

固定版本已有离线 `enouia-memory-import::history::plan_history`，Provider 的 `history::materialize` 及后续审核 helpers。它们不是 Workspace 的公开宿主方法，也不属于47条页面命令。Runtime 目前只能显示 `import_list` 的归档结果，不能从 UI 调用历史覆盖规划。

职责仍按 [ADR-025](../adr/025-enouia-memory-integration.md) 与 [接入指南](../MEMORY_INTEGRATION_v1.md)：Memory 负责归档读取、解析、来源绑定、时间/分支与删除规则；Runtime 负责产品表面与原生身份/生命周期适配。不能在 Runtime 直接依赖 import/Provider helpers、读取 Vault 文件或重建另一套 planner。

## 第一项可交付切片：只读规划

建议先在 Memory 当前历史初始化范围提供一项只读 Workspace 入口。具体 Rust/IPC 名称及契约由 Memory 定义，不把本文的描述当作已存在 API。

| 输入或出口 | 必须保持的语义 |
| --- | --- |
| 归档选择 | 由已观察的 import ID 和来源修订定位；不接收页面文件路径或任意原始 JSON；拒绝不属于当前 Vault 的选择 |
| 显式范围 | 选择会话/分支及有界批次参数；不默认把全部历史交给模型，不将消息数当作 token 预算 |
| 规划结果 | 返回稳定的来源/修订绑定、观测时间范围、未知时间、分支路径、覆盖/解析/附件缺口和有界批次摘要；长列表分页或明确拒绝超限 |
| 结果身份 | 每条批次引用由 Core 发出并绑定该次规划和来源；Runtime 不自己拼来源 locator 或猜业务时间 |
| 生命周期 | 无 Vault、锁定、关闭、切换和来源变化时拒绝或使旧结果失效；不得缓存绕过删除/权限水位 |
| 窗口范围 | 主工作区可读，Quick Search/overlay 不可调用；不能由页面参数提升调用身份 |
| 副作用 | 不创建 Session、ExtractionJob、候选或正式记忆，不调用模型，不写提炼任务，不批准内容 |

应提供合成输入上的真实 Core 消费测试：已归档来源的覆盖/分支/未知时间、坏图和预算拒绝、错误归档/修订/跨 Vault、锁定/切换、被删除来源及明确的只读性。同步更新 integration surface 和 Runtime 兼容记录，按 Memory 仓库门禁验证、提交和推送。

## Runtime 随后的采用

Memory 交付后，Runtime 才更新 exact pin、适配固定接口，并在 Import 报告旁提供明确的 **规划历史** 入口，展示覆盖与批次摘要、错误恢复和重新读取。开发验证使用合成 Vault；来源/结果 ID、窗口权限、生命周期和迟到回复必须可核对。

H2 的批次材料化、真实提炼、跨时间对比和语义提案应逐项另做切片。只读规划通过不代表这些写入已接入，更不代表真实历史完整、语义质量通过或正式记忆已审核。MV-8 Host/MCP、云端、凭据、真实资料和外发不由本需求开启。
