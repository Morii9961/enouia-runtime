# 已有历史批次的准备、检查与单独发送

日期：2026-10-20。Morii 已明确授权本切片，实现与合成证据见[验证记录](../validation/History-batch-request-v1.md)。此文取代同日的接口提案；以 Memory ADR-MEM-71 和实际固定 Core 为准。

初始开发pin为 `d565181e0cb3bf14c938eb66a945269bba57ac8d`。2026-10-21，Morii进一步明确授权本项任务完成验证后直接合并；Memory #39已合入 `18f4081d5fe8eef879d4383e306c24660f416c5e`，Runtime的manifest、lockfile及pin统一采用该实际合并SHA。Workspace IPC v1仍为53条命令，aggregate `9b25885480cf2e220b37f231fe9973afaecb3bd68b8939fdf1c918d42ac233b2`。Runtime #92须在正式pin复核通过后合并；见[验证记录](../validation/History-batch-merged-pin-v1.md)。不叠加旧草稿#36，不激活真实Provider或后续阶段。

保存任务旁提供原批次选择、已有 extraction egress grant 和输出上限（1–32768，同时不超过当前模型上限）。`history_batch_prepare` 是带幂等键的同步本地写，参数只有 `taskId`、原始 `batchIndex`、`policyId`、`outputTokens`。Core 派生原 child/session/run/input，重新检查任务、来源、权限和模型。Runtime 不使用 `extraction_prepare` 重建另一任务。

准备返回 `external_prepared`；Runtime 核对 task/batch/session/run/input、模型及参数，显示实际 body、endpoint、模型、wireHash 和临时 callId。准备可能提交本地 Context、改变 head，但不读凭据、不调用 transport，也不代表发送授权。幂等键和精确参数属于独立于 head 预览的进程内 owner；Vault、任务、批次、policy 或 token 上限不同不能共用键。相同参数恢复使用原键。重新取得的 handle 必须重新检查。

只有主人单独勾选当前请求并选择发送后，才调用既有 `external_send`，绑定该 callId/hash 和唯一发送键。提交回执不明确时只恢复同一调用；不自动重发、重新准备或创建另一任务。任何已有 invocation，包括失败、取消及 unknown，都不得借准备重试。缺失 child 走已有显式 resume；暂停、来源权限或模型漂移按 Core 错误重新观察。锁定、切换 Vault、任务/批次/参数变动、Provider/grant 变化和 handle 失效均撤下旧请求及确认；迟到回复不得认领新选择。

本片只到请求准备、检查、发送操作和结果状态。保存结果预览、候选逐条入队、审核、语义分析、MV-8、MCP、云端及 Activity 均在后续范围。开发只用合成资料和 fake ports，不访问真实历史、个人 Vault、凭据或账户，不发真实 Provider 请求，不安装、部署或激活生产。
