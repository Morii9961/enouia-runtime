# Runtime 模型配置与恢复

Sessions 的 External provider 面板提供 **Model setup steps** 和 **Reload settings**。配置仍由 owner 手动填写；本指南不表示真实模型、密钥或个人工作流已验收。

1. 在 `%APPDATA%\com.enouia.runtime` 创建或编辑 `memory-providers.json`。只配置自己已确认的模型及能力；不要根据订阅名称推断 API 使用权，也不要将密钥放入文件。
2. 保存后点击 **Reload settings**，无需重启 Runtime。配置错误会说明字段或限额问题；修正后再次重载。移除文件再重载可关闭外部模型，正在发送时需先等调用结束。
3. 配置加载后，用 **Set key…** 在 Windows 原生凭据窗口的密码栏输入密钥，用户名不使用。密钥保存在 Windows Credential Manager，页面看不到它。此操作由 owner 自行完成。
4. 在当前会话中审核授权，然后准备问题、检查完整请求，最后选择 **Send once**。加载配置本身不发送内容、不授予外发权限。来源提取还需要明确允许 extraction 的授权，模型建议仍需普通记忆审核。

下面只演示 JSON 结构；模型名、能力、时间与额度均为合成示例，不能作为真实账号的配置依据：

```json
{
  "schemaVersion": 1,
  "destinations": [
    {
      "api": "openai",
      "model": "synthetic-model",
      "contextWindowTokens": 128000,
      "maxOutputTokens": 4096,
      "streaming": false,
      "verifiedAt": "2026-10-11T00:00:00.000Z"
    }
  ],
  "maxAttemptsPerSession": 10,
  "maxReservedTokensPerSession": 100000
}
```

`api` 仅支持 `openai`、`anthropic`，每种最多一项，共一至两项。模型 ID 需精确填写且不能包含空格；输出上限需大于零并小于上下文窗口。会话尝试上限为 1–1000，预留 token 上限需大于零。`verifiedAt` 是 owner 核实能力的 ISO 时间。文件上限 64 KiB；未知字段及密钥字段会使整份配置被拒绝。

会话 token 预算采用估算值，不是金额限额。模型调用是否完成以 Memory 的操作和调用记录为准；未知结果可能已到达模型服务，不应据此重复发送。**Remove key** 只删除本机条目，不在服务端撤销密钥。配置重载不能跳过授权或请求审核。

状态读取失败时，点击 **Read status again**。重载因调用进行中被拒绝，会保留先前配置；无效文件或文件被移除，仅在 Core 接受关闭后才显示关闭。当前请求或授权正在审核时，先完成或取消审核，再重载。

发送中可选择 **Stop locally**。提示“Local stop requested”仅表示请求本地停止；必须等操作结束。它不保证模型服务停止处理或停止计费。完成、输出上限、失败或本地取消结果会保留，重新准备请求前应查看会话里的调用记录。来源提取失败后可选择 **Read saved suggestions** 重新读取已有结果，或 **Close**；重新读取不会发送或添加记忆建议。

关闭模型配置后，会话中的已有调用记录仍可查看。对于 `outcome unknown`，可用 **Close locally…** 检查并确认本地收尾计划，无需重新开启模型或输入密钥；它只记录本地结果，不撤销远端处理。若确认回执读取失败，**Retry** 保留原确认内容和幂等键，不代表重新发送模型请求。

**Lock Vault** 或 **Exit** 会停止本地模型调用并等待 Memory 释放 Vault；已到达模型服务的请求仍可能被处理。解锁或重新打开后，先查看原会话保存的调用结果。结果未知时按上述本地收尾流程处理，不要直接重复发送。关闭窗口只是隐藏到托盘，调用仍会继续；Activity 的定时任务由独立 producer 管理。

记忆建议加入审核队列期间，等待写入和结果读取完成后再关闭面板。若途中失败，先选择 **Refresh saved suggestions** 查看已保存进度，再决定是否继续添加剩余建议；它不重新调用模型，也不自动批准记忆。旧预览会标注为先前观察结果，不能据此认定写入未发生。

来源建议的 **Model for suggestions** 可选择已加载的 Provider 与模型。选定模型需有允许 extraction 的授权；单纯的对话授权不够。选择本身不发送内容。请求准备后，这次流程的模型会固定；如需换模型，先关闭已结束的流程，再重新准备。

建议预览里的原提案、候选记录和审核状态，不等于正式记忆当前内容。审核时可以编辑内容；已批准记忆的实际内容请在 **Memory Vault** 查看。候选收件箱先显示 50 条，选择 **Load more candidates** 继续读取；读取失败或列表已变化时，用 **Refresh candidates** 重新读取后再审核，未提交的编辑会保留。来源页面的队列如果暂停，先选择 **Resume local queue** 并读取保存结果，再单独选择入队；恢复本身不会发送模型请求或添加建议。

候选记录中的 **Show evidence source** 可读取引用的来源版本，**Next source part** 继续阅读，**Evidence locator** 展示原始定位记录。正文只是来源资料，不是软件指令。读取失败可用 **Read source again**；读取和隐藏来源都不会批准候选或调用模型，审核仍需单独检查并确认。

离开来源页后，可在 **Sessions → Saved source suggestions** 找到会话中保存的建议任务，选择 **Read saved suggestions** 查看原建议和候选状态。关闭 Provider 后仍可读取。读取本身不会重新调用模型、加入审核队列或批准记忆；失败时用 **Read saved suggestions again** 恢复读取。

成功读取后，尚未完成且未暂停的任务可选择 **Add remaining suggestions to the review queue**，继续本地入队，无需重新配置模型或输入密钥。写入期间不能切换会话、建议任务或关闭预览；若回执丢失，先重新读取保存进度，再决定是否继续。候选仍需在 **Memory Vault** 普通审核后才成为记忆。

若切换页面或离开来源详情，后续入队步骤会停止提交，已经提交的一步仍可能完成。返回后先从会话读取保存进度，再决定是否继续；这不会撤回已创建的候选，也不代表远端模型取消。关闭窗口到托盘不会结束页面，已有工作仍会运行。

保存任务显示为暂停时，先读取其建议，再选择 **Resume local queue**。恢复只解除本地队列暂停并重读状态，不发送模型请求或自动入队；之后仍需单独选择添加剩余建议。若恢复回执失败，先重读保存状态，避免盲目重复恢复。
