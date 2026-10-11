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
