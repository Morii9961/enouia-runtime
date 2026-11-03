# UI v2 记忆详情与本地任务回执语言

基线：`b4ca035`。记忆详情的复制、纠正提议及取消删除确认说明保存消息键，到显示时翻译；本地历史任务 owner 的错误与回执保留文本 getter，随当前语言显示。原任务请求、键、子任务、缺失作业和确认权限保持原样，不在语言切换时重新创建或恢复。

实际验证：`memory-forget-focus` 20 项、`inspector-action-focus` 7 项、`history-task-owner` 16 项、`history-task-navigation` 16 项合成 DOM 断言通过。新增检查覆盖取消后同一记忆与按钮焦点仍保留、本地创建回执和两份原子任务在三语间保留、没有额外读取或写入。现有原键恢复、分页/任务选择、Vault 切换和迟到回执边界继续通过。

类型检查、i18n / history-tasks Node 14 项、Memory pin 检查及 `git diff --check` 通过。仅定向验证，未重跑整套或构建；未访问真实剪贴板、个人 Vault、模型或原生保存资料。
