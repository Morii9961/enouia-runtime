# UI v2 操作观察错误语言

基线：`9667f8f`。操作观察失败保留原错误原因，在显示“无法读取操作”时按当前语言解析内层说明；不改变失败后的显式重读、操作身份、取消确认或终态规则。

扩展夹具在未修改产品代码时实际失败于中文内层错误检查；修复后 `operation-observation` 14 项通过，三语切换保留同一 Retry 控件及焦点、不重新观察或完成错误身份的操作。`operation-snapshot` 9 项、`operation-stop-observation` 32 项通过，覆盖错误快照、旧停止错误退休、取消回执与迟到结果。类型检查、i18n / operation-observation Node 16 项、Memory pin 及 diff 检查通过。

仅合成 DOM 与 IPC 验证；未运行完整套件、构建、原生或人工验收，也未发起真实操作、读取个人 Vault 或调用 Provider。
