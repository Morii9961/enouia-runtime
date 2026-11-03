# UI v2 保留错误随语言刷新

基线：`31a0c95`。`useAction` 与 `useLatestRead` 的失败对象保留原错误和重试闭包，通过 `text` getter 在显示时解析当前语言；不替换错误对象、重试闭包或原幂等键，不因语言切换重新提交。既有 `Failure` 接口及手工字符串错误兼容。

先用未修改的 hook 运行扩展 `candidate-conflict-focus`：27 项中，仅中文和日文的保留错误语言检查失败。修复后 27 项通过。另 `provider-confirmation` 12 项通过，覆盖实际 grant 确认丢失回执后的中英日错误、相同重试按钮、计划原文和焦点保留，后续三次显式确认/重试继续复用同一参数与键。`inbox-retry-ownership` 18 项、`operation-observation` 11 项通过。类型检查、根 Memory pin 检查与 `git diff --check` 通过。

这些是合成传输与 Happy DOM 证据。未运行完整套件、构建、原生或人工验收；未接触个人 Vault、真实授权或 Provider。
