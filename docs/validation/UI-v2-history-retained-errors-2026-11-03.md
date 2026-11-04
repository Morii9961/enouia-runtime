# UI v2 历史面板保留错误语言

基线：`fa277c1`。历史比较、来源简报、批次请求和保存结果四个独立面板保留原错误原因，在显示时按当前语言解析。错误标记、撤下的文本、确认权限、重试/恢复身份和待定请求不变，语言切换不重发读取或写入。

实际验证：`history-comparison` 24 项、`history-brief` 19 项、`history-results` 44 项、`history-batch-request` 44 项合成 DOM 断言通过。三语错误切换不恢复已撤下的来源/简报/确认，不增加比较、准备、发送或应用请求；相关原有迟到回执与原键恢复场景继续通过。

定向 Node（i18n、history-comparison、history-brief、history-results、history-batch）37 通过、3 跳过；跳过项是未提供真实 Core 输出的可选夹具。类型检查、Memory pin 检查及 `git diff --check` 通过。本片没有重新运行累计全套、构建、原生或人工验收，未读取个人 Vault 或调用真实 Provider。
